import { useState } from 'react'
import useMockSolverConfig, { type MockSolverConfig } from '@/hooks/useMockSolverConfig'

const FIELDS: { key: keyof Omit<MockSolverConfig, 'id'>; label: string; hint: string }[] = [
  { key: 'penalty_only_multiplier',    label: 'Penalty Only Multiplier',    hint: 'Scales the pause between updates. Smaller = faster replay.' },
  { key: 'penalty_only_max_gap',       label: 'Penalty Only Max Gap (s)',   hint: 'Longest pause between updates, in seconds. Smaller = faster.' },
  { key: 'multi_objective_multiplier', label: 'Multi-Objective Multiplier', hint: 'Scales the pause between updates. Smaller = faster replay.' },
  { key: 'multi_objective_max_gap',    label: 'Multi-Objective Max Gap (s)', hint: 'Longest pause between updates, in seconds. Smaller = faster.' },
]

const inputCls =
  'w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'

const SolverConfigPage = () => {
  const { data, isLoading, update, isUpdating } = useMockSolverConfig()
  const [edits, setEdits] = useState<Partial<Omit<MockSolverConfig, 'id'>>>({})

  if (isLoading || !data) return <p className="text-slate-500 text-sm">Loading…</p>

  const values = { ...data, ...edits }

  const handleChange = (key: keyof Omit<MockSolverConfig, 'id'>, raw: string) => {
    setEdits((prev) => ({ ...prev, [key]: parseFloat(raw) || 0 }))
  }

  const handleSave = () => {
    const { id: _, ...rest } = values
    update(rest, { onSuccess: () => setEdits({}) })
  }

  const isDirty = Object.keys(edits).length > 0

  return (
    <div className="max-w-lg flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Solver Config</h1>
        <p className="mt-1 text-sm text-slate-500">
          Controls mock solver replay timing. Sleep per incumbent ={' '}
          <code className="bg-slate-100 px-1 rounded">min(gap × multiplier, max_gap)</code> seconds.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4">
        {FIELDS.map(({ key, label, hint }) => (
          <div key={key}>
            <label className={labelCls}>{label}</label>
            <input
              type="number"
              step="0.01"
              min={0}
              value={values[key]}
              onChange={(e) => handleChange(key, e.target.value)}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-slate-400">{hint}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={!isDirty || isUpdating}
          className="px-4 py-2 bg-slate-900 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUpdating ? 'Saving…' : 'Save'}
        </button>
        {isDirty && !isUpdating && (
          <button
            onClick={() => setEdits({})}
            className="text-sm text-slate-500 hover:text-slate-700 underline"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

export default SolverConfigPage
