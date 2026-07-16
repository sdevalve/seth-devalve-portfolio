import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import useRun from '@/hooks/useRun'
import { axiosInstance } from '@/services/api-client'
import useSolutions from '@/hooks/useSolutions'
import ObjectiveChart from '@/components/run/ObjectiveChart'
import IncumbentFeed from '@/components/run/IncumbentFeed'
import LogViewer from '@/components/run/LogViewer'
import type Solution from '@/entities/Solution'

const STATUS_COLORS: Record<string, string> = {
  queued:            'bg-slate-200 text-slate-700',
  building:          'bg-purple-100 text-purple-800',
  feasibility_check: 'bg-yellow-100 text-yellow-800',
  incumbent_generation: 'bg-violet-100 text-violet-800',
  solving:           'bg-blue-100 text-blue-800',
  perturbating:      'bg-cyan-100 text-cyan-800',
  'Warm Starting':   'bg-indigo-100 text-indigo-800',
  infeasible: 'bg-orange-100 text-orange-800',
  complete:   'bg-green-100 text-green-800',
  failed:     'bg-red-100 text-red-800',
  stopped:    'bg-amber-100 text-amber-700',
}

const TERMINAL = new Set(['complete', 'failed', 'stopped', 'infeasible'])

const RunDetailPage = () => {
  const { runId } = useParams<{ runId: string }>()
  const queryClient = useQueryClient()
  const { data: run } = useRun(runId ?? null)
  const { data: storedSolutions = [] } = useSolutions(runId ?? null)

  // Live incumbent state fed by SSE — stored in React Query cache so it
  // survives navigation away and back (e.g. clicking View on SchedulePage).
  const liveKey = ['live-solutions', runId] as const
  const { data: liveSolutions = [] } = useQuery<Solution[]>({
    queryKey: liveKey,
    queryFn: () => Promise.resolve([]),
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const [logInstances, setLogInstances] = useState<Record<number, string[]>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  // Perturbation live stats (updated by pert_incumbent + pert_progress SSE events)
  const [pertBestObj, setPertBestObj] = useState<number | null>(null)
  const [pertBestBound, setPertBestBound] = useState<number | null>(null)
  const [pertNodeCount, setPertNodeCount] = useState<number | null>(null)
  const [pertGapPct, setPertGapPct] = useState<number | null>(null)
  const [pertIncumbentCount, setPertIncumbentCount] = useState(0)

  async function handleCancel() {
    if (!runId || cancelling) return
    setCancelling(true)
    try {
      await axiosInstance.post(`/runs/${runId}/cancel`)
      queryClient.invalidateQueries({ queryKey: ['runs', runId] })
    } finally {
      setCancelling(false)
    }
  }

  // Fetch existing log content on mount — restores log after navigation or for terminal runs
  // where the SSE stream closes immediately and emits no log events.
  useEffect(() => {
    if (!runId) return
    axiosInstance
      .get<{ instances: Record<string, string[]> }>(`/runs/${runId}/log`)
      .then((res) => {
        const map: Record<number, string[]> = {}
        for (const [k, v] of Object.entries(res.data.instances)) {
          if (v.length > 0) map[Number(k)] = v
        }
        if (Object.keys(map).length > 0) setLogInstances(map)
      })
      .catch(() => {})
  }, [runId])

  useEffect(() => {
    if (!runId) return
    if (esRef.current) return   // already open

    const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:8001'
    const es = new EventSource(`${apiBase}/runs/${runId}/stream`)
    esRef.current = es

    es.addEventListener('status', () => {
      queryClient.invalidateQueries({ queryKey: ['runs', runId] })
    })

    es.addEventListener('incumbent', (e) => {
      const payload = JSON.parse(e.data) as {
        incumbent_num: number
        obj_value: number | null
        solution_id: string
        penalty_total: number | null
        ratings_total: number | null
        sanity_ok: boolean | null
      }
      const newSol: Solution = {
        solution_id:        payload.solution_id,
        run_id:             runId,
        job_id:             null,
        incumbent_number:   payload.incumbent_num,
        sol_file_path:      null,
        objective_value:    payload.obj_value,
        penalty_score:      null,
        ratings_score:      null,
        penalty_total:      payload.penalty_total ?? null,
        ratings_total:      payload.ratings_total ?? null,
        sanity_ok:          payload.sanity_ok ?? null,
        optimality_gap:     null,
        assignment_changes:    null,
        schedule_records_json: null,
        dh_by_week_json:       null,
        is_final:              false,
        is_perturbation:       false,
        found_at:              new Date().toISOString(),
      }
      queryClient.setQueryData<Solution[]>(liveKey, (prev = []) => [...prev, newSol])
    })

    es.addEventListener('pert_incumbent', (e) => {
      const p = JSON.parse(e.data) as { obj_value: number | null }
      if (p.obj_value !== null) setPertBestObj(p.obj_value)
      setPertIncumbentCount((n) => n + 1)
    })

    es.addEventListener('pert_progress', (e) => {
      const p = JSON.parse(e.data) as {
        best_obj: number
        best_bound: number
        node_count: number
        gap_pct: number
      }
      setPertBestObj(p.best_obj)
      setPertBestBound(p.best_bound)
      setPertNodeCount(p.node_count)
      setPertGapPct(p.gap_pct)
    })

    es.addEventListener('log', (e) => {
      const payload = JSON.parse(e.data) as { instance?: number; lines: string[] }
      const inst = payload.instance ?? 0
      setLogInstances((prev) => ({
        ...prev,
        [inst]: [...(prev[inst] ?? []), ...payload.lines],
      }))
    })

    const closeOnTerminal = () => {
      queryClient.invalidateQueries({ queryKey: ['runs', runId] })
      queryClient.invalidateQueries({ queryKey: ['solutions', runId] })
      queryClient.removeQueries({ queryKey: liveKey })
      es.close()
      esRef.current = null
    }

    es.addEventListener('complete',   closeOnTerminal)
    es.addEventListener('failed',     closeOnTerminal)
    es.addEventListener('stopped',    closeOnTerminal)
    es.addEventListener('infeasible', closeOnTerminal)
    es.onerror = () => { es.close(); esRef.current = null }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [runId, queryClient])

  if (!run) return <p className="text-slate-400 text-sm">Loading run…</p>

  const statusClass = STATUS_COLORS[run.status] ?? 'bg-slate-100 text-slate-600'

  // Merge stored (historical) + live (SSE) solutions, deduplicated by solution_id.
  // Pert solutions are excluded — they appear only in the Perturbation Status Panel.
  const liveIds = new Set(liveSolutions.map((s) => s.solution_id))
  const mergedSolutions: Solution[] = [
    ...storedSolutions.filter((s) => !liveIds.has(s.solution_id) && !s.is_perturbation),
    ...liveSolutions.filter((s) => !s.is_perturbation),
  ].sort((a, b) => a.incumbent_number - b.incumbent_number)

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{run.name}</h1>
          <p className="text-sm text-slate-500">
            {run.run_type} · {run.scope} · Season {run.season_id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}`}>
            {run.status}
          </span>
          {!TERMINAL.has(run.status) && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
        </div>
      </div>

      {/* Infeasibility panel */}
      {run.status === 'infeasible' && run.error_message && (() => {
        const em = run.error_message!
        const rows = em.infeas_rows
        const cols = rows && rows.length > 0 ? Object.keys(rows[0]) : []
        return (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm">
            <p className="font-semibold text-orange-800 mb-1">Model infeasible. LP relaxation failed.</p>
            <p className="text-orange-700 mb-2">{em.message}</p>

            {/* Ledger rows table */}
            {rows && rows.length > 0 && (
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-orange-100">
                      {cols.map((c) => (
                        <th key={c} className="px-2 py-1 text-left font-semibold text-orange-800 border border-orange-200 whitespace-nowrap">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-orange-50'}>
                        {cols.map((c) => (
                          <td key={c} className="px-2 py-1 text-orange-900 border border-orange-100 whitespace-nowrap">
                            {String(row[c] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Fallback: hardcoded constraint infeasibility */}
            {(!rows || rows.length === 0) && em.all_iis_rows && em.all_iis_rows.length > 0 && (
              <p className="text-orange-600 text-xs mt-1">
                No ledger rows in IIS. Infeasibility is in hardcoded constraints.{' '}
                Raw IIS row indices: {em.all_iis_rows.join(', ')}
              </p>
            )}
          </div>
        )
      })()}

      {/* Perturbation Status Panel — shown while perturbating */}
      {run.status === 'perturbating' && (
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-cyan-800">Perturbation Solve</span>
            <span className="text-[10px] font-normal text-cyan-600 animate-pulse">● live</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-cyan-600 uppercase tracking-wide">
                Best so far
              </span>
              <span className="text-lg font-bold text-cyan-900">
                {pertBestObj !== null ? pertBestObj.toFixed(0) : '—'}
              </span>
              <span className="text-[10px] text-cyan-600">assignment changes</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-cyan-600 uppercase tracking-wide">
                Lower bound
              </span>
              <span className="text-lg font-bold text-cyan-900">
                {pertBestBound !== null ? pertBestBound.toFixed(2) : '—'}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-cyan-600 uppercase tracking-wide">
                Gap
              </span>
              <span className="text-lg font-bold text-cyan-900">
                {pertGapPct !== null ? `${pertGapPct.toFixed(1)}%` : '—'}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-cyan-600 uppercase tracking-wide">
                Nodes / Incumbents
              </span>
              <span className="text-lg font-bold text-cyan-900">
                {pertNodeCount !== null ? pertNodeCount.toLocaleString() : '—'}
                {' / '}
                {pertIncumbentCount}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Objective chart + incumbent feed */}
      {run.status !== 'infeasible' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-2">
              Objective Value
              {!TERMINAL.has(run.status) && (
                <span className="ml-2 text-[10px] font-normal text-blue-600 animate-pulse">
                  ● live
                </span>
              )}
            </h2>
            <ObjectiveChart
              solutions={mergedSolutions}
              selectedId={selectedId}
              onSelect={setSelectedId}
              runType={run.run_type}
            />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Incumbents</h2>
            <IncumbentFeed
              solutions={mergedSolutions}
              selectedId={selectedId}
              onSelect={setSelectedId}
              runType={run.run_type}
            />
          </div>
        </div>
      )}

      {/* Gurobi log — 1 instance: full-width; 2: side-by-side; 3+: tabs */}
      <LogSection logInstances={logInstances} />
    </div>
  )
}

function LogSection({ logInstances }: { logInstances: Record<number, string[]> }) {
  const [activeTab, setActiveTab] = useState(0)
  const keys = Object.keys(logInstances).map(Number).sort((a, b) => a - b)
  const totalLines = keys.reduce((s, k) => s + (logInstances[k]?.length ?? 0), 0)
  if (keys.length === 0 || totalLines === 0) return null

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700 mb-2">Gurobi Log</h2>

      {keys.length === 1 && (
        <LogViewer lines={logInstances[keys[0]]} />
      )}

      {keys.length === 2 && (
        <div className="grid grid-cols-2 gap-3">
          {keys.map((k) => (
            <div key={k}>
              <div className="text-xs font-medium text-slate-500 mb-1">Instance {k + 1}</div>
              <LogViewer lines={logInstances[k]} />
            </div>
          ))}
        </div>
      )}

      {keys.length >= 3 && (
        <div>
          <div className="flex gap-1 mb-2">
            {keys.map((k) => (
              <button
                key={k}
                onClick={() => setActiveTab(k)}
                className={`px-3 py-1 text-xs rounded-t border ${
                  activeTab === k
                    ? 'bg-slate-950 text-green-400 border-slate-700'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                }`}
              >
                Instance {k + 1}
              </button>
            ))}
          </div>
          <LogViewer lines={logInstances[activeTab] ?? []} />
        </div>
      )}
    </div>
  )
}

export default RunDetailPage
