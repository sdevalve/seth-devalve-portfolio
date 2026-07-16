import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import useSolution from '@/hooks/useSolution'
import useTeams from '@/hooks/useTeams'
import useSeason from '@/hooks/useSeason'
import useSeasonStore from '@/store/useSeasonStore'
import useColorPolicy from '@/hooks/useColorPolicy'
import useSaveFixedGameSet from '@/hooks/useSaveFixedGameSet'
import useRun from '@/hooks/useRun'
import ScheduleGrid from '@/components/schedule/ScheduleGrid'
import ExportPanel from '@/components/schedule/ExportPanel'
import PrerequisiteGuard from '@/components/PrerequisiteGuard'
import type { ScheduleRecord } from '@/entities/Solution'
import type { FixedGame } from '@/entities/FixedGameSet'

function buildFixedGames(pairKeys: Set<string>, records: ScheduleRecord[]): FixedGame[] {
  return [...pairKeys].map((key) => {
    const [weekStr, lo, hi] = key.split('|')
    const week = parseInt(weekStr)
    const rec = records.find(
      (r) => r.week === week &&
        ((r.home === lo && r.away === hi) || (r.home === hi && r.away === lo))
    )!
    return { week: rec.week, home_abbr: rec.home, away_abbr: rec.away, slot: rec.slot, tod: rec.tod ?? undefined }
  })
}

/**
 * Compare two sets of schedule records and return the pair keys that differ.
 * A cell is "changed" if any of {slot, tod, home, away} differs for a given
 * (team, week) combination — covering both content changes (different opponent)
 * and formatting changes (different slot or time-of-day).
 */
function computeChangedPairKeys(
  newRecords: ScheduleRecord[],
  oldRecords: ScheduleRecord[],
): { newKeys: Set<string>; oldKeys: Set<string> } {
  const buildMaps = (records: ScheduleRecord[]) => {
    const sig = new Map<string, string>()          // "week|team" → signature
    const rec = new Map<string, ScheduleRecord>()  // "week|team" → record
    for (const r of records) {
      const s = `${r.slot}|${r.tod}`
      sig.set(`${r.week}|${r.home}`, `${s}|${r.away}|home`)
      sig.set(`${r.week}|${r.away}`, `${s}|${r.home}|away`)
      rec.set(`${r.week}|${r.home}`, r)
      rec.set(`${r.week}|${r.away}`, r)
    }
    return { sig, rec }
  }

  const { sig: newSig, rec: newRec } = buildMaps(newRecords)
  const { sig: oldSig, rec: oldRec } = buildMaps(oldRecords)

  const pk = (r: ScheduleRecord) => {
    const lo = r.home < r.away ? r.home : r.away
    const hi = r.home < r.away ? r.away : r.home
    return `${r.week}|${lo}|${hi}`
  }

  const newKeys = new Set<string>()
  const oldKeys = new Set<string>()

  for (const tw of new Set([...newSig.keys(), ...oldSig.keys()])) {
    if (newSig.get(tw) === oldSig.get(tw)) continue
    const nr = newRec.get(tw); if (nr) newKeys.add(pk(nr))
    const or = oldRec.get(tw); if (or) oldKeys.add(pk(or))
  }

  return { newKeys, oldKeys }
}

const SchedulePage = () => {
  const { selectedSeason } = useSeasonStore()
  const [searchParams] = useSearchParams()
  const solutionId = searchParams.get('solution')
  const from = searchParams.get('from')

  const { data: solution, isLoading: solutionLoading } = useSolution(solutionId)
  const { data: run } = useRun(solution?.run_id ?? null)
  const { data: teams } = useTeams(selectedSeason)
  const { data: season } = useSeason(selectedSeason)
  const { data: colorPolicy } = useColorPolicy(selectedSeason)

  const [fixGamesMode, setFixGamesMode] = useState(false)
  const [fixedPairKeys, setFixedPairKeys] = useState<Set<string>>(new Set())
  const [fixedSetName, setFixedSetName] = useState('')
  const saveFixedSet = useSaveFixedGameSet(selectedSeason)

  // ── Perturbation comparison ────────────────────────────────────────────────
  const [showComparison, setShowComparison] = useState(false)

  // warm_start_solution_id is stored in run_params["warm_start"]["solution_id"]
  const warmStartSolutionId: string | null =
    run?.run_type === 'Perturbation'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (((run.run_params as any)?.warm_start?.solution_id) ?? null)
      : null

  // Fetch the warm-start solution eagerly so data is ready when the button is clicked.
  // useSolution is a no-op when the id is null.
  const { data: warmStartSolution } = useSolution(warmStartSolutionId)

  // Reset comparison when the viewed solution changes
  useEffect(() => {
    setShowComparison(false)
  }, [solutionId])

  // Compute which pair keys differ between the perturbed and warm-start schedules
  const { newKeys: diffNewKeys, oldKeys: diffOldKeys } = useMemo(() => {
    if (
      !showComparison ||
      !solution?.schedule_records_json ||
      !warmStartSolution?.schedule_records_json
    ) {
      return { newKeys: new Set<string>(), oldKeys: new Set<string>() }
    }
    return computeChangedPairKeys(
      solution.schedule_records_json,
      warmStartSolution.schedule_records_json,
    )
  }, [showComparison, solution?.schedule_records_json, warmStartSolution?.schedule_records_json])

  // Merge diff highlights with the user's manually-fixed keys for the main grid
  const combinedFixedKeys = useMemo(
    () => (diffNewKeys.size > 0 ? new Set([...fixedPairKeys, ...diffNewKeys]) : fixedPairKeys),
    [fixedPairKeys, diffNewKeys],
  )
  // ──────────────────────────────────────────────────────────────────────────

  const toggleFixed = (key: string) =>
    setFixedPairKeys((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  // Clear selections and name whenever fix mode is exited.
  useEffect(() => {
    if (!fixGamesMode) {
      setFixedPairKeys(new Set())
      setFixedSetName('')
    }
  }, [fixGamesMode])

  const prerequisitesMet = !!selectedSeason && !!solutionId

  return (
    <PrerequisiteGuard
      met={prerequisitesMet}
      message="Navigate here from History by selecting a solution, or append ?solution=<id> to the URL."
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              {solution && (
                <Link
                  to={from === 'history' ? `/history?run=${solution.run_id}` : `/runs/${solution.run_id}`}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-100 text-slate-700 font-medium"
                >
                  {from === 'history' ? '← Back to History' : '← Back to Run'}
                </Link>
              )}
              <h1 className="text-xl font-bold text-slate-900">Schedule Viewer</h1>
            </div>
            {solution && (
              <p className="text-sm text-slate-500">
                Incumbent #{solution.incumbent_number} · Penalty:{' '}
                {solution.penalty_total?.toFixed(1) ?? '—'} · Ratings:{' '}
                {solution.ratings_total?.toFixed(3) ?? '—'}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {/* Compare Schedules — only for Perturbation runs with a resolved warm-start schedule */}
            {warmStartSolutionId && warmStartSolution?.schedule_records_json && (
              <button
                onClick={() => setShowComparison((s) => !s)}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${
                  showComparison
                    ? 'bg-blue-700 text-white hover:bg-blue-800'
                    : 'border border-slate-300 hover:bg-slate-100'
                }`}
              >
                {showComparison ? 'Hide Comparison' : 'Compare Schedules'}
              </button>
            )}
            <button
              onClick={() => setFixGamesMode((m) => !m)}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                fixGamesMode
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'border border-slate-300 hover:bg-slate-100'
              }`}
            >
              {fixGamesMode ? 'Exit Fix Mode' : 'Fix Games Mode'}
            </button>
            {fixedPairKeys.size > 0 && fixGamesMode && (
              <>
                <input
                  value={fixedSetName}
                  onChange={(e) => setFixedSetName(e.target.value)}
                  placeholder="Name this set…"
                  className="px-2 py-1.5 text-sm border border-slate-300 rounded w-40"
                />
                <button
                  disabled={!fixedSetName.trim() || saveFixedSet.isPending}
                  onClick={() =>
                    saveFixedSet.mutate(
                      {
                        season: selectedSeason!,
                        name: fixedSetName.trim(),
                        source_solution_id: solutionId,
                        games: buildFixedGames(fixedPairKeys, solution!.schedule_records_json!),
                      },
                      { onSuccess: () => setFixGamesMode(false) }
                    )
                  }
                  className="px-3 py-1.5 text-sm bg-green-700 text-white rounded hover:bg-green-600 disabled:opacity-50"
                >
                  {saveFixedSet.isPending ? 'Saving…' : `Save Fixed Set (${fixedPairKeys.size})`}
                </button>
              </>
            )}
          </div>
        </div>

        {fixGamesMode && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Click any game cell to toggle it as fixed. Fixed games appear with a red outline.
          </p>
        )}

        {solutionLoading && <p className="text-slate-400 text-sm">Loading solution…</p>}
        {solution && !solution.schedule_records_json && !solutionLoading && (
          <p className="text-slate-400 text-sm">Schedule not yet available. Records are computed after the solve completes.</p>
        )}

        {/* Main schedule grid — diff highlights merged with user-fixed keys */}
        {solution && teams && season && solution.schedule_records_json && (
          <ScheduleGrid
            teams={teams}
            records={solution.schedule_records_json}
            numWeeks={season.num_weeks}
            colorPolicy={colorPolicy ?? null}
            dhByWeek={solution.dh_by_week_json}
            fixedPairKeys={combinedFixedKeys}
            fixGamesMode={fixGamesMode}
            onToggleFixed={toggleFixed}
          />
        )}

        {/* Comparison grid — warm-start schedule with changed cells highlighted */}
        {showComparison && warmStartSolution?.schedule_records_json && teams && season && (
          <div className="mt-4">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-sm font-semibold text-slate-700">Starting Schedule</h2>
              <span className="text-xs text-slate-400">
                Incumbent #{warmStartSolution.incumbent_number}
                {warmStartSolution.penalty_total != null &&
                  ` · Penalty: ${warmStartSolution.penalty_total.toFixed(1)}`}
                {warmStartSolution.ratings_total != null &&
                  ` · Ratings: ${warmStartSolution.ratings_total.toFixed(3)}`}
              </span>
              {diffNewKeys.size > 0 && (
                <span className="text-xs text-red-600 font-medium">
                  {diffNewKeys.size} game{diffNewKeys.size !== 1 ? 's' : ''} changed
                </span>
              )}
            </div>
            <ScheduleGrid
              teams={teams}
              records={warmStartSolution.schedule_records_json}
              numWeeks={season.num_weeks}
              colorPolicy={colorPolicy ?? null}
              dhByWeek={warmStartSolution.dh_by_week_json}
              fixedPairKeys={diffOldKeys}
            />
          </div>
        )}

        {solution && solutionId && (
          <ExportPanel solutionId={solutionId} />
        )}
      </div>
    </PrerequisiteGuard>
  )
}

export default SchedulePage
