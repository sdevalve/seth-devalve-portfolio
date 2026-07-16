import { Link } from 'react-router-dom'
import type Solution from '@/entities/Solution'

interface Props {
  solutions: Solution[]
  selectedId?: string | null
  onSelect?: (solutionId: string) => void
  scheduleLinkSuffix?: string
  runType?: string
}

/** Append Z if no timezone suffix so DB-stored UTC strings parse correctly. */
const fixTs = (ts: string) => (/Z|[+-]\d{2}:\d{2}$/.test(ts) ? ts : ts + 'Z')

const IncumbentFeed = ({ solutions, selectedId, onSelect, scheduleLinkSuffix = '', runType }: Props) => (
  <div className="border border-slate-200 rounded overflow-hidden">
    <div className="bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
      Incumbents ({solutions.length})
    </div>
    <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
      {solutions.length === 0 && (
        <p className="text-center text-slate-400 text-xs py-6">Waiting for first solution…</p>
      )}
      {[...solutions].reverse().map((sol) => (
        <button
          key={sol.solution_id}
          onClick={() => onSelect?.(sol.solution_id)}
          className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors ${
            sol.solution_id === selectedId ? 'bg-blue-50 border-l-2 border-blue-500' : ''
          }`}
        >
          <div className="flex justify-between items-center">
            <span className="font-medium text-slate-800">#{sol.incumbent_number}</span>
            <div className="flex items-center gap-2">
              <Link
                to={`/schedule?solution=${sol.solution_id}${scheduleLinkSuffix}`}
                onClick={(e) => e.stopPropagation()}
                className="text-blue-500 hover:underline text-[10px]"
              >
                View
              </Link>
              <span className="text-slate-400 text-[10px]">
                {new Date(fixTs(sol.found_at)).toLocaleTimeString()}
              </span>
            </div>
          </div>
          <div className="flex gap-3 mt-0.5 text-slate-600">
            {runType === 'Perturbation' && sol.assignment_changes !== null && (
              <span>Changes: {sol.assignment_changes}</span>
            )}
            {runType === 'Perturbation' && sol.objective_value !== null && (
              <span>Obj: {sol.objective_value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            )}
            {sol.penalty_total !== null && (
              <span>Penalty: {sol.penalty_total.toFixed(1)}</span>
            )}
            {sol.ratings_total !== null && (
              <span>Ratings: {sol.ratings_total.toFixed(3)}</span>
            )}
            {runType === 'Perturbation' && sol.optimality_gap !== null && (
              <span>Gap: {(sol.optimality_gap * 100).toFixed(1)}%</span>
            )}
          </div>
        </button>
      ))}
    </div>
  </div>
)

export default IncumbentFeed
