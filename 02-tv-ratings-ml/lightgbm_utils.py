"""LightGBM-specific helper functions for NFL TV ratings notebooks."""
import hashlib
import json
import os
import pickle
import re
import sys
from datetime import date
from pathlib import Path

import lightgbm as lgb
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns


def sanitize_feature_name(name):
    return re.sub(r'["\{\},:]', '_', name)


def enforce_feature_types(
    df, numerical_features, categorical_features, *,
    categorical_spec=None, verbose=True,
    for_lightgbm=True, cat_offset=1, missing_code=0,
):
    """Cast numerics to float; encode categoricals as int codes (for_lightgbm=True)
    or category dtype (for_lightgbm=False, needed for _build_cat_spec)."""
    df = df.copy()
    for col in numerical_features:
        if col in df.columns:
            try:
                df[col] = df[col].astype(float)
            except Exception as e:
                if verbose:
                    print(f"  Cannot cast '{col}' to float: {e}")
    for col in categorical_features:
        if col not in df.columns:
            continue
        try:
            if categorical_spec is not None and col in categorical_spec:
                cats = list(categorical_spec[col]['categories'])
                ordered = bool(categorical_spec[col].get('ordered', False))
                s = df[col].astype(pd.CategoricalDtype(categories=cats, ordered=ordered))
            else:
                s = df[col].astype('category')
            if for_lightgbm:
                codes = (s.cat.codes.astype('int32') + cat_offset).astype('int32')
                codes = codes.where(codes >= 0, missing_code)
                df[col] = codes
            else:
                df[col] = s
        except Exception as e:
            if verbose:
                print(f"  Cannot process categorical '{col}': {e}")
    return df


def feature_importance_plot(model, top_n=20, importance_type='gain', return_df=False):
    imp = model.feature_importance(importance_type=importance_type)
    names = model.feature_name()
    df_imp = (pd.DataFrame({'Feature': names, 'Importance': imp})
                .sort_values('Importance', ascending=False))
    plt.figure(figsize=(10, 8))
    sns.barplot(x='Importance', y='Feature', data=df_imp.head(top_n), color='steelblue')
    plt.title(f'Top {top_n} Feature Importances ({importance_type.capitalize()}) — LightGBM')
    plt.tight_layout()
    plt.show()
    if return_df:
        return df_imp


def generate_shap_summary_lgbm_fast(model, X_enc, max_display=20, seed=42):
    """SHAP beeswarm via LightGBM native pred_contrib (no TreeExplainer needed)."""
    np.random.seed(seed)
    raw = model.predict(X_enc, pred_contrib=True)   # (n, n_features+1)
    shap_vals = raw[:, :-1]
    feature_names = model.feature_name()

    mean_abs = np.abs(shap_vals).mean(axis=0)
    top_idx = np.argsort(mean_abs)[::-1][:max_display]
    shap_top = shap_vals[:, top_idx]
    feat_top = [feature_names[i] for i in top_idx]

    X_vals = X_enc.iloc[:, top_idx].values.astype(float)
    X_norm = np.zeros_like(X_vals)
    for j in range(X_vals.shape[1]):
        col = X_vals[:, j]
        valid = ~np.isnan(col)
        mn, mx = col[valid].min(), col[valid].max()
        X_norm[valid, j] = (col[valid] - mn) / (mx - mn) if mx > mn else 0.5

    fig, ax = plt.subplots(figsize=(10, max_display * 0.42 + 1.5))
    cmap = plt.cm.RdBu_r
    n_feats = len(feat_top)
    for j in range(n_feats):
        y = n_feats - 1 - j
        jitter = np.random.uniform(-0.35, 0.35, size=len(shap_top))
        ax.scatter(shap_top[:, j], y + jitter,
                   c=X_norm[:, j], cmap=cmap, vmin=0, vmax=1,
                   alpha=0.4, s=6, linewidths=0)
    ax.set_yticks(range(n_feats))
    ax.set_yticklabels(feat_top[::-1], fontsize=8)
    ax.axvline(0, color='black', linewidth=0.8)
    ax.set_xlabel('SHAP value (impact on model prediction)')
    ax.set_title(f'SHAP Summary — Top {n_feats} Features')
    sm = plt.cm.ScalarMappable(cmap=cmap, norm=plt.Normalize(0, 1))
    sm.set_array([])
    cbar = fig.colorbar(sm, ax=ax, pad=0.01)
    cbar.set_label('Feature value', fontsize=8)
    cbar.set_ticks([0, 1])
    cbar.set_ticklabels(['Low', 'High'])
    plt.tight_layout()
    plt.show()
    return shap_vals, feature_names


def extract_shap_contributions(model, single_obs_df, top_n=15):
    """SHAP breakdown for a single observation (regression path)."""
    raw = model.predict(single_obs_df, pred_contrib=True)
    shap_vals = raw[0, :-1]
    base_value = raw[0, -1]
    feature_names = model.feature_name()
    contrib_df = pd.DataFrame({
        'feature': feature_names,
        'shap_value': shap_vals,
        'abs_shap': np.abs(shap_vals),
        'feature_value': [single_obs_df.iloc[0].get(f, np.nan) for f in feature_names],
    }).sort_values('abs_shap', ascending=False)
    pred_sum = shap_vals.sum() + base_value
    print(f"Base value : {base_value:.4f}")
    print(f"Prediction : {pred_sum:.4f}")
    return contrib_df.head(top_n)[['feature', 'feature_value', 'shap_value']].reset_index(drop=True)


def _build_cat_spec(X_with_categories, categorical_features):
    spec = {}
    for col in categorical_features:
        if not isinstance(X_with_categories[col].dtype, pd.CategoricalDtype):
            raise TypeError(f"Column '{col}' is not dtype=category.")
        cat = X_with_categories[col].cat
        spec[col] = {'categories': list(cat.categories.astype(object)), 'ordered': bool(cat.ordered)}
    return spec


def _sha256_list(xs):
    m = hashlib.sha256()
    for x in xs:
        m.update(str(x).encode('utf-8'))
        m.update(b'|')
    return m.hexdigest()


def save_lightgbm_artifacts_v2(
    model, X_with_categories, categorical_features,
    output_directory, study_nickname='lightgbm_study', extra_metadata=None,
):
    """Save model, hyperparams, feature names, categorical spec, and env metadata."""
    os.makedirs(output_directory, exist_ok=True)
    tag = f"{study_nickname}_{date.today().strftime('%Y%m%d')}"
    out = {}

    mp = os.path.join(output_directory, f'lightgbm_model_{tag}.txt')
    model.save_model(mp); out['model'] = mp

    pp = os.path.join(output_directory, f'lightgbm_hyperparams_{tag}.json')
    with open(pp, 'w') as f:
        json.dump(getattr(model, 'params', {}), f, indent=2)
    out['config'] = pp

    fp = os.path.join(output_directory, f'lightgbm_featnames_{tag}.pkl')
    feature_names = X_with_categories.columns.tolist()
    with open(fp, 'wb') as f:
        pickle.dump(feature_names, f)
    out['feature_names'] = fp

    cp = os.path.join(output_directory, f'lightgbm_catfeatures_{tag}.json')
    with open(cp, 'w') as f:
        json.dump(list(categorical_features), f, indent=2)
    out['categorical_features'] = cp

    cat_spec = _build_cat_spec(X_with_categories, categorical_features)
    sp = os.path.join(output_directory, f'lightgbm_catspec_{tag}.json')
    with open(sp, 'w') as f:
        json.dump(cat_spec, f, indent=2)
    out['categorical_spec'] = sp

    env = {
        'python': sys.version.split()[0],
        'numpy': np.__version__, 'pandas': pd.__version__, 'lightgbm': lgb.__version__,
        'feature_names_sha256': _sha256_list(feature_names),
    }
    if extra_metadata:
        env.update(extra_metadata)
    ep = os.path.join(output_directory, f'lightgbm_env_{tag}.json')
    with open(ep, 'w') as f:
        json.dump(env, f, indent=2)
    out['env'] = ep

    print(f"Artifacts saved to {output_directory}/")
    for k, v in out.items():
        print(f"  {k}: {Path(v).name}")
    return out, cat_spec
