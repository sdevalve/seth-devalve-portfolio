"""Shared post-training analysis utilities for NFL TV ratings MLP notebooks."""
import numpy as np
import matplotlib.pyplot as plt
from sklearn.metrics import r2_score

from MLP_core import mse_loss


def run_permutation_importance(predict_fn, X_val, y_val, feature_groups, n_repeats=5):
    """
    Column-shuffle permutation importance.

    For each group, shuffles those columns of X_val across samples (preserving
    within-group correlations) and measures the mean increase in MSE vs the
    baseline. A large positive delta means those features matter.

    predict_fn    : callable (X: ndarray shape (m, n)) -> predictions shape (1, m)
    X_val         : (m, n_features) validation matrix, row-major
    y_val         : (m,) target values
    feature_groups: dict {group_name: list_of_column_indices}
    n_repeats     : number of shuffle repeats to average

    Returns
    -------
    group_deltas : dict {group_name: mean_delta_mse}
    L_base       : float  baseline val MSE
    """
    # Baseline val MSE
    AL_base = predict_fn(X_val)
    L_base  = mse_loss(AL_base, y_val)

    # ------------ Group permutation ------------
    group_deltas = {}
    for group_name, col_idxs in feature_groups.items():
        rep_deltas = []
        for _ in range(n_repeats):
            perm_va  = X_val.copy()
            perm_idx = np.random.permutation(len(X_val))
            perm_va[:, col_idxs] = X_val[perm_idx][:, col_idxs]
            AL_p = predict_fn(perm_va)
            rep_deltas.append(mse_loss(AL_p, y_val) - L_base)
        group_deltas[group_name] = np.mean(rep_deltas)

    return group_deltas, L_base


def plot_subset_r2(y_true, y_pred, group_labels, title='', figsize=(10, 8), min_n=10):
    """
    Bar chart of R² broken down by a categorical grouping variable.

    y_true        : array-like of true target values (original scale)
    y_pred        : array-like of predicted values (original scale)
    group_labels  : array-like of group label per row (same length as y_true)
    title         : chart title
    figsize       : matplotlib figure size
    min_n         : minimum group size to include in chart
    """
    y_true  = np.asarray(y_true)
    y_pred  = np.asarray(y_pred)
    labels  = np.asarray(group_labels)
    rows = []
    for grp in np.unique(labels):
        mask = labels == grp
        if mask.sum() < min_n:
            continue
        r2 = r2_score(y_true[mask], y_pred[mask])
        rows.append({'group': str(grp), 'r2': r2, 'n': int(mask.sum())})
    gdf = sorted(rows, key=lambda x: x['r2'])

    fig, ax = plt.subplots(figsize=figsize)
    groups = [r['group'] for r in gdf]
    r2s    = [r['r2']    for r in gdf]
    colors = ['tomato' if v < 0 else 'steelblue' for v in r2s]
    ax.barh(groups, r2s, color=colors)
    ax.axvline(0, color='black', linewidth=0.8)
    ax.set_xlabel('R²')
    ax.set_title(title or 'Subset R²')
    plt.tight_layout()
    plt.show()
    return fig


def plot_actual_vs_predicted(y_true, y_pred, title=''):
    # -- Actual vs Predicted (Validation Set) ----------------------------------
    val_r2   = r2_score(y_true, y_pred)
    val_rmse = np.sqrt(np.mean((y_true - y_pred) ** 2))

    print('=' * 50)
    print(f'  Val R²        : {val_r2:.4f}  (raw scale)')
    if np.all(y_pred > -1):
        val_r2_log = r2_score(np.log1p(y_true), np.log1p(y_pred))
        print(f'  Val R² (log)  : {val_r2_log:.4f}  (log1p scale)')
    else:
        n_neg = int(np.sum(y_pred <= -1))
        print(f'  Val R² (log)  : n/a  ({n_neg} predictions <= -1, log undefined)')
    print(f'  Val RMSE      : {val_rmse:.2f}')


    # -- scatter plot ----------------------------------------------------------
    fig, ax = plt.subplots(figsize=(7, 6))
    ax.scatter(y_true, y_pred, alpha=0.15, s=4, color='steelblue')
    lo = min(y_true.min(), y_pred.min())
    hi = max(y_true.max(), y_pred.max())
    ax.plot([lo, hi], [lo, hi], 'r--', linewidth=1)
    ax.set_xlabel('Actual Ratings')
    ax.set_ylabel('Predicted Ratings (Val)')
    ax.set_title(f'{title}  Val R²={val_r2:.4f}' if title else f'Actual vs Predicted — Val R²={val_r2:.4f}')
    plt.tight_layout()
    # plt.show()
    plt.close(fig)
    return fig
