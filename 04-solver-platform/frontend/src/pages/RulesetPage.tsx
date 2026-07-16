import { useEffect, useRef, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import RulesGrid, {
  type RulesGridHandle,
} from "@/components/ruleset/RulesGrid";
import useRulesets from "@/hooks/useRulesets";
import useSaveRuleset from "@/hooks/useSaveRuleset";
import useUpdateRuleset from "@/hooks/useUpdateRuleset";
import useSeason from "@/hooks/useSeason";
import useTeams from "@/hooks/useTeams";
import useSeasonStore from "@/store/useSeasonStore";
import PrerequisiteGuard from "@/components/PrerequisiteGuard";
import type Rule from "@/entities/Rule";
import type Ruleset from "@/entities/Ruleset";
import {
  parseRulesetSheet,
  validateRuleRow,
  type RowValidationError,
} from "@/utils/validateRuleset";

// ── Status indicator ──────────────────────────────────────────────────────────

type PaneStatus = "none" | "dirty" | "wc_saved" | "snapshot_saved";

const StatusBadge = ({
  status,
  loadedName,
}: {
  status: PaneStatus;
  loadedName: string;
}) => {
  switch (status) {
    case "none":
      return <span className="text-sm text-slate-400">No ruleset loaded</span>;
    case "dirty":
      return (
        <span className="text-sm text-orange-500 font-medium">
          ● {loadedName} · unsaved changes
        </span>
      );
    case "wc_saved":
      return (
        <span className="text-sm text-blue-600 font-medium">
          ● Working copy saved · snapshot not yet saved
        </span>
      );
    case "snapshot_saved":
      return (
        <span className="text-sm text-green-600 font-medium">
          ● Immutable snapshot saved
        </span>
      );
  }
};

// ── Overwrite dialog ──────────────────────────────────────────────────────────

interface OverwriteDialogProps {
  target: { name: string; feasibility_status: "feasible" | "infeasible" | null };
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const OverwriteDialog = ({
  target,
  isPending,
  onConfirm,
  onCancel,
}: OverwriteDialogProps) => {
  const reason =
    target.feasibility_status === "infeasible"
      ? "was marked infeasible"
      : "has never been run";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full flex flex-col gap-4">
        <h2 className="text-base font-bold text-slate-800">Overwrite Snapshot</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Snapshot <span className="font-semibold">"{target.name}"</span> {reason} and has
          produced no solutions. Replace its rules with the current working set?
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-500 disabled:opacity-50"
          >
            {isPending ? "Overwriting…" : "Overwrite"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Evergreen dialog ──────────────────────────────────────────────────────────

interface EvergreenDialogProps {
  name: string;
  onChange: (v: string) => void;
  error: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const EvergreenDialog = ({
  name,
  onChange,
  error,
  isPending,
  onConfirm,
  onCancel,
}: EvergreenDialogProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full flex flex-col gap-4">
      <h2 className="text-base font-bold text-slate-800">
        Save as Evergreen Ruleset
      </h2>
      <p className="text-sm text-slate-600 leading-relaxed">
        Evergreen rulesets are intended to contain only rules that are
        transferable from season to season. They are not tied to any specific
        season and will appear in the Load dropdown for all seasons. Do you wish
        to proceed?
      </p>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          Evergreen Name
        </label>
        <input
          value={name}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. NFL Baseline Rules"
          className="w-full text-sm border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-500"
          autoFocus
        />
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={!name.trim() || isPending}
          className="px-3 py-1.5 text-sm bg-green-700 text-white rounded hover:bg-green-600 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save as Evergreen"}
        </button>
      </div>
    </div>
  </div>
);

// ── Page ──────────────────────────────────────────────────────────────────────

const RulesetPage = () => {
  const { selectedSeason } = useSeasonStore();
  const { data: rulesets } = useRulesets(selectedSeason);
  const { data: season } = useSeason(selectedSeason);
  const { data: teams } = useTeams(selectedSeason);

  const saveMutation = useSaveRuleset(selectedSeason);
  const updateMutation = useUpdateRuleset(selectedSeason);

  const numWeeks = season?.num_weeks ?? 18;
  const configuredSlots = season?.slots ?? [];

  const defaultTeams = useMemo(
    () =>
      [...(teams ?? [])]
        .sort((a, b) => a.abbreviation.localeCompare(b.abbreviation))
        .map((t) => t.abbreviation)
        .join(","),
    [teams],
  );

  const teamAbbreviations = useMemo(
    () => new Set((teams ?? []).map((t) => t.abbreviation.toUpperCase())),
    [teams],
  );

  // ── Derived ruleset groups ──────────────────────────────────────────────────

  const workingCopy = useMemo(
    () => rulesets?.find((r) => !r.is_snapshot && r.season_id !== null),
    [rulesets],
  );
  const seasonSnapshots = useMemo(
    () => (rulesets ?? []).filter((r) => r.is_snapshot && r.season_id !== null),
    [rulesets],
  );
  const evergreens = useMemo(
    () => (rulesets ?? []).filter((r) => r.season_id === null),
    [rulesets],
  );

  // ── Editing pane state ──────────────────────────────────────────────────────

  const rulesGridRef = useRef<RulesGridHandle>(null);

  const [rows, setRows] = useState<Rule[]>([]);
  const [loadedRulesetId, setLoadedRulesetId] = useState<string | null>(null);
  const [loadedName, setLoadedName] = useState("");
  const [status, setStatus] = useState<PaneStatus>("none");
  const autoLoadedRef = useRef(false);

  useEffect(() => {
    if (autoLoadedRef.current) return;
    if (rulesets === undefined) return;
    autoLoadedRef.current = true;
    if (workingCopy) {
      setRows(workingCopy.rules);
      setLoadedRulesetId(workingCopy.ruleset_id);
      setLoadedName("Working Copy");
      setStatus("wc_saved");
    }
  }, [rulesets, workingCopy]);

  // ── Snapshot / evergreen form state ────────────────────────────────────────

  const [snapshotName, setSnapshotName] = useState("");
  const [snapshotDesc, setSnapshotDesc] = useState("");
  const [snapshotError, setSnapshotError] = useState("");

  const [showEvergreen, setShowEvergreen] = useState(false);
  const [evergreenName, setEvergreenName] = useState("");
  const [evergreenError, setEvergreenError] = useState("");

  // ── Overwrite state (for infeasible / never-run snapshots) ─────────────────

  const [overwriteTarget, setOverwriteTarget] = useState<Ruleset | null>(null);
  const [overwritePendingRows, setOverwritePendingRows] = useState<Rule[]>([]);

  // ── Upload / save validation state ─────────────────────────────────────────

  const [uploadErrors, setUploadErrors] = useState<RowValidationError[]>([]);
  const [saveErrors, setSaveErrors] = useState<RowValidationError[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Collect rows from grid and validate; returns { valid, currentRows }
  const collectAndValidate = (): { valid: boolean; currentRows: Rule[] } => {
    const currentRows = rulesGridRef.current?.collectRows() ?? [];
    const errors: RowValidationError[] = [];
    currentRows.forEach((row, i) => {
      errors.push(
        ...validateRuleRow(
          row,
          i + 1,
          configuredSlots,
          numWeeks,
          teamAbbreviations,
        ),
      );
    });
    setSaveErrors(errors.slice(0, 30));
    return { valid: errors.length === 0, currentRows };
  };

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleLoad = (rulesetId: string) => {
    if (!rulesetId) return;
    const rs = rulesets?.find((r) => r.ruleset_id === rulesetId);
    if (!rs) return;
    setRows(rs.rules);
    setLoadedRulesetId(rs.ruleset_id);
    setLoadedName(rs.is_snapshot ? rs.name : "Working Copy");
    setStatus("dirty");
    setSaveErrors([]);
  };

  const handleDirty = () => {
    if (status !== "none") setStatus("dirty");
    setSaveErrors([]);
  };

  const handleSaveWorkingCopy = () => {
    if (!season) return;
    const { valid, currentRows } = collectAndValidate();
    if (!valid) return;
    if (workingCopy) {
      updateMutation.mutate(
        { ruleset_id: workingCopy.ruleset_id, rules: currentRows },
        { onSuccess: () => setStatus("wc_saved") },
      );
    } else {
      saveMutation.mutate(
        {
          season_id: season.season_id,
          name: "Working Copy",
          description: undefined,
          parent_ruleset_id: null,
          is_snapshot: false,
          rules: currentRows,
        },
        { onSuccess: () => setStatus("wc_saved") },
      );
    }
  };

  const handleConfirmOverwrite = () => {
    if (!overwriteTarget) return;
    updateMutation.mutate(
      { ruleset_id: overwriteTarget.ruleset_id, rules: overwritePendingRows, force_overwrite: true },
      {
        onSuccess: () => {
          setStatus("snapshot_saved");
          setOverwriteTarget(null);
          setSnapshotName("");
          setSnapshotDesc("");
          setEvergreenName("");
        },
        onError: (err: Error) => {
          setSnapshotError(err.message ?? "Overwrite failed");
          setOverwriteTarget(null);
        },
      },
    );
  };

  const handleSaveSnapshot = () => {
    if (!season || !snapshotName.trim()) return;
    const { valid, currentRows } = collectAndValidate();
    if (!valid) return;
    const nameTrimmed = snapshotName.trim();
    const existing = seasonSnapshots.find(
      (r) => r.name.toLowerCase() === nameTrimmed.toLowerCase(),
    );
    if (existing) {
      if (existing.feasibility_status !== "feasible") {
        setOverwriteTarget(existing);
        setOverwritePendingRows(currentRows);
        return;
      }
      setSnapshotError(
        `A snapshot named "${nameTrimmed}" already exists for this season.`,
      );
      return;
    }
    setSnapshotError("");
    saveMutation.mutate(
      {
        season_id: season.season_id,
        name: nameTrimmed,
        description: snapshotDesc || undefined,
        parent_ruleset_id: loadedRulesetId,
        is_snapshot: true,
        rules: currentRows,
      },
      {
        onSuccess: () => {
          setStatus("snapshot_saved");
          setSnapshotName("");
          setSnapshotDesc("");
        },
        onError: (err: Error) => {
          setSnapshotError(err.message ?? "Error saving snapshot");
        },
      },
    );
  };

  const handleSaveEvergreen = () => {
    const nameTrimmed = evergreenName.trim();
    if (!nameTrimmed) return;
    const { valid, currentRows } = collectAndValidate();
    if (!valid) return;
    const existingEg = evergreens.find(
      (r) => r.name.toLowerCase() === nameTrimmed.toLowerCase(),
    );
    if (existingEg) {
      if (existingEg.feasibility_status !== "feasible") {
        setOverwriteTarget(existingEg);
        setOverwritePendingRows(currentRows);
        setShowEvergreen(false);
        return;
      }
      setEvergreenError(
        `An evergreen ruleset named "${nameTrimmed}" already exists.`,
      );
      return;
    }
    setEvergreenError("");
    saveMutation.mutate(
      {
        season_id: null,
        name: nameTrimmed,
        description: undefined,
        parent_ruleset_id: null,
        is_snapshot: true,
        rules: currentRows,
      },
      {
        onSuccess: () => {
          setStatus("snapshot_saved");
          setShowEvergreen(false);
          setEvergreenName("");
        },
        onError: (err: Error) => {
          setEvergreenError(err.message ?? "Error saving evergreen");
        },
      },
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target!.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const ws = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
      const { rules, errors } = parseRulesetSheet(
        raw as unknown[][],
        configuredSlots,
        numWeeks,
        teamAbbreviations,
      );
      if (errors.length > 0) {
        setUploadErrors(errors.slice(0, 30));
      } else {
        setUploadErrors([]);
        setRows(rules);
        setLoadedRulesetId(null);
        setLoadedName("Uploaded file");
        setStatus("dirty");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // ── Download handler ────────────────────────────────────────────────────────

  const handleDownload = async () => {
    const currentRows = rulesGridRef.current?.collectRows() ?? [];
    const headers = [
      "Active",
      "Operator",
      "Games",
      "Weeks",
      "WeekStart",
      "WeekEnd",
      "Slot",
      "Penalty",
      "ConstraintType",
      "hard_slack",
      "PenaltyCap",
      "Comment",
      "SlackBound",
      "TI",
      "Teams",
    ];
    const data = currentRows.map((r) => [
      r.active,
      r.operator,
      r.games,
      r.weeks,
      r.week_start,
      r.week_end,
      r.slot,
      r.penalty,
      r.constraint_type,
      r.hard,
      r.penalty_cap,
      r.comment,
      r.slack_bound,
      r.ti,
      r.teams,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rules");
    const safeName = (loadedName || "draft").replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `ruleset_${selectedSeason}_${safeName}.xlsx`;
    const bytes = XLSX.write(wb, {
      type: "array",
      bookType: "xlsx",
    }) as ArrayBuffer;
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    // Try the native Save dialog (Chrome/Edge); fall back to auto-download
    if ("showSaveFilePicker" in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: "Excel Workbook",
              accept: {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
                  [".xlsx"],
              },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return; // user cancelled
        // other error: fall through to anchor download
      }
    }

    // Fallback: trigger browser download to default Downloads folder
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isPending = saveMutation.isPending || updateMutation.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PrerequisiteGuard
      met={!!selectedSeason}
      message="Select a season before editing rulesets."
    >
      <div className="flex flex-col gap-4">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900">
              Ruleset · {selectedSeason}
            </h1>
            <StatusBadge status={status} loadedName={loadedName} />
          </div>

          <div className="flex items-center gap-2">
            <select
              defaultValue=""
              onChange={(e) => {
                handleLoad(e.target.value);
                e.target.value = "";
              }}
              className="text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none"
            >
              <option value="">Load ruleset…</option>
              {workingCopy && (
                <option value={workingCopy.ruleset_id}>Working Copy</option>
              )}
              {seasonSnapshots.length > 0 && (
                <optgroup label={`${selectedSeason} Snapshots`}>
                  {seasonSnapshots.map((rs) => (
                    <option key={rs.ruleset_id} value={rs.ruleset_id}>
                      {rs.name}{rs.feasibility_status === "infeasible" ? " ⚠ infeasible" : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              {evergreens.length > 0 && (
                <optgroup label="── Evergreen ──">
                  {evergreens.map((rs) => (
                    <option key={rs.ruleset_id} value={rs.ruleset_id}>
                      {rs.name}{rs.feasibility_status === "infeasible" ? " ⚠ infeasible" : ""}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50"
            >
              Upload XLSX
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={status === "none"}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40"
            >
              Download XLSX
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Upload errors */}
        {uploadErrors.length > 0 && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <p className="font-semibold mb-1">
              Upload failed. Fix errors and re-upload:
            </p>
            <ul className="list-disc list-inside space-y-0.5">
              {uploadErrors.map((e, i) => (
                <li key={i}>
                  Row {e.row} [{e.field}]: {e.message}
                </li>
              ))}
            </ul>
            {uploadErrors.length === 30 && (
              <p className="mt-1 italic">…(showing first 30 errors)</p>
            )}
          </div>
        )}

        {/* Save validation errors */}
        {saveErrors.length > 0 && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <p className="font-semibold mb-1">
              Cannot save. Fix validation errors first:
            </p>
            <ul className="list-disc list-inside space-y-0.5">
              {saveErrors.map((e, i) => (
                <li key={i}>
                  Row {e.row} [{e.field}]: {e.message}
                </li>
              ))}
            </ul>
            {saveErrors.length === 30 && (
              <p className="mt-1 italic">…(showing first 30 errors)</p>
            )}
          </div>
        )}

        {/* Snapshot save bar */}
        <div className="flex gap-3 items-end border-b border-slate-100 pb-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Snapshot Name
            </label>
            <input
              value={snapshotName}
              onChange={(e) => {
                setSnapshotName(e.target.value);
                setSnapshotError("");
              }}
              placeholder="e.g. 2025 Base Rules"
              className="w-full text-sm border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Description
            </label>
            <input
              value={snapshotDesc}
              onChange={(e) => setSnapshotDesc(e.target.value)}
              placeholder="Optional description"
              className="w-full text-sm border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>
          <button
            onClick={handleSaveWorkingCopy}
            disabled={isPending}
            className="px-3 py-1.5 text-sm bg-slate-800 text-white rounded hover:bg-slate-700 disabled:opacity-50 whitespace-nowrap"
          >
            {updateMutation.isPending ? "Saving…" : "Save Working Copy"}
          </button>
          <button
            onClick={handleSaveSnapshot}
            disabled={isPending || !snapshotName.trim()}
            className="px-3 py-1.5 text-sm bg-green-700 text-white rounded hover:bg-green-600 disabled:opacity-50 whitespace-nowrap"
          >
            {saveMutation.isPending ? "Saving…" : "Save as Snapshot"}
          </button>
        </div>

        {snapshotError && (
          <p className="text-red-500 text-xs -mt-2">{snapshotError}</p>
        )}

        {/* Rules grid */}
        <RulesGrid
          ref={rulesGridRef}
          rows={rows}
          onDirty={handleDirty}
          defaultTeams={defaultTeams}
          numWeeks={numWeeks}
        />

        {/* Bottom bar */}
        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => {
              setShowEvergreen(true);
              setEvergreenError("");
            }}
            className="px-3 py-1.5 text-xs border border-slate-300 text-slate-600 rounded hover:bg-slate-50"
          >
            Save as Evergreen…
          </button>
        </div>
      </div>

      {/* Evergreen dialog (rendered outside flex container so it overlays correctly) */}
      {showEvergreen && (
        <EvergreenDialog
          name={evergreenName}
          onChange={(v) => {
            setEvergreenName(v);
            setEvergreenError("");
          }}
          error={evergreenError}
          isPending={saveMutation.isPending}
          onConfirm={handleSaveEvergreen}
          onCancel={() => {
            setShowEvergreen(false);
            setEvergreenName("");
            setEvergreenError("");
          }}
        />
      )}

      {overwriteTarget && (
        <OverwriteDialog
          target={overwriteTarget}
          isPending={updateMutation.isPending}
          onConfirm={handleConfirmOverwrite}
          onCancel={() => setOverwriteTarget(null)}
        />
      )}
    </PrerequisiteGuard>
  );
};

export default RulesetPage;
