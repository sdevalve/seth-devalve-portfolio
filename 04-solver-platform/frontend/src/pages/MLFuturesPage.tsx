import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import useSeasonStore from "@/store/useSeasonStore";
import PrerequisiteGuard from "@/components/PrerequisiteGuard";
import useTeams from "@/hooks/useTeams";
import useSeason from "@/hooks/useSeason";
import useMLFutures from "@/hooks/useMLFutures";
import useSaveMLFutures from "@/hooks/useSaveMLFutures";
import type Team from "@/entities/Team";

// ── Types ─────────────────────────────────────────────────────────────────────

type PlayoffEntry = { make: string; miss: string };

interface FuturesState {
  playoffs: Record<string, PlayoffEntry>;
  wintotals: Record<string, string>;
  division_odds: Record<string, string>;
  conference_odds: Record<string, string>;
  superbowl_odds: Record<string, string>;
}

type SimpleSection =
  | "wintotals"
  | "division_odds"
  | "conference_odds"
  | "superbowl_odds";

interface DivGroup {
  division: string;
  teams: Team[];
}
interface ConfGroup {
  conference: string;
  divisions: DivGroup[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DIV_ORDER = ["West", "North", "South", "East"] as const;
const ACCEPTED_SHEETS = [
  "playoffs",
  "wintotals",
  "division",
  "conference",
  "superbowl",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupTeams(teams: Team[]): ConfGroup[] {
  return ["AFC", "NFC"].map((conf) => ({
    conference: conf,
    divisions: DIV_ORDER.map((div) => ({
      division: div,
      teams: teams
        .filter((t) => t.conference === conf && t.division === div)
        .sort((a, b) => a.abbreviation.localeCompare(b.abbreviation)),
    })),
  }));
}

function emptyState(teams: Team[]): FuturesState {
  const emptyPlay = Object.fromEntries(
    teams.map((t) => [t.abbreviation, { make: "", miss: "" }]),
  );
  const emptyNum = Object.fromEntries(teams.map((t) => [t.abbreviation, ""]));
  return {
    playoffs: emptyPlay,
    wintotals: { ...emptyNum },
    division_odds: { ...emptyNum },
    conference_odds: { ...emptyNum },
    superbowl_odds: { ...emptyNum },
  };
}

// ── XLSX parsing ──────────────────────────────────────────────────────────────

interface ParseResult {
  updates: Partial<FuturesState>;
  unknownSheets: string[];
  unrecognizedTeams: string[];
}

function getField(row: Record<string, unknown>, field: string): unknown {
  const key = Object.keys(row).find(
    (k) => k.trim().toLowerCase() === field.toLowerCase(),
  );
  return key ? row[key] : undefined;
}

function parseXLSX(
  buffer: ArrayBuffer,
  abbrevLookup: Record<string, string>,
): ParseResult {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const unknownSheets = wb.SheetNames.filter(
    (n) => !ACCEPTED_SHEETS.includes(n.toLowerCase()),
  );
  const unrecognized = new Set<string>();
  const updates: Partial<FuturesState> = {};

  function findRows(name: string) {
    const key = wb.SheetNames.find((n) => n.toLowerCase() === name);
    return key
      ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[key])
      : null;
  }

  function resolveAbbr(raw: unknown): string | null {
    const s = String(raw ?? "").trim();
    if (!s) return null;
    const canonical = abbrevLookup[s.toLowerCase()];
    if (!canonical) {
      unrecognized.add(s.toUpperCase());
      return null;
    }
    return canonical;
  }

  const strVal = (raw: unknown) =>
    raw != null && String(raw) !== "" ? String(raw) : "";

  // playoffs: Team | Make | Miss
  const playoffRows = findRows("playoffs");
  if (playoffRows) {
    const playoffs: Record<string, PlayoffEntry> = {};
    for (const row of playoffRows) {
      const abbr = resolveAbbr(getField(row, "team"));
      if (!abbr) continue;
      playoffs[abbr] = {
        make: strVal(getField(row, "make")),
        miss: strVal(getField(row, "miss")),
      };
    }
    if (Object.keys(playoffs).length > 0) updates.playoffs = playoffs;
  }

  // simple sheets: Team | Value
  const simpleMap: [string, SimpleSection][] = [
    ["wintotals", "wintotals"],
    ["division", "division_odds"],
    ["conference", "conference_odds"],
    ["superbowl", "superbowl_odds"],
  ];
  for (const [sheetName, stateKey] of simpleMap) {
    const rows = findRows(sheetName);
    if (!rows) continue;
    const section: Record<string, string> = {};
    for (const row of rows) {
      const abbr = resolveAbbr(getField(row, "team"));
      if (!abbr) continue;
      section[abbr] = strVal(getField(row, "value"));
    }
    if (Object.keys(section).length > 0) updates[stateKey] = section;
  }

  return { updates, unknownSheets, unrecognizedTeams: [...unrecognized] };
}

// ── Shared input style ────────────────────────────────────────────────────────

const inputCls =
  "w-24 text-right px-1.5 py-0.5 border border-slate-300 rounded text-sm tabular-nums " +
  "focus:outline-none focus:ring-1 focus:ring-sky-400";

// ── Section: Playoffs ─────────────────────────────────────────────────────────

const PlayoffsSection = ({
  grouped,
  state,
  onChange,
}: {
  grouped: ConfGroup[];
  state: Record<string, PlayoffEntry>;
  onChange: (abbr: string, field: "make" | "miss", val: string) => void;
}) => (
  <div className="grid grid-cols-2 gap-6">
    {grouped.map(({ conference, divisions }) => (
      <div key={conference}>
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
          {conference}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {divisions.map(({ division, teams }) => (
            <div key={division} className="border border-slate-200 rounded">
              <div className="px-3 py-1.5 bg-slate-700 text-white text-sm font-semibold rounded-t">
                {division}
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 border-b border-slate-200">
                <span className="w-8 shrink-0" />
                <span className="w-24 text-xs text-slate-400 text-right">Make</span>
                <span className="w-24 text-xs text-slate-400 text-right">Miss</span>
              </div>
              {teams.map((t, i) => (
                <div
                  key={t.team_id}
                  className={`flex items-center gap-2 px-3 py-1.5 ${i % 2 === 0 ? "bg-white" : "bg-slate-50"}`}
                >
                  <span className="font-mono text-sm text-slate-700 font-medium w-8 shrink-0">
                    {t.abbreviation}
                  </span>
                  <input
                    type="number"
                    step="1"
                    className={inputCls}
                    value={state[t.abbreviation]?.make ?? ""}
                    onChange={(e) => onChange(t.abbreviation, "make", e.target.value)}
                  />
                  <input
                    type="number"
                    step="1"
                    className={inputCls}
                    value={state[t.abbreviation]?.miss ?? ""}
                    onChange={(e) => onChange(t.abbreviation, "miss", e.target.value)}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

// ── Section: Win Totals ───────────────────────────────────────────────────────

const WinTotalsSection = ({
  grouped,
  state,
  onChange,
  maxWT,
}: {
  grouped: ConfGroup[];
  state: Record<string, string>;
  onChange: (abbr: string, val: string) => void;
  maxWT: number;
}) => (
  <div className="grid grid-cols-2 gap-6">
    {grouped.map(({ conference, divisions }) => {
      const allTeams = divisions
        .flatMap((d) => d.teams)
        .sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));
      return (
        <div key={conference}>
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
            {conference}
          </h3>
          <div className="border border-slate-200 rounded overflow-hidden">
            {allTeams.map((t, i) => (
              <div
                key={t.team_id}
                className={`flex items-center gap-3 px-3 py-1.5 ${i % 2 === 0 ? "bg-white" : "bg-slate-50"}`}
              >
                <span className="font-mono text-sm text-slate-700 font-medium w-8 shrink-0">
                  {t.abbreviation}
                </span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max={maxWT}
                  className={inputCls}
                  value={state[t.abbreviation] ?? ""}
                  onChange={(e) => onChange(t.abbreviation, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      );
    })}
  </div>
);

// ── Section: Division Odds ────────────────────────────────────────────────────

const DivisionOddsSection = ({
  grouped,
  state,
  onChange,
}: {
  grouped: ConfGroup[];
  state: Record<string, string>;
  onChange: (abbr: string, val: string) => void;
}) => (
  <div className="grid grid-cols-2 gap-6">
    {grouped.map(({ conference, divisions }) => (
      <div key={conference}>
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
          {conference}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {divisions.map(({ division, teams }) => (
            <div
              key={`${conference}-${division}`}
              className="border border-slate-200 rounded"
            >
              <div className="px-3 py-1.5 bg-slate-700 text-white text-sm font-semibold rounded-t">
                {division}
              </div>
              <div className="p-2 space-y-1">
                {teams.map((t) => (
                  <div key={t.team_id} className="flex items-center gap-3">
                    <span className="font-mono text-sm text-slate-700 font-medium w-8 shrink-0">
                      {t.abbreviation}
                    </span>
                    <input
                      type="number"
                      step="1"
                      className={inputCls}
                      value={state[t.abbreviation] ?? ""}
                      onChange={(e) => onChange(t.abbreviation, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

// ── Section: Conference Odds ──────────────────────────────────────────────────

const ConferenceOddsSection = ({
  grouped,
  state,
  onChange,
}: {
  grouped: ConfGroup[];
  state: Record<string, string>;
  onChange: (abbr: string, val: string) => void;
}) => (
  <div className="grid grid-cols-2 gap-6">
    {grouped.map(({ conference, divisions }) => {
      const allTeams = divisions
        .flatMap((d) => d.teams)
        .sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));
      return (
        <div key={conference}>
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
            {conference}
          </h3>
          <div className="border border-slate-200 rounded overflow-hidden">
            {allTeams.map((t, i) => (
              <div
                key={t.team_id}
                className={`flex items-center gap-3 px-3 py-1.5 ${
                  i % 2 === 0 ? "bg-white" : "bg-slate-50"
                }`}
              >
                <span className="font-mono text-sm text-slate-700 font-medium w-8 shrink-0">
                  {t.abbreviation}
                </span>
                <input
                  type="number"
                  step="1"
                  className={inputCls}
                  value={state[t.abbreviation] ?? ""}
                  onChange={(e) => onChange(t.abbreviation, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      );
    })}
  </div>
);

// ── Section: Super Bowl Odds ──────────────────────────────────────────────────

const SuperBowlOddsSection = ({
  grouped,
  state,
  onChange,
}: {
  grouped: ConfGroup[];
  state: Record<string, string>;
  onChange: (abbr: string, val: string) => void;
}) => (
  <div className="grid grid-cols-2 gap-6">
    {grouped.map(({ conference, divisions }) => {
      const allTeams = divisions
        .flatMap((d) => d.teams)
        .sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));
      return (
        <div key={conference}>
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
            {conference}
          </h3>
          <div className="border border-slate-200 rounded overflow-hidden">
            {allTeams.map((t, i) => (
              <div
                key={t.team_id}
                className={`flex items-center gap-3 px-3 py-1.5 ${
                  i % 2 === 0 ? "bg-white" : "bg-slate-50"
                }`}
              >
                <span className="font-mono text-sm text-slate-700 font-medium w-8 shrink-0">
                  {t.abbreviation}
                </span>
                <input
                  type="number"
                  step="1"
                  className={inputCls}
                  value={state[t.abbreviation] ?? ""}
                  onChange={(e) => onChange(t.abbreviation, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      );
    })}
  </div>
);

// ── Format instructions (collapsible) ────────────────────────────────────────

const FormatInstructions = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <span>XLSX Upload Format</span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 text-slate-600 space-y-2 border-t border-slate-200">
          <p>
            Create an .xlsx file with up to 5 named sheets (case-insensitive).
            Sheets not present are skipped silently. Unrecognized sheet names
            trigger a warning. Uploaded values{" "}
            <span className="font-medium">merge</span> into current state
            (fields already entered and not present in the upload are not
            overwritten).
          </p>
          <table className="border-collapse w-full mt-1">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-200 px-2 py-1 text-left font-semibold">
                  Sheet
                </th>
                <th className="border border-slate-200 px-2 py-1 text-left font-semibold">
                  Col A: Team
                </th>
                <th className="border border-slate-200 px-2 py-1 text-left font-semibold">
                  Col B: Make / Value
                </th>
                <th className="border border-slate-200 px-2 py-1 text-left font-semibold">
                  Col C: Miss
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "playoffs",
                  "Abbreviation",
                  "Make odds (integer)",
                  "Miss odds (integer)",
                ],
                ["wintotals", "Abbreviation", "Win total (float)", "—"],
                ["division", "Abbreviation", "Division odds (integer)", "—"],
                [
                  "conference",
                  "Abbreviation",
                  "Conference odds (integer)",
                  "—",
                ],
                ["superbowl", "Abbreviation", "Super Bowl odds (integer)", "—"],
              ].map(([sheet, ...cols]) => (
                <tr key={sheet}>
                  <td className="border border-slate-200 px-2 py-1 font-mono">
                    {sheet}
                  </td>
                  {cols.map((c, i) => (
                    <td
                      key={i}
                      className="border border-slate-200 px-2 py-1 text-slate-500"
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-slate-500">
            Row 1 = headers (Team / Make / Miss / Value). Data entry should
            begin on row 2. Teams should be entered as one of [mascot,
            abbreviation, city]. Odds are plain integers, ie: positive (e.g. 150
            means +150) or negative (e.g. −150).
          </p>
        </div>
      )}
    </div>
  );
};

// ── Section heading ───────────────────────────────────────────────────────────

const SectionHeading = ({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) => (
  <div className="border-b border-slate-200 pb-1">
    <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
      {title}
    </h2>
    {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
  </div>
);

// ── Main page ─────────────────────────────────────────────────────────────────

const MLFuturesPage = () => {
  const { selectedSeason } = useSeasonStore();
  const { data: season } = useSeason(selectedSeason);
  const { data: teams } = useTeams(selectedSeason);
  const { data: existingFutures } = useMLFutures(selectedSeason);
  const saveMutation = useSaveMLFutures(selectedSeason);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<FuturesState>({
    playoffs: {},
    wintotals: {},
    division_odds: {},
    conference_odds: {},
    superbowl_odds: {},
  });
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [xlsxWarnings, setXlsxWarnings] = useState<string[]>([]);

  // ── Initialize state from teams + saved data ──────────────────────────────

  useEffect(() => {
    if (!teams?.length) return;
    const base = emptyState(teams);
    if (existingFutures) {
      const f = existingFutures;
      if (f.playoffs) {
        for (const [a, v] of Object.entries(f.playoffs)) {
          if (a in base.playoffs)
            base.playoffs[a] = {
              make: v.make !== null ? String(v.make) : "",
              miss: v.miss !== null ? String(v.miss) : "",
            };
        }
      }
      for (const key of [
        "wintotals",
        "division_odds",
        "conference_odds",
        "superbowl_odds",
      ] as const) {
        if (f[key]) {
          for (const [a, v] of Object.entries(f[key]!)) {
            if (a in base[key]) base[key][a] = v !== null ? String(v) : "";
          }
        }
      }
    }
    setState(base);
  }, [teams, existingFutures]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const grouped = useMemo(() => groupTeams(teams ?? []), [teams]);
  const maxWT = (season?.num_weeks ?? 18) - 1;

  // ── Input handlers ────────────────────────────────────────────────────────

  const updatePlayoff = useCallback(
    (abbr: string, field: "make" | "miss", val: string) =>
      setState((prev) => ({
        ...prev,
        playoffs: {
          ...prev.playoffs,
          [abbr]: { ...prev.playoffs[abbr], [field]: val },
        },
      })),
    [],
  );

  const updateSection = useCallback(
    (section: SimpleSection, abbr: string, val: string) =>
      setState((prev) => ({
        ...prev,
        [section]: { ...prev[section], [abbr]: val },
      })),
    [],
  );

  // ── Clear all entries ─────────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    setState(emptyState(teams ?? []));
    setValidationErrors([]);
    setXlsxWarnings([]);
  }, [teams]);

  // ── XLSX upload ───────────────────────────────────────────────────────────

  const abbrevLookup = useMemo(() => {
    const map: Record<string, string> = {};
    teams?.forEach((t) => {
      map[t.abbreviation.toLowerCase()] = t.abbreviation;
    });
    return map;
  }, [teams]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { updates, unknownSheets, unrecognizedTeams } = parseXLSX(
          ev.target!.result as ArrayBuffer,
          abbrevLookup,
        );
        const warnings: string[] = [];
        if (unknownSheets.length > 0)
          warnings.push(
            `Unknown sheet names (skipped): ${unknownSheets.map((s) => `"${s}"`).join(", ")}. Accepted: ${ACCEPTED_SHEETS.join(", ")}`,
          );
        if (unrecognizedTeams.length > 0)
          warnings.push(
            `Unrecognized team abbreviations (skipped): ${unrecognizedTeams.join(", ")}`,
          );
        setXlsxWarnings(warnings);
        setState((prev) => ({
          playoffs: updates.playoffs
            ? { ...prev.playoffs, ...updates.playoffs }
            : prev.playoffs,
          wintotals: updates.wintotals
            ? { ...prev.wintotals, ...updates.wintotals }
            : prev.wintotals,
          division_odds: updates.division_odds
            ? { ...prev.division_odds, ...updates.division_odds }
            : prev.division_odds,
          conference_odds: updates.conference_odds
            ? { ...prev.conference_odds, ...updates.conference_odds }
            : prev.conference_odds,
          superbowl_odds: updates.superbowl_odds
            ? { ...prev.superbowl_odds, ...updates.superbowl_odds }
            : prev.superbowl_odds,
        }));
      } catch (err) {
        setXlsxWarnings([`Failed to parse file: ${(err as Error).message}`]);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Validation + save ─────────────────────────────────────────────────────

  const handleSave = () => {
    const errors: string[] = [];
    const checkInt = (val: string, label: string) => {
      if (!val) return;
      if (!Number.isInteger(Number(val)))
        errors.push(`${label}: "${val}" is not a whole number`);
    };
    const checkWT = (val: string, abbr: string) => {
      if (!val) return;
      const n = Number(val);
      if (isNaN(n) || n < 0 || n > maxWT)
        errors.push(`Win total ${abbr}: must be between 0 and ${maxWT}`);
    };

    for (const [abbr, v] of Object.entries(state.playoffs)) {
      checkInt(v.make, `${abbr} make odds`);
      checkInt(v.miss, `${abbr} miss odds`);
    }
    for (const [abbr, v] of Object.entries(state.wintotals)) checkWT(v, abbr);
    for (const [abbr, v] of Object.entries(state.division_odds))
      checkInt(v, `${abbr} div odds`);
    for (const [abbr, v] of Object.entries(state.conference_odds))
      checkInt(v, `${abbr} conf odds`);
    for (const [abbr, v] of Object.entries(state.superbowl_odds))
      checkInt(v, `${abbr} SB odds`);

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);

    const toInt = (s: string) => (s === "" ? null : parseInt(s, 10));
    const toFloat = (s: string) => (s === "" ? null : parseFloat(s));

    saveMutation.mutate({
      season: selectedSeason!,
      playoffs: Object.fromEntries(
        Object.entries(state.playoffs).map(([a, v]) => [
          a,
          { make: toInt(v.make), miss: toInt(v.miss) },
        ]),
      ),
      wintotals: Object.fromEntries(
        Object.entries(state.wintotals).map(([a, v]) => [a, toFloat(v)]),
      ),
      division_odds: Object.fromEntries(
        Object.entries(state.division_odds).map(([a, v]) => [a, toInt(v)]),
      ),
      conference_odds: Object.fromEntries(
        Object.entries(state.conference_odds).map(([a, v]) => [a, toInt(v)]),
      ),
      superbowl_odds: Object.fromEntries(
        Object.entries(state.superbowl_odds).map(([a, v]) => [a, toInt(v)]),
      ),
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PrerequisiteGuard
      met={!!selectedSeason && !!teams?.length}
      message="Complete Season Settings and Teams before entering futures data."
    >
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              NFL Futures · {selectedSeason}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Betting odds and projections for the upcoming season.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleClear}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-100 text-slate-500"
            >
              Clear All
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-100"
            >
              Upload XLSX
            </button>
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="px-3 py-1.5 text-sm bg-green-700 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              {saveMutation.isPending ? "Saving…" : "Save Futures"}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* XLSX warnings */}
        {xlsxWarnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded p-3">
            <p className="text-amber-700 text-sm font-medium mb-1">
              Upload warnings:
            </p>
            <ul className="text-amber-700 text-xs space-y-0.5">
              {xlsxWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <p className="text-red-700 text-sm font-medium mb-1">
              Fix before saving:
            </p>
            <ul className="text-red-600 text-xs space-y-0.5 max-h-36 overflow-y-auto">
              {validationErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Format instructions */}
        <FormatInstructions />

        {/* Win Totals */}
        <div>
          <SectionHeading
            title="Win Totals"
            subtitle={`Projected season wins (0–${maxWT}, decimals allowed)`}
          />
          <div className="mt-2">
            <WinTotalsSection
              grouped={grouped}
              state={state.wintotals}
              onChange={(a, v) => updateSection("wintotals", a, v)}
              maxWT={maxWT}
            />
          </div>
        </div>

        {/* Playoff Odds */}
        <div>
          <SectionHeading
            title="Playoff Odds"
            subtitle="American odds (integer). e.g. -150 to make, 120 to miss"
          />
          <div className="mt-2">
            <PlayoffsSection
              grouped={grouped}
              state={state.playoffs}
              onChange={updatePlayoff}
            />
          </div>
        </div>

        {/* Division Odds */}
        <div>
          <SectionHeading
            title="Division Odds"
            subtitle="Odds to win division (integer)"
          />
          <div className="mt-2">
            <DivisionOddsSection
              grouped={grouped}
              state={state.division_odds}
              onChange={(a, v) => updateSection("division_odds", a, v)}
            />
          </div>
        </div>

        {/* Conference Odds */}
        <div>
          <SectionHeading
            title="Conference Odds"
            subtitle="Odds to win conference (integer)"
          />
          <div className="mt-2">
            <ConferenceOddsSection
              grouped={grouped}
              state={state.conference_odds}
              onChange={(a, v) => updateSection("conference_odds", a, v)}
            />
          </div>
        </div>

        {/* Super Bowl Odds */}
        <div>
          <SectionHeading
            title="Super Bowl Odds"
            subtitle="Odds to win Super Bowl (integer)"
          />
          <div className="mt-2">
            <SuperBowlOddsSection
              grouped={grouped}
              state={state.superbowl_odds}
              onChange={(a, v) => updateSection("superbowl_odds", a, v)}
            />
          </div>
        </div>

        {saveMutation.isSuccess && (
          <p className="text-green-600 text-sm">Futures saved ✓</p>
        )}
        {saveMutation.isError && (
          <p className="text-red-500 text-sm">Error saving. Check console.</p>
        )}
      </div>
    </PrerequisiteGuard>
  );
};

export default MLFuturesPage;
