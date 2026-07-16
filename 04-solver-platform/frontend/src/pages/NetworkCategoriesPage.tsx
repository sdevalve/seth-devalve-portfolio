import { useState, useMemo, useCallback, useEffect } from "react";
import useSeasonStore from "@/store/useSeasonStore";
import useTeams from "@/hooks/useTeams";
import useMatchups from "@/hooks/useMatchups";
import useMLModel from "@/hooks/useMLModel";
import useMLFutures from "@/hooks/useMLFutures";
import useMLRematches from "@/hooks/useMLRematches";
import useNetCats from "@/hooks/useNetCats";
import useSaveNetCats from "@/hooks/useSaveNetCats";
import useTeamPopularity from "@/hooks/useTeamPopularity";
import useSaveTeamPopularity from "@/hooks/useSaveTeamPopularity";
import useSnapshotNetCats from "@/hooks/useSnapshotNetCats";
import useSeason from "@/hooks/useSeason";
import useNetCatsSelectionStore from "@/store/useNetCatsSelectionStore";
import type Team from "@/entities/Team";
import type { NetCatEntry } from "@/entities/NetCats";
import { validateSlotField } from "@/utils/validateRuleset";

// Default team popularity scores (higher = more nationally popular). Used to seed
// the Team Popularity table until a custom list is saved for the season.
const DEFAULT_TEAM_POPULARITY: Record<string, number> = {
  DAL: 32, KC: 31, GB: 30, BUF: 29, PHI: 29, NE: 28, LAR: 28, CHI: 27,
  SF: 27, SEA: 27, DEN: 26, DET: 26, BAL: 25, PIT: 25, CIN: 24, HOU: 23,
  WSH: 21, TB: 18, MIN: 17, MIA: 13, CLE: 11, NYG: 10, IND: 8, LAC: 7,
  JAX: 6, ATL: 5, NO: 5, TEN: 4, CAR: 4, LV: 3, NYJ: 2, ARI: 1,
};

// ── Local-only entry type (adds a stable React key, stripped before API calls) ─

type LocalEntry = Pick<
  NetCatEntry,
  "slot" | "operator" | "games" | "matchups"
> & {
  _key: string;
};

const makeKey = () => Math.random().toString(36).slice(2, 11);

// ── Constants ──────────────────────────────────────────────────────────────────

const PREMIUM_DIVISIONS = new Set(["NFC North", "NFC East", "AFC North"]);
const INTERCEPT = 70;
const REMATCH_COEF = 15;
const SPECIAL_DIV_COEF = 12;
const WIN_TOTAL_MULT = 20;

const TZ_LABELS: Record<number, string> = {
  0: "Eastern",
  1: "Central",
  2: "Mountain",
  3: "Pacific",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function matchupType(
  away: Team,
  home: Team,
): "Division" | "Conference" | "Non-Conference" {
  if (away.conference === home.conference && away.division === home.division)
    return "Division";
  if (away.conference === home.conference) return "Conference";
  return "Non-Conference";
}

function isPremiumDivision(away: Team, home: Team): boolean {
  if (away.conference !== home.conference || away.division !== home.division)
    return false;
  return PREMIUM_DIVISIONS.has(`${away.conference} ${away.division}`);
}

// ── Section 1: Team Popularity ─────────────────────────────────────────────────

interface TeamScore {
  abbreviation: string;
  defaultScore: number;
}

interface TeamPopularityProps {
  teams: Team[];
  marketCoefs: Record<string, Record<string, number>>;
  scores: Record<string, number>;
  onScoreChange: (abbrev: string, value: number) => void;
  onSave: (pending?: Record<string, number>) => void;
  onLoadDefaults: () => void;
  saveStatus: "idle" | "saved";
}

const TeamPopularitySection = ({
  teams,
  marketCoefs,
  scores,
  onScoreChange,
  onSave,
  onLoadDefaults,
  saveStatus,
}: TeamPopularityProps) => {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const sorted = useMemo(
    () =>
      [...teams].sort(
        (a, b) => (scores[b.abbreviation] ?? 0) - (scores[a.abbreviation] ?? 0),
      ),
    [teams, scores],
  );

  const handleChange = (abbrev: string, raw: string) => {
    setDrafts((d) => ({ ...d, [abbrev]: raw }));
  };

  const handleCommit = (abbrev: string) => {
    const raw = drafts[abbrev];
    if (raw === undefined) return;
    const n = parseFloat(raw);
    if (!isNaN(n)) onScoreChange(abbrev, n);
    setDrafts((d) => {
      const next = { ...d };
      delete next[abbrev];
      return next;
    });
  };

  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-1">
        Team Popularity
      </h2>
      <p className="text-xs text-slate-400 mb-3">
        Edit any value and press Enter or click away to re-rank.
      </p>
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => {
            const pending: Record<string, number> = {};
            for (const [abbrev, raw] of Object.entries(drafts)) {
              const n = parseFloat(raw);
              if (!isNaN(n)) pending[abbrev] = n;
            }
            setDrafts({});
            onSave(Object.keys(pending).length > 0 ? pending : undefined);
          }}
          className="px-3 py-1 text-xs bg-slate-800 text-white rounded hover:bg-slate-700 transition-colors"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onLoadDefaults}
          className="px-3 py-1 text-xs border border-slate-300 text-slate-600 rounded hover:border-slate-400 hover:text-slate-800 transition-colors"
        >
          Load Defaults
        </button>
        {saveStatus === "saved" && (
          <span className="text-xs text-emerald-600 font-medium">Saved</span>
        )}
      </div>
      <div className="border border-slate-200 rounded overflow-hidden w-fit max-h-[480px] overflow-y-auto">
        <table className="text-sm border-collapse">
          <thead className="sticky top-0 bg-slate-800 text-white">
            <tr>
              <th className="px-3 py-2 text-left w-8">#</th>
              <th className="px-3 py-2 text-left w-24">Team</th>
              <th className="px-3 py-2 text-right w-36">Popularity Score</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((team, i) => {
              const abbrev = team.abbreviation;
              const displayed =
                drafts[abbrev] !== undefined
                  ? drafts[abbrev]
                  : (scores[abbrev] ?? 0).toFixed(4);
              return (
                <tr
                  key={abbrev}
                  className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}
                >
                  <td className="px-3 py-1.5 text-slate-400 tabular-nums">
                    {i + 1}
                  </td>
                  <td className="px-3 py-1.5 font-mono font-medium text-slate-700">
                    {abbrev}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="text"
                      value={displayed}
                      onChange={(e) => handleChange(abbrev, e.target.value)}
                      onBlur={() => handleCommit(abbrev)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleCommit(abbrev);
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-28 px-2 py-0.5 text-right border border-slate-300 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-sky-400"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        {sorted.length} teams. These scores are used to compute matchup
        popularity below.
      </p>
    </section>
  );
};

// ── Section 2: Matchup Popularity ─────────────────────────────────────────────

interface MatchupRow {
  key: string; // "AWAY@HOME"
  away: string;
  home: string;
  awayTeam: Team;
  homeTeam: Team;
  type: "Division" | "Conference" | "Non-Conference";
  homeConference: string;
  homeTz: string;
  score: number;
}

type TypeFilter = "Division" | "Conference" | "Non-Conference";

interface MatchupFilterState {
  away: string;
  home: string;
  type: string;
  conference: string;
}

const TZ_OPTIONS = ["Eastern", "Central", "Mountain", "Pacific"] as const;

interface MatchupPopularityProps {
  rows: MatchupRow[];
  selectedKeys: Set<string>;
  onToggle: (key: string) => void;
  onSelectAll: (keys: string[]) => void;
}

const MatchupPopularitySection = ({
  rows,
  selectedKeys,
  onToggle,
  onSelectAll,
}: MatchupPopularityProps) => {
  const [filters, setFilters] = useState<MatchupFilterState>({
    away: "",
    home: "",
    type: "",
    conference: "",
  });
  const [tzFilters, setTzFilters] = useState<Set<string>>(new Set());

  const setFilter = (field: keyof MatchupFilterState, value: string) =>
    setFilters((prev) => ({ ...prev, [field]: value }));

  const toggleTz = (tz: string) =>
    setTzFilters((prev) => {
      const next = new Set(prev);
      next.has(tz) ? next.delete(tz) : next.add(tz);
      return next;
    });

  const filtered = useMemo(() => {
    const awayLower = filters.away.toLowerCase();
    const homeLower = filters.home.toLowerCase();
    return rows.filter((r) => {
      if (awayLower && !r.away.toLowerCase().includes(awayLower)) return false;
      if (homeLower && !r.home.toLowerCase().includes(homeLower)) return false;
      if (filters.type && r.type !== filters.type) return false;
      if (filters.conference && r.homeConference !== filters.conference)
        return false;
      if (tzFilters.size > 0 && !tzFilters.has(r.homeTz)) return false;
      return true;
    });
  }, [rows, filters, tzFilters]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selectedKeys.has(r.key));

  const handleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      filtered.forEach((r) => onToggle(r.key));
    } else {
      onSelectAll(
        filtered.filter((r) => !selectedKeys.has(r.key)).map((r) => r.key),
      );
    }
  };

  const inputCls =
    "w-full px-1.5 py-0.5 text-xs bg-slate-700 text-white placeholder-slate-400 border border-slate-600 rounded focus:outline-none focus:border-sky-400";
  const selectCls =
    "w-full px-1 py-0.5 text-xs bg-slate-700 text-white border border-slate-600 rounded focus:outline-none focus:border-sky-400";

  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-1">
        Matchup Popularity
      </h2>
      <p className="text-xs text-slate-400 mb-3">
        Select matchups below, then create a NetCats entry in Section 3.
        {/* Score = away_pop + home_pop + (away_wt + home_wt) × {WIN_TOTAL_MULT} +
        division bonus ({SPECIAL_DIV_COEF} for NFC North/East, AFC North) +
        rematch bonus ({REMATCH_COEF}) + {INTERCEPT}.  */}
      </p>

      <div className="text-xs text-slate-500 mb-1">
        {filtered.length} matchups shown · {selectedKeys.size} selected
      </div>

      <div className="border border-slate-200 rounded overflow-hidden max-h-[520px] overflow-y-auto">
        <table className="text-sm border-collapse w-full">
          <thead className="sticky top-0 z-10">
            {/* ── Column headers ── */}
            <tr className="bg-slate-800 text-white">
              <th className="px-3 py-2 text-center w-8">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={handleSelectAllFiltered}
                  className="accent-sky-400"
                />
              </th>
              <th className="px-3 py-2 text-left">Away</th>
              <th className="px-3 py-2 text-left">Home</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Conference</th>
              <th className="px-3 py-2 text-left">Home TZ</th>
              <th className="px-3 py-2 text-right">Score</th>
            </tr>
            {/* ── Per-column filter inputs ── */}
            <tr className="bg-slate-700">
              <td className="px-3 py-1" />
              <td className="px-2 py-1">
                <input
                  type="text"
                  value={filters.away}
                  onChange={(e) => setFilter("away", e.target.value)}
                  placeholder="Filter…"
                  className={inputCls}
                />
              </td>
              <td className="px-2 py-1">
                <input
                  type="text"
                  value={filters.home}
                  onChange={(e) => setFilter("home", e.target.value)}
                  placeholder="Filter…"
                  className={inputCls}
                />
              </td>
              <td className="px-2 py-1">
                <select
                  value={filters.type}
                  onChange={(e) => setFilter("type", e.target.value)}
                  className={selectCls}
                >
                  <option value="">All</option>
                  <option value="Division">Division</option>
                  <option value="Conference">Conference</option>
                  <option value="Non-Conference">Non-Conference</option>
                </select>
              </td>
              <td className="px-2 py-1">
                <select
                  value={filters.conference}
                  onChange={(e) => setFilter("conference", e.target.value)}
                  className={selectCls}
                >
                  <option value="">All</option>
                  <option value="AFC">AFC</option>
                  <option value="NFC">NFC</option>
                </select>
              </td>
              <td className="px-2 py-1">
                <div className="flex flex-wrap gap-1">
                  {TZ_OPTIONS.map((tz) => (
                    <button
                      key={tz}
                      type="button"
                      onClick={() => toggleTz(tz)}
                      className={`px-1.5 py-0.5 rounded text-xs font-medium border transition-colors whitespace-nowrap ${
                        tzFilters.has(tz)
                          ? "bg-sky-500 text-white border-sky-500"
                          : "bg-slate-600 text-slate-300 border-slate-500 hover:bg-slate-500"
                      }`}
                    >
                      {tz}
                    </button>
                  ))}
                </div>
              </td>
              <td className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr
                key={row.key}
                onClick={() => onToggle(row.key)}
                className={`cursor-pointer transition-colors ${
                  selectedKeys.has(row.key)
                    ? "bg-sky-50"
                    : i % 2 === 0
                      ? "bg-white hover:bg-slate-50"
                      : "bg-slate-50 hover:bg-slate-100"
                }`}
              >
                <td
                  className="px-3 py-1.5 text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selectedKeys.has(row.key)}
                    onChange={() => onToggle(row.key)}
                    className="accent-sky-400"
                  />
                </td>
                <td className="px-3 py-1.5 font-mono font-medium text-slate-700">
                  {row.away}
                </td>
                <td className="px-3 py-1.5 font-mono font-medium text-slate-700">
                  {row.home}
                </td>
                <td className="px-3 py-1.5 text-slate-600">
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      row.type === "Division"
                        ? "bg-purple-100 text-purple-700"
                        : row.type === "Conference"
                          ? "bg-sky-100 text-sky-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {row.type}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-slate-600">
                  {row.homeConference}
                </td>
                <td className="px-3 py-1.5 text-slate-600">{row.homeTz}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium text-slate-800">
                  {row.score.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

// ── Section 3: NetCats Sets ────────────────────────────────────────────────────

interface NetCatsSectionProps {
  entries: LocalEntry[];
  selectedMatchupKeys: Set<string>;
  validSlots: string[];
  isSaving: boolean;
  onAddEntry: (
    entry: Pick<NetCatEntry, "slot" | "operator" | "games" | "matchups">,
  ) => void;
  onEditEntry: (
    idx: number,
    field: "slot" | "operator" | "games" | "matchups",
    value: string | number,
  ) => void;
  onDeleteEntry: (idx: number) => void;
  onSnapshot: (name: string) => void;
  isSnapshotting: boolean;
  workingCopyId: string | null;
  snapshots: { net_cats_id: string; name: string; created_at: string }[];
  onDeleteSnapshot: (id: string) => void;
  onLoadSelection: (keys: string[]) => void;
  onLoadSnapshot: (id: string) => void;
  onDuplicateEntry: (idx: number) => void;
}

const NetCatsSection = ({
  entries,
  selectedMatchupKeys,
  validSlots,
  isSaving,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
  onSnapshot,
  isSnapshotting,
  snapshots,
  onLoadSelection,
  onLoadSnapshot,
  onDuplicateEntry,
}: NetCatsSectionProps) => {
  const [slot, setSlot] = useState("");
  const [operator, setOperator] = useState<"Max" | "Min">("Min");
  const [games, setGames] = useState("1");
  const [slotError, setSlotError] = useState<string | null>(null);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [editingSlotErrors, setEditingSlotErrors] = useState<
    Record<number, string | null>
  >({});
  const [editingEntryIdx, setEditingEntryIdx] = useState<number | null>(null);

  const duplicateIndices = useMemo(() => {
    const groups = new Map<string, number[]>();
    entries.forEach((e, i) => {
      const key = `${e.slot}|||${e.operator}|||${e.games}|||${e.matchups}`;
      const g = groups.get(key);
      if (g) g.push(i);
      else groups.set(key, [i]);
    });
    const result = new Set<number>();
    for (const idxs of groups.values()) {
      if (idxs.length > 1) idxs.forEach((i) => result.add(i));
    }
    return result;
  }, [entries]);

  const selectedList = [...selectedMatchupKeys].sort();

  const handleStartEditMatchups = (idx: number) => {
    const keys = entries[idx].matchups
      ? entries[idx].matchups
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean)
      : [];
    onLoadSelection(keys);
    setEditingEntryIdx(idx);
  };

  const handleUpdateMatchups = () => {
    if (editingEntryIdx === null) return;
    onEditEntry(editingEntryIdx, "matchups", selectedList.join(","));
    onLoadSelection([]);
    setEditingEntryIdx(null);
  };

  const handleCancelEditMatchups = () => {
    onLoadSelection([]);
    setEditingEntryIdx(null);
  };

  const handleCreate = () => {
    const trimmedSlot = slot.trim();
    const slotErr = validateSlotField(trimmedSlot, validSlots);
    setSlotError(slotErr);

    const g = parseInt(games, 10);
    const gErr = isNaN(g) || g < 0 ? "Must be a non-negative integer" : null;
    setGamesError(gErr);

    if (slotErr || gErr) return;
    if (selectedList.length === 0) return;

    onAddEntry({
      slot: trimmedSlot,
      operator,
      games: g,
      matchups: selectedList.join(","),
    });

    // Reset form — selections are cleared by parent
    setSlot("");
    setGames("1");
    setSlotError(null);
    setGamesError(null);
  };

  const handleSnapshot = () => {
    const name = snapshotName.trim();
    if (!name) {
      setSnapshotError("Name cannot be blank");
      return;
    }
    setSnapshotError(null);
    onSnapshot(name);
    setSnapshotName("");
  };

  const handleEditSlot = (idx: number, raw: string) => {
    const trimmed = raw.trim();
    const err = validateSlotField(trimmed, validSlots);
    setEditingSlotErrors((prev) => ({ ...prev, [idx]: err }));
    if (!err) onEditEntry(idx, "slot", trimmed);
  };

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-1">
          NetCats Sets
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Select matchups from the table above, then define a slot + constraint
          to create a NetCats entry. Build up multiple entries, then save a
          named snapshot when done.
        </p>

        {/* ── Create / Edit form ── */}
        <div
          className={`border rounded-lg p-4 flex flex-col gap-3 ${
            editingEntryIdx !== null
              ? "bg-amber-50 border-amber-200"
              : "bg-slate-50 border-slate-200"
          }`}
        >
          {editingEntryIdx !== null ? (
            /* ── Edit-matchups mode ── */
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-amber-700">
                  Editing matchups for:{" "}
                  <span className="font-mono">
                    {entries[editingEntryIdx].slot}
                  </span>
                </span>
                <span className="text-[10px] text-amber-500">
                  Op: {entries[editingEntryIdx].operator} · Games:{" "}
                  {entries[editingEntryIdx].games}
                </span>
              </div>

              <div className="text-xs font-medium text-amber-700">
                Selected matchups ({selectedList.length}):
                {selectedList.length === 0 ? (
                  <span className="text-amber-400 ml-1 italic">
                    none. Check matchups in the table above
                  </span>
                ) : (
                  <span className="font-mono text-amber-800 ml-1 break-all">
                    {selectedList.join(",")}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleUpdateMatchups}
                  disabled={selectedList.length === 0 || isSaving}
                  className="px-4 py-1.5 text-xs bg-amber-600 text-white rounded hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isSaving ? "Saving…" : "Update Matchups"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEditMatchups}
                  className="px-4 py-1.5 text-xs border border-slate-300 text-slate-600 rounded hover:border-slate-400 hover:text-slate-800 whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            /* ── Create mode ── */
            <>
              <div className="text-xs font-medium text-slate-600">
                Selected matchups ({selectedList.length}):
                {selectedList.length === 0 ? (
                  <span className="text-slate-400 ml-1 italic">
                    none. Check matchups in the table above
                  </span>
                ) : (
                  <span className="font-mono text-slate-700 ml-1 break-all">
                    {selectedList.join(", ")}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-3 items-start">
                {/* Slot */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                    Slot
                  </label>
                  <input
                    type="text"
                    value={slot}
                    onChange={(e) => {
                      setSlot(e.target.value);
                      setSlotError(null);
                    }}
                    placeholder="e.g. SNF or |SNF,MNF1|"
                    className={`px-2.5 py-1.5 text-xs border rounded font-mono w-48 focus:outline-none focus:ring-1 ${
                      slotError
                        ? "border-red-400 focus:ring-red-300"
                        : "border-slate-300 focus:ring-sky-400"
                    }`}
                  />
                  {slotError && (
                    <span className="text-[10px] text-red-500">
                      {slotError}
                    </span>
                  )}
                </div>

                {/* Operator */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                    Operator
                  </label>
                  <select
                    value={operator}
                    onChange={(e) =>
                      setOperator(e.target.value as "Max" | "Min")
                    }
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-sky-400"
                  >
                    <option value="Min">Min</option>
                    <option value="Max">Max</option>
                  </select>
                </div>

                {/* Games */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                    Games
                  </label>
                  <input
                    type="text"
                    value={games}
                    onChange={(e) => {
                      setGames(e.target.value);
                      setGamesError(null);
                    }}
                    className={`px-2.5 py-1.5 text-xs border rounded w-20 text-right font-mono focus:outline-none focus:ring-1 ${
                      gamesError
                        ? "border-red-400 focus:ring-red-300"
                        : "border-slate-300 focus:ring-sky-400"
                    }`}
                  />
                  {gamesError && (
                    <span className="text-[10px] text-red-500">
                      {gamesError}
                    </span>
                  )}
                </div>

                {/* Create button */}
                <div className="flex flex-col justify-end gap-1">
                  <div className="h-4" /> {/* spacer to align with inputs */}
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={selectedList.length === 0 || isSaving}
                    className="px-4 py-1.5 text-xs bg-slate-800 text-white rounded hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {isSaving ? "Saving…" : "Create NetCats"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Existing entries ── */}
      {entries.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Working Copy · {entries.length}{" "}
              {entries.length === 1 ? "entry" : "entries"}
            </h3>
            {isSaving && (
              <span className="text-[10px] text-slate-400 italic">Saving…</span>
            )}
          </div>
          <div className="border border-slate-200 rounded overflow-hidden">
            <table className="text-sm border-collapse w-full">
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className="px-3 py-2 text-left w-48">Slot</th>
                  <th className="px-3 py-2 text-left w-16">Op</th>
                  <th className="px-3 py-2 text-right w-16">Games</th>
                  <th className="px-3 py-2 text-left">Matchups</th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, idx) => (
                  <tr
                    key={entry._key}
                    className={
                      editingEntryIdx === idx
                        ? "bg-amber-50"
                        : duplicateIndices.has(idx)
                          ? "bg-rose-50"
                          : idx % 2 === 0
                            ? "bg-white"
                            : "bg-slate-50"
                    }
                  >
                    {/* Slot — editable */}
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        defaultValue={entry.slot}
                        onBlur={(e) => handleEditSlot(idx, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleEditSlot(idx, e.currentTarget.value);
                            e.currentTarget.blur();
                          }
                        }}
                        className={`px-2 py-0.5 text-sm border rounded font-mono w-full focus:outline-none focus:ring-1 ${
                          editingSlotErrors[idx]
                            ? "border-red-400 focus:ring-red-300"
                            : "border-slate-300 focus:ring-sky-400"
                        }`}
                      />
                      {editingSlotErrors[idx] && (
                        <div className="text-xs text-red-500 mt-0.5">
                          {editingSlotErrors[idx]}
                        </div>
                      )}
                    </td>
                    {/* Operator — editable */}
                    <td className="px-2 py-1.5">
                      <select
                        value={entry.operator}
                        onChange={(e) =>
                          onEditEntry(idx, "operator", e.target.value)
                        }
                        className="px-1.5 py-0.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-sky-400"
                      >
                        <option value="Min">Min</option>
                        <option value="Max">Max</option>
                      </select>
                    </td>
                    {/* Games — editable */}
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="text"
                        defaultValue={String(entry.games)}
                        onBlur={(e) => {
                          const g = parseInt(e.target.value, 10);
                          if (!isNaN(g) && g >= 0) onEditEntry(idx, "games", g);
                          else e.target.value = String(entry.games);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        className="px-2 py-0.5 text-sm border border-slate-300 rounded font-mono w-14 text-right focus:outline-none focus:ring-1 focus:ring-sky-400"
                      />
                    </td>
                    {/* Matchups — read-only display + edit button */}
                    <td className="px-3 py-1.5 font-mono text-slate-500 max-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className="truncate flex-1" title={entry.matchups}>
                          {entry.matchups}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleStartEditMatchups(idx)}
                          title="Edit matchups"
                          className={`shrink-0 px-1.5 py-0.5 text-xs border rounded transition-colors ${
                            editingEntryIdx === idx
                              ? "bg-amber-500 text-white border-amber-500"
                              : "bg-white text-slate-500 border-slate-300 hover:border-amber-400 hover:text-amber-600"
                          }`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateEntry(idx)}
                          title="Duplicate entry"
                          className="shrink-0 px-1.5 py-0.5 text-xs border rounded transition-colors bg-white text-slate-500 border-slate-300 hover:border-sky-400 hover:text-sky-600"
                        >
                          Dup
                        </button>
                      </div>
                    </td>
                    {/* Delete */}
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => onDeleteEntry(idx)}
                        title="Remove entry"
                        className="text-slate-400 hover:text-red-500 transition-colors text-base leading-none"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Save snapshot ── */}
      <div className="border-t border-slate-200 pt-4 flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Save Snapshot
        </h3>
        <p className="text-xs text-slate-400">
          Freeze the current working copy as an immutable named snapshot.
        </p>
        <div className="flex items-start gap-2">
          <div className="flex flex-col gap-1">
            <input
              type="text"
              value={snapshotName}
              onChange={(e) => {
                setSnapshotName(e.target.value);
                setSnapshotError(null);
              }}
              placeholder="Snapshot name…"
              className={`px-2.5 py-1.5 text-xs border rounded w-56 focus:outline-none focus:ring-1 ${
                snapshotError
                  ? "border-red-400 focus:ring-red-300"
                  : "border-slate-300 focus:ring-sky-400"
              }`}
            />
            {snapshotError && (
              <span className="text-[10px] text-red-500">{snapshotError}</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSnapshot}
            disabled={entries.length === 0 || isSnapshotting}
            className="px-4 py-1.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isSnapshotting ? "Saving…" : "Save Snapshot"}
          </button>
        </div>

        {/* Existing snapshots */}
        {snapshots.length > 0 && (
          <div className="mt-1">
            <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1">
              Saved Snapshots
            </div>
            <div className="flex flex-col gap-1">
              {snapshots.map((s) => (
                <div
                  key={s.net_cats_id}
                  className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-1.5"
                >
                  <span className="flex-1 font-medium">{s.name}</span>
                  <span className="text-slate-400 text-xs">
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => onLoadSnapshot(s.net_cats_id)}
                    className="px-2 py-0.5 text-xs border border-slate-300 text-slate-600 rounded hover:border-sky-400 hover:text-sky-700 transition-colors whitespace-nowrap"
                  >
                    Load
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

// ── Page ───────────────────────────────────────────────────────────────────────

const NetworkCategoriesPage = () => {
  const { selectedSeason } = useSeasonStore();
  const { data: teams } = useTeams(selectedSeason);
  const { data: matchups } = useMatchups(selectedSeason);
  const { data: mlModel } = useMLModel(selectedSeason);
  const { data: mlFutures } = useMLFutures(selectedSeason);
  const { data: mlRematches } = useMLRematches(selectedSeason);
  const { data: season } = useSeason(selectedSeason);
  const { data: netCatsList } = useNetCats(selectedSeason);
  const saveMutation = useSaveNetCats();
  const snapshotMutation = useSnapshotNetCats();
  const { data: savedPopularity } = useTeamPopularity(selectedSeason);
  const savePopularityMutation = useSaveTeamPopularity();

  const { selected, toggle, clear, selectAll } = useNetCatsSelectionStore();

  // ── Prerequisite check ─────────────────────────────────────────────────────
  const hasTeams = !!(teams && teams.length > 0);
  const hasFutures = !!mlFutures?.wintotals;

  // ── Team popularity defaults ───────────────────────────────────────────────
  const defaultScores = useMemo((): Record<string, number> => {
    if (!teams) return {};
    const result: Record<string, number> = {};
    for (const team of teams) {
      result[team.abbreviation] =
        DEFAULT_TEAM_POPULARITY[team.abbreviation] ?? 0;
    }
    return result;
  }, [teams]);

  const [popularityScores, setPopularityScores] = useState<
    Record<string, number>
  >({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  // Sync backend scores into local state when they arrive or season changes
  useEffect(() => {
    setPopularityScores(savedPopularity ?? {});
    setSaveStatus("idle");
  }, [savedPopularity]);

  // Sync default scores in when model loads (only if not yet set by user)
  const effectiveScores = useMemo(() => {
    const merged: Record<string, number> = {};
    if (teams) {
      for (const t of teams) {
        merged[t.abbreviation] =
          popularityScores[t.abbreviation] !== undefined
            ? popularityScores[t.abbreviation]
            : (defaultScores[t.abbreviation] ?? 0);
      }
    }
    return merged;
  }, [teams, defaultScores, popularityScores]);

  const handleSavePopularity = useCallback(
    (pending?: Record<string, number>) => {
      if (!selectedSeason) return;
      const toSave = pending
        ? { ...effectiveScores, ...pending }
        : effectiveScores;
      if (pending) setPopularityScores((prev) => ({ ...prev, ...pending }));
      savePopularityMutation.mutate(
        { season: selectedSeason, scores: toSave },
        {
          onSuccess: () => {
            setSaveStatus("saved");
            setTimeout(() => setSaveStatus("idle"), 2000);
          },
        },
      );
    },
    [selectedSeason, effectiveScores, savePopularityMutation],
  );

  const handleLoadDefaults = useCallback(() => {
    if (!selectedSeason) return;
    setPopularityScores({});
    savePopularityMutation.mutate({ season: selectedSeason, scores: {} });
    setSaveStatus("idle");
  }, [selectedSeason, savePopularityMutation]);

  const handleScoreChange = useCallback((abbrev: string, value: number) => {
    setPopularityScores((prev) => ({ ...prev, [abbrev]: value }));
  }, []);

  // ── Matchup rows ───────────────────────────────────────────────────────────
  // Matchups (and rematches) are stored with mascot names ("Eagles", "Chiefs").
  // We need a case-insensitive lookup by mascot → Team so we can resolve the
  // canonical abbreviation for wintotals / effectiveScores / NetCat keys.
  const teamByMascot = useMemo((): Record<string, Team> => {
    const m: Record<string, Team> = {};
    if (teams) {
      for (const t of teams) {
        m[t.mascot.toLowerCase()] = t;
        m[t.abbreviation.toLowerCase()] = t; // fallback if abbreviations are stored
      }
    }
    return m;
  }, [teams]);

  // Rematch set uses canonical abbrev@abbrev keys to match matchupRows keys.
  const rematchSet = useMemo((): Set<string> => {
    const s = new Set<string>();
    if (mlRematches) {
      for (const r of mlRematches) {
        const away = teamByMascot[r.away_team.toLowerCase()];
        const home = teamByMascot[r.home_team.toLowerCase()];
        if (away && home) s.add(`${away.abbreviation}@${home.abbreviation}`);
      }
    }
    return s;
  }, [mlRematches, teamByMascot]);

  const matchupRows = useMemo((): MatchupRow[] => {
    if (!matchups || !teams) return [];
    const wintotals = mlFutures?.wintotals ?? {};

    return matchups
      .map((m): MatchupRow | null => {
        const awayTeam = teamByMascot[m.away_team.toLowerCase()];
        const homeTeam = teamByMascot[m.home_team.toLowerCase()];
        if (!awayTeam || !homeTeam) return null;

        // Canonical key: abbreviation@abbreviation (used for NetCat storage)
        const key = `${awayTeam.abbreviation}@${homeTeam.abbreviation}`;
        const awayPop = effectiveScores[awayTeam.abbreviation] ?? 0;
        const homePop = effectiveScores[homeTeam.abbreviation] ?? 0;
        const awayWt = (wintotals[awayTeam.abbreviation] as number | null) ?? 0;
        const homeWt = (wintotals[homeTeam.abbreviation] as number | null) ?? 0;
        const specialBonus = isPremiumDivision(awayTeam, homeTeam)
          ? SPECIAL_DIV_COEF
          : 0;
        const rematchBonus = rematchSet.has(key) ? REMATCH_COEF : 0;

        const score =
          awayPop +
          homePop +
          (awayWt + homeWt) * WIN_TOTAL_MULT +
          specialBonus +
          rematchBonus +
          INTERCEPT;

        return {
          key,
          away: awayTeam.abbreviation,
          home: homeTeam.abbreviation,
          awayTeam,
          homeTeam,
          type: matchupType(awayTeam, homeTeam),
          homeConference: homeTeam.conference,
          homeTz: TZ_LABELS[homeTeam.timezone] ?? "Unknown",
          score,
        } satisfies MatchupRow;
      })
      .filter((r): r is MatchupRow => r !== null)
      .sort((a, b) => b.score - a.score);
  }, [matchups, teams, teamByMascot, effectiveScores, mlFutures, rematchSet]);

  // ── NetCats working copy ───────────────────────────────────────────────────
  const workingCopy = useMemo(
    () => netCatsList?.find((n) => !n.is_snapshot) ?? null,
    [netCatsList],
  );
  const snapshots = useMemo(
    () => netCatsList?.filter((n) => n.is_snapshot) ?? [],
    [netCatsList],
  );

  const [localEntries, setLocalEntries] = useState<LocalEntry[]>([]);

  // Seed local entries from the server whenever the working copy ID changes
  // (initial load, season switch, or first-ever save creating the working copy).
  // Keying on the ID means auto-saves that return the same record don't overwrite
  // in-progress edits.
  useEffect(() => {
    if (workingCopy) {
      setLocalEntries(
        workingCopy.entries.map(({ slot, operator, games, matchups }) => ({
          slot,
          operator,
          games,
          matchups,
          _key: makeKey(),
        })),
      );
    } else {
      setLocalEntries([]);
    }
  }, [workingCopy?.net_cats_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoSave = useCallback(
    (entries: LocalEntry[]) => {
      if (!selectedSeason) return;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      saveMutation.mutate({
        season: selectedSeason,
        entries: entries.map(({ _key, ...e }) => e),
      });
    },
    [selectedSeason, saveMutation],
  );

  const handleAddEntry = useCallback(
    (entry: Pick<NetCatEntry, "slot" | "operator" | "games" | "matchups">) => {
      const next = [...localEntries, { ...entry, _key: makeKey() }];
      setLocalEntries(next);
      clear();
      autoSave(next);
    },
    [localEntries, clear, autoSave],
  );

  const handleEditEntry = useCallback(
    (
      idx: number,
      field: "slot" | "operator" | "games" | "matchups",
      value: string | number,
    ) => {
      const next = localEntries.map((e, i) =>
        i === idx ? { ...e, [field]: value } : e,
      );
      setLocalEntries(next);
      autoSave(next);
    },
    [localEntries, autoSave],
  );

  const handleDeleteEntry = useCallback(
    (idx: number) => {
      const next = localEntries.filter((_, i) => i !== idx);
      setLocalEntries(next);
      autoSave(next);
    },
    [localEntries, autoSave],
  );

  const handleDuplicateEntry = useCallback(
    (idx: number) => {
      const entry = localEntries[idx];
      const next = [
        ...localEntries.slice(0, idx + 1),
        { ...entry, _key: makeKey() },
        ...localEntries.slice(idx + 1),
      ];
      setLocalEntries(next);
      autoSave(next);
    },
    [localEntries, autoSave],
  );

  const handleSnapshot = useCallback(
    (name: string) => {
      if (!workingCopy || !selectedSeason) return;
      snapshotMutation.mutate({
        net_cats_id: workingCopy.net_cats_id,
        name,
        season: selectedSeason,
      });
    },
    [workingCopy, selectedSeason, snapshotMutation],
  );

  const handleLoadSelection = useCallback(
    (keys: string[]) => {
      selectAll(keys);
    },
    [selectAll],
  );

  const handleLoadSnapshot = useCallback(
    (id: string) => {
      const snapshot = netCatsList?.find((n) => n.net_cats_id === id);
      if (!snapshot) return;
      const next = snapshot.entries.map(
        ({ slot, operator, games, matchups }) => ({
          slot,
          operator,
          games,
          matchups,
          _key: makeKey(),
        }),
      );
      setLocalEntries(next);
      autoSave(next);
    },
    [netCatsList, autoSave],
  );

  // ── Blocked state ──────────────────────────────────────────────────────────
  if (!selectedSeason) {
    return (
      <div className="text-sm text-slate-500 p-6">
        Select a season to use Network Categories.
      </div>
    );
  }

  if (!hasTeams || !hasFutures) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 max-w-lg">
        <h2 className="text-base font-semibold text-amber-800 mb-2">
          Prerequisites not met
        </h2>
        <p className="text-sm text-amber-700 mb-3">
          Network Categories requires both of the following to be saved for
          season <span className="font-semibold">{selectedSeason}</span>:
        </p>
        <ul className="text-sm text-amber-700 space-y-1 ml-4 list-disc">
          <li className={hasTeams ? "line-through text-amber-400" : ""}>
            Teams page saved
          </li>
          <li className={hasFutures ? "line-through text-amber-400" : ""}>
            Futures data saved (win totals required)
          </li>
        </ul>
      </div>
    );
  }

  const validSlots = season?.slots ?? [];

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          Network Categories · {selectedSeason}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Build popularity-ranked matchup groups and assign them to slot
          constraints.
        </p>
      </div>

      <TeamPopularitySection
        teams={teams!}
        marketCoefs={mlModel?.market_coefs ?? {}}
        scores={effectiveScores}
        onScoreChange={handleScoreChange}
        onSave={handleSavePopularity}
        onLoadDefaults={handleLoadDefaults}
        saveStatus={saveStatus}
      />

      <MatchupPopularitySection
        rows={matchupRows}
        selectedKeys={selected}
        onToggle={toggle}
        onSelectAll={(keys) => selectAll([...selected, ...keys])}
      />

      <NetCatsSection
        entries={localEntries}
        selectedMatchupKeys={selected}
        validSlots={validSlots}
        isSaving={saveMutation.isPending}
        onAddEntry={handleAddEntry}
        onEditEntry={handleEditEntry}
        onDeleteEntry={handleDeleteEntry}
        onSnapshot={handleSnapshot}
        isSnapshotting={snapshotMutation.isPending}
        workingCopyId={workingCopy?.net_cats_id ?? null}
        snapshots={snapshots}
        onDeleteSnapshot={() => {}}
        onLoadSelection={handleLoadSelection}
        onLoadSnapshot={handleLoadSnapshot}
        onDuplicateEntry={handleDuplicateEntry}
      />
    </div>
  );
};

export default NetworkCategoriesPage;
