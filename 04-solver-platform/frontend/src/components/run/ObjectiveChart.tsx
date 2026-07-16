import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceDot,
  ScatterChart,
  Scatter,
} from "recharts";
import type Solution from "@/entities/Solution";
import type { RunType } from "@/entities/Run";

interface Props {
  solutions: Solution[];
  selectedId?: string | null;
  onSelect?: (solutionId: string) => void;
  runType?: RunType;
}

/** Append Z if no timezone suffix so DB-stored UTC strings parse correctly. */
const fixTs = (ts: string) => (/Z|[+-]\d{2}:\d{2}$/.test(ts) ? ts : ts + "Z");

/** Filter out early heuristic incumbents with unrealistically high objectives. */
const OBJ_CAP = 1_000_000;

// ── Efficient Frontier (MultiObjective) ──────────────────────────────────────

/**
 * Identifies Pareto-frontier points among a set of (x=penalty, y=ratings) points.
 * Lower penalty is better; higher ratings is better → frontier = top-left boundary.
 *
 * Algorithm:
 *   1. Sort by penalty ASC, ratings DESC within ties (so the best-ratings point
 *      in each penalty tie-group is evaluated first).
 *   2. Walk left-to-right tracking a running cumulative-max of ratings seen so far.
 *   3. A point is non-dominated iff its ratings ≥ that cumulative max (meaning no
 *      previously seen cheaper-or-equal-penalty solution beats it on ratings).
 *
 * Ties in penalty are handled correctly: within a penalty tie-group, only the
 * point(s) with the group's maximum ratings are marked as frontier. Exact ties
 * in both dimensions (same penalty AND same ratings) are both marked frontier
 * because neither dominates the other.
 */
function computeFrontierIds(
  pts: { solution_id: string; x: number; y: number }[],
): Set<string> {
  const sorted = [...pts].sort((a, b) => a.x - b.x || b.y - a.y);
  const frontier = new Set<string>();
  let cumMaxRatings = -Infinity;
  for (const pt of sorted) {
    if (pt.y >= cumMaxRatings) {
      frontier.add(pt.solution_id);
      cumMaxRatings = pt.y;
    }
  }
  return frontier;
}

const FrontierDot = (props: {
  cx?: number;
  cy?: number;
  payload?: {
    solution_id: string;
    sanity_ok: boolean | null;
    isFrontier: boolean;
  };
  selectedId?: string | null;
}) => {
  const { cx = 0, cy = 0, payload, selectedId } = props;
  if (!payload) return null;
  const isSelected = payload.solution_id === selectedId;
  const { isFrontier } = payload;

  if (payload.sanity_ok === false) {
    return (
      <g>
        <circle
          cx={cx}
          cy={cy}
          r={isSelected ? 8 : 5}
          fill="#f59e0b"
          stroke={isSelected ? "#b45309" : "#d97706"}
          strokeWidth={1.5}
          opacity={0.85}
        />
        <text
          x={cx}
          y={cy + 1}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={8}
          fill="white"
        >
          !
        </text>
      </g>
    );
  }

  if (isFrontier) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={isSelected ? 6 : 3}
        fill={isSelected ? "#f59e0b" : "#dc2626"}
        stroke={isSelected ? "#b45309" : "none"}
        strokeWidth={isSelected ? 2 : 0}
        opacity={0.9}
      />
    );
  }

  // Interior (dominated): navy blue
  return (
    <circle
      cx={cx}
      cy={cy}
      r={isSelected ? 6 : 3}
      fill={isSelected ? "#f59e0b" : "#1e3a5f"}
      stroke={isSelected ? "#b45309" : "none"}
      strokeWidth={isSelected ? 2 : 0}
    />
  );
};

const FrontierChart = ({
  solutions,
  selectedId,
  onSelect,
}: Omit<Props, "runType">) => {
  const rawData = solutions
    .filter((s) => s.penalty_total !== null && s.ratings_total !== null)
    .map((s) => ({
      x: s.penalty_total as number,
      y: s.ratings_total as number,
      solution_id: s.solution_id,
      incumbent_number: s.incumbent_number,
      sanity_ok: s.sanity_ok,
      assignment_changes: s.assignment_changes,
    }));

  const frontierIds = computeFrontierIds(rawData);

  const data = rawData.map((pt) => ({
    ...pt,
    isFrontier: frontierIds.has(pt.solution_id),
  }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 rounded border border-dashed border-slate-300 text-slate-400 text-sm">
        Waiting for first incumbent…
      </div>
    );
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart
          margin={{ top: 12, right: 24, bottom: 28, left: 64 }}
          onClick={(e) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const point = (e as any)?.activePayload?.[0]?.payload;
            if (point) onSelect?.(point.solution_id);
          }}
          style={{ cursor: onSelect ? "pointer" : "default" }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="x"
            type="number"
            name="Penalty"
            domain={["auto", "auto"]}
            label={{
              value: "Penalty",
              position: "insideBottom",
              offset: -12,
              fontSize: 11,
            }}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) =>
              v.toLocaleString(undefined, { maximumFractionDigits: 0 })
            }
          />
          <YAxis
            dataKey="y"
            type="number"
            name="Ratings"
            domain={["auto", "auto"]}
            label={{
              value: "Ratings",
              angle: -90,
              position: "insideLeft",
              fontSize: 11,
            }}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => v.toFixed(1)}
          />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ payload }) => {
              const d = payload?.[0]?.payload;
              if (!d) return null;
              return (
                <div className="bg-white border border-slate-200 rounded shadow p-2 text-xs">
                  <p className="font-medium">Incumbent #{d.incumbent_number}</p>
                  <p>
                    Penalty:{" "}
                    {(d.x as number).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </p>
                  <p>Ratings: {(d.y as number).toFixed(3)}</p>
                  {d.assignment_changes !== null &&
                    d.assignment_changes !== undefined && (
                      <p>Changes: {d.assignment_changes}</p>
                    )}
                  {d.sanity_ok === false && (
                    <p className="text-amber-600 font-medium mt-1">
                      ⚠ Sanity check failed
                    </p>
                  )}
                </div>
              );
            }}
          />
          <Scatter
            data={data}
            shape={(props: unknown) => (
              <FrontierDot
                {...(props as {
                  cx?: number;
                  cy?: number;
                  payload?: {
                    solution_id: string;
                    sanity_ok: boolean | null;
                    isFrontier: boolean;
                  };
                })}
                selectedId={selectedId}
              />
            )}
          />
        </ScatterChart>
      </ResponsiveContainer>
      <p className="text-center text-[10px] text-slate-400 mt-1">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 align-middle mr-1" />
        Frontier &nbsp;
        <span className="inline-block w-2 h-2 rounded-full bg-[#1e3a5f] align-middle mr-1 opacity-55" />
        Interior &nbsp;
      </p>
    </div>
  );
};

// ── Incumbent Objective Line (all other run types) ────────────────────────────

const LineObjectiveChart = ({
  solutions,
  selectedId,
  onSelect,
}: Omit<Props, "runType">) => {
  const filtered = solutions.filter(
    (s) => s.objective_value === null || s.objective_value <= OBJ_CAP,
  );

  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 rounded border border-dashed border-slate-300 text-slate-400 text-sm">
        Waiting for first incumbent…
      </div>
    );
  }

  const data = filtered.map((s) => ({
    incumbent: s.incumbent_number,
    ts: new Date(fixTs(s.found_at)).getTime(),
    obj: s.objective_value ?? 0,
    solution_id: s.solution_id,
  }));

  const selected = data.find((d) => d.solution_id === selectedId);

  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={data}
          margin={{ top: 12, right: 24, bottom: 28, left: 48 }}
          onClick={(e) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const point = (e as any)?.activePayload?.[0]?.payload;
            if (point) onSelect?.(point.solution_id);
          }}
          style={{ cursor: onSelect ? "pointer" : "default" }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={fmtTime}
            label={{
              value: "Time",
              position: "insideBottom",
              offset: -12,
              fontSize: 11,
            }}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            dataKey="obj"
            name="Objective"
            label={{
              value: "Objective value",
              angle: -90,
              position: "insideLeft",
              fontSize: 11,
            }}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            content={({ payload }) => {
              const d = payload?.[0]?.payload;
              if (!d) return null;
              return (
                <div className="bg-white border border-slate-200 rounded shadow p-2 text-xs">
                  <p className="font-medium">Incumbent #{d.incumbent}</p>
                  <p>
                    Objective:{" "}
                    {d.obj.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-slate-400">{fmtTime(d.ts)}</p>
                </div>
              );
            }}
          />
          <Line
            type="stepAfter"
            dataKey="obj"
            stroke="#1e3a5f"
            strokeWidth={1.5}
            dot={{ r: 3, fill: "#1e3a5f" }}
            activeDot={{ r: 5 }}
          />
          {selected && (
            <ReferenceDot
              x={selected.ts}
              y={selected.obj}
              r={7}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={2}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      <p className="text-center text-[10px] text-slate-400 mt-1">
        Objective value decreases as the solver finds better incumbents.
        Enrichment (penalty / ratings decomposition) available after solve.
      </p>
    </div>
  );
};

// ── Public component ──────────────────────────────────────────────────────────

const ObjectiveChart = ({
  solutions,
  selectedId,
  onSelect,
  runType,
}: Props) => {
  if (runType === "MultiObjective" || runType === "Perturbation") {
    return (
      <FrontierChart
        solutions={solutions}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    );
  }
  return (
    <LineObjectiveChart
      solutions={solutions}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  );
};

export default ObjectiveChart;
