import { useState } from 'react'
import { Link } from 'react-router-dom'
import useSeasonStore from '@/store/useSeasonStore'
import useSeasonProgress from '@/hooks/useSeasonProgress'
import useSeasons from '@/hooks/useSeasons'
import useCreateSeason from '@/hooks/useCreateSeason'
import StepStatusBadge from '@/components/StepStatusBadge'

const STEPS = [
  {
    num: 1,
    label: 'Season Settings',
    path: '/season-settings',
    key: 'season_settings' as const,
    desc: 'Configure schedule length, bye rules, and season parameters',
  },
  {
    num: 2,
    label: 'Teams',
    path: '/teams',
    key: 'teams' as const,
    desc: 'Enter all teams with conference and division assignments',
  },
  {
    num: 3,
    label: 'Matchups',
    path: '/matchups',
    key: 'matchups' as const,
    desc: 'Upload the full matchup list for the season',
  },
  {
    num: 4,
    label: 'Slots & Networks',
    path: '/slots-networks',
    key: 'slots_networks' as const,
    desc: 'Define broadcast slots and networks for the season',
  },
  {
    num: 5,
    label: 'Weekmap',
    path: '/weekmap',
    key: 'slots_weekmap' as const,
    desc: 'Assign networks to each broadcast slot for every week',
  },
  {
    num: 6,
    label: 'Ruleset',
    path: '/ruleset',
    key: 'ruleset' as const,
    desc: 'Configure scheduling constraints and objective penalties',
  },
  {
    num: 7,
    label: 'Run',
    path: '/run',
    key: 'run' as const,
    desc: 'Launch optimization jobs on the Gurobi compute server',
  },
]

const currentYear = new Date().getFullYear()

const HomePage = () => {
  const { selectedSeason } = useSeasonStore()
  const { data: progress } = useSeasonProgress(selectedSeason)
  const { data: seasons } = useSeasons()
  const createSeason = useCreateSeason()

  const [yearInput, setYearInput] = useState(String(currentYear))
  const [inputError, setInputError] = useState<string | null>(null)

  const handleCreate = () => {
    setInputError(null)
    const year = Number(yearInput)

    if (!Number.isInteger(year) || year < 1920 || year > 2100) {
      setInputError('Enter a valid NFL season year (e.g. 2025).')
      return
    }

    if (seasons?.some((s) => s.year === year)) {
      setInputError(`Season ${year} already exists. Select it from the dropdown above.`)
      return
    }

    createSeason.mutate(year, {
      onError: () => setInputError('Failed to create season. Check that the API server is running.'),
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleCreate()
  }

  const errorMessage = inputError ?? (createSeason.isError ? 'Server error. Season was not created.' : null)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">NFL Schedule Optimizer</h1>
        <p className="text-slate-500 text-sm mt-1">
          {selectedSeason
            ? `Active season: ${selectedSeason}`
            : 'Create or select a season to get started.'}
        </p>
      </div>

      {/* ── Create New Season ───────────────────────────────────────────── */}
      <div className="mb-6 p-5 rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
          Create New Season
        </h2>
        <div className="flex gap-2 items-start">
          <div className="flex flex-col gap-1">
            <input
              type="number"
              value={yearInput}
              onChange={(e) => {
                setYearInput(e.target.value)
                setInputError(null)
              }}
              onKeyDown={handleKeyDown}
              placeholder="e.g. 2025"
              min={1920}
              max={2100}
              className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errorMessage && (
              <p className="text-xs text-red-600">{errorMessage}</p>
            )}
          </div>
          <button
            onClick={handleCreate}
            disabled={createSeason.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {createSeason.isPending ? 'Creating…' : 'Create Season'}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          The new season will be added to the dropdown and set as active.
        </p>
      </div>

      {/* ── Workflow checklist ──────────────────────────────────────────── */}
      <div className="space-y-2">
        {STEPS.map((step) => {
          const done = progress?.[step.key] ?? false
          return (
            <Link key={step.path} to={step.path} className="block group">
              <div className="flex items-start gap-4 p-4 rounded-lg border border-slate-200 bg-white group-hover:border-slate-400 transition-colors">
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    done ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {done ? '✓' : step.num}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900 text-sm">{step.label}</span>
                    <StepStatusBadge complete={done} />
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{step.desc}</p>
                </div>
                <span className="text-slate-300 group-hover:text-slate-500 transition-colors">→</span>
              </div>
            </Link>
          )
        })}
      </div>

      <div className="mt-6 flex gap-2">
        <Link
          to="/history"
          className="text-sm text-slate-600 hover:text-slate-900 underline underline-offset-2"
        >
          View run history →
        </Link>
        <span className="text-slate-300">|</span>
        <Link
          to="/schedule"
          className="text-sm text-slate-600 hover:text-slate-900 underline underline-offset-2"
        >
          View schedule grid →
        </Link>
      </div>
    </div>
  )
}

export default HomePage
