import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import useRuns from "@/hooks/useRuns";
import useSolutions from "@/hooks/useSolutions";
import useSeasonStore from "@/store/useSeasonStore";
import PrerequisiteGuard from "@/components/PrerequisiteGuard";
import ObjectiveChart from "@/components/run/ObjectiveChart";
import IncumbentFeed from "@/components/run/IncumbentFeed";
import type { RunParams } from "@/entities/Run";

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-slate-100 text-slate-600",
  building: "bg-purple-100 text-purple-800",
  feasibility_check: "bg-yellow-100 text-yellow-800",
  incumbent_generation: "bg-violet-100 text-violet-800",
  solving: "bg-blue-100 text-blue-800",
  perturbating: "bg-cyan-100 text-cyan-800",
  "Warm Starting": "bg-indigo-100 text-indigo-800",
  infeasible: "bg-orange-100 text-orange-800",
  complete: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  stopped: "bg-amber-100 text-amber-700",
};

// ── Run config summary panel ───────────────────────────────────────────────

const METHOD_LABELS: Record<number, string> = {
  [-1]: "Automatic",
  0: "Primal simplex",
  1: "Dual simplex",
  2: "Barrier",
  3: "Concurrent",
  4: "Det. concurrent",
};

const CUTS_LABELS: Record<number, string> = {
  [-1]: "Automatic",
  0: "Off",
  1: "Moderate",
  2: "Aggressive",
  3: "Very aggressive",
};

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between gap-2 py-0.5">
    <span className="text-slate-500 shrink-0">{label}</span>
    <span className="text-slate-800 font-medium text-right">
      {value ?? <em className="text-slate-400 font-normal">none</em>}
    </span>
  </div>
);

const RunConfigPanel = ({ params }: { params: RunParams }) => (
  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs space-y-3">
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
        Snapshots
      </p>
      <Row label="Ruleset" value={params.ruleset_name} />
      <Row label="Network Categories" value={params.net_cats_name} />
      <Row label="Predictions" value={params.prediction_set_name} />
      <Row label="Fixed Game Set" value={params.fixed_game_set_name} />
    </div>
    {params.gurobi && (
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
          Gurobi Settings
        </p>
        <Row label="MIP Gap" value={params.gurobi.mip_gap} />
        <Row label="NoRel Heuristic (s)" value={params.gurobi.no_rel_time} />
        <Row
          label="Method"
          value={METHOD_LABELS[params.gurobi.method] ?? params.gurobi.method}
        />
        <Row
          label="Cuts"
          value={CUTS_LABELS[params.gurobi.cuts] ?? params.gurobi.cuts}
        />
        <Row label="MIP Focus" value={params.gurobi.mip_focus ?? 0} />
        <Row label="Presolve" value={params.gurobi.presolve ?? -1} />
        <Row label="Degen Moves" value={params.gurobi.degen_moves} />
        <Row label="Time Limit (s)" value={params.gurobi.time_limit ?? "None"} />
        <Row
          label="Pool Search Mode"
          value={params.gurobi.pool_search_mode ?? 0}
        />
        <Row label="Pool Solutions" value={params.gurobi.pool_solutions ?? 10} />
        <Row label="Pool Gap" value={params.gurobi.pool_gap ?? "None"} />
      </div>
    )}
  </div>
);

// ── Page ──────────────────────────────────────────────────────────────────

// ── Hidden run names (exact match) ────────────────────────────────────────
const HIDDEN_RUN_NAMES = new Set([
  "Apr14_2",
  "Apr13_1_pert",
  "Apr7_1_81_pert11",
  "Apr7_1_81_pert10",
  "Apr7_1_81_pert9",
  "Apr7_1_81_pert8",
  "Apr7_1_81_pert7",
  "Apr7_1_81_pert6",
  "Apr7_1_81_pert5",
  "Apr7_1_81_pert4",
  "Apr7_1_81_pert3",
  "Apr7_1_81_pert2",
  "Apr7_1_81_pert1",
  "Apr1_2",
  "Apr1_1",
  "Mar27_2",
  "Mar26_5",
  "Mar26_2",
  "Mar24_3",
  "Mar24_2",
  "Mar24_1",
  "Mar23_2",
  "Mar23_1",
  "Mar22_1",
  "Mar17_4",
  "noMNFfloor",
  "PenOnly_test6",
  "PenOnly_test5",
  "PenOnly_test4",
  "PenOnly_test3",
  "PenOnly_test2",
  "PenOnly_test",
  "test2_Mar13",
  "test1_Mar12",
  "test9_Mar11",
  "test8_Mar11",
  "Apr16_7mo",
  "Apr16_6mo",
  "Apr16_5mo",
  "Apr17_6_pert",
  "Apr17_2_pert",
  "Apr16_3",
  "Apr16_2",
  "Apr6_2",
  "Apr7_1",
  "Apr6_1",
  "Apr10_1",
  "Apr20_test",
  "May26_1",
  "May25_2",
  "SmokeTest_PenaltyOnly",
  "July16_2",
  "July16_3",
]);

const HistoryPage = () => {
  const { selectedSeason } = useSeasonStore();
  const { data: runs, isLoading } = useRuns(selectedSeason);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedRunId = searchParams.get("run");
  const [selectedSolutionId, setSelectedSolutionId] = useState<string | null>(
    null,
  );
  const [showConfig, setShowConfig] = useState(false);
  const [hideFiltered, setHideFiltered] = useState(true);

  const visibleRuns = hideFiltered
    ? runs?.filter(
        (r) => r.status !== "failed" && !HIDDEN_RUN_NAMES.has(r.name),
      )
    : runs;

  const TERMINAL = new Set(['complete', 'failed', 'stopped', 'infeasible'])
  const selectedRun = runs?.find((r) => r.run_id === selectedRunId);
  const isLive = !!selectedRun && !TERMINAL.has(selectedRun.status)
  const { data: solutions = [] } = useSolutions(selectedRunId, isLive);

  return (
    <PrerequisiteGuard
      met={!!selectedSeason}
      message="Select a season to view run history."
    >
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-bold text-slate-900">
          Run History · {selectedSeason}
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Run list */}
          <div className="border border-slate-200 rounded overflow-hidden">
            <div className="bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center justify-between">
              <span>Runs</span>
              <label className="flex items-center gap-1 font-normal text-slate-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideFiltered}
                  onChange={(e) => setHideFiltered(e.target.checked)}
                  className="accent-slate-600"
                />
                Filtered
              </label>
            </div>
            {isLoading && (
              <p className="text-xs text-slate-400 p-3">Loading…</p>
            )}
            {visibleRuns?.length === 0 && (
              <p className="text-xs text-slate-400 p-3">
                No runs for this season yet.
              </p>
            )}
            <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
              {visibleRuns?.map((run) => (
                <button
                  key={run.run_id}
                  onClick={() => {
                    setSearchParams({ run: run.run_id });
                    setSelectedSolutionId(null);
                    setShowConfig(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors ${
                    run.run_id === selectedRunId
                      ? "bg-blue-50 border-l-2 border-blue-500"
                      : ""
                  }`}
                >
                  <div className="flex justify-between">
                    <span className="font-medium text-slate-800 truncate">
                      {run.name}
                    </span>
                    <span
                      className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[run.status]}`}
                    >
                      {run.status}
                    </span>
                  </div>
                  <div className="flex gap-2 text-slate-500 mt-0.5">
                    <span>{run.run_type}</span>
                    <span>·</span>
                    <span>{run.scope}</span>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <Link
                      to={`/runs/${run.run_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-blue-600 hover:underline"
                    >
                      Live view →
                    </Link>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right panel: chart + incumbents + config */}
          <div className="lg:col-span-2">
            {selectedRun ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-slate-700">
                    {selectedRun.run_type === "MultiObjective"
                      ? "Efficient Frontier"
                      : "Incumbent Objectives"}{" "}
                    · {selectedRun.name}
                  </h2>
                  {selectedRun.run_params && (
                    <button
                      type="button"
                      onClick={() => setShowConfig((s) => !s)}
                      className="text-xs text-slate-400 hover:text-slate-600 underline"
                    >
                      {showConfig ? "Hide config" : "Show config"}
                    </button>
                  )}
                </div>

                {showConfig && selectedRun.run_params && (
                  <RunConfigPanel params={selectedRun.run_params} />
                )}

                <div className={showConfig ? "mt-4" : ""}>
                  <ObjectiveChart
                    solutions={solutions}
                    selectedId={selectedSolutionId}
                    onSelect={setSelectedSolutionId}
                    runType={selectedRun.run_type}
                  />
                </div>

                <div className="mt-4">
                  <IncumbentFeed
                    solutions={solutions}
                    selectedId={selectedSolutionId}
                    onSelect={setSelectedSolutionId}
                    scheduleLinkSuffix="&from=history"
                  />
                </div>

                {selectedSolutionId && (
                  <div className="mt-3 flex gap-3">
                    <Link
                      to={`/schedule?solution=${selectedSolutionId}&from=history`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      View schedule →
                    </Link>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-64 rounded border border-dashed border-slate-300 text-slate-400 text-sm">
                Select a run to see its frontier
              </div>
            )}
          </div>
        </div>
      </div>
    </PrerequisiteGuard>
  );
};

export default HistoryPage;
