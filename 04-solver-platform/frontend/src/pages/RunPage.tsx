import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { runSchema, type RunFormData } from '@/schemas/runSchema'
import useRulesets from '@/hooks/useRulesets'
import useFixedGameSets from '@/hooks/useFixedGameSets'
import useCreateRun, { type RunPayload } from '@/hooks/useCreateRun'
import useSeasonStore from '@/store/useSeasonStore'
import useRunDraftStore from '@/store/useRunDraftStore'
import useNetCats from '@/hooks/useNetCats'
import usePredictionSets from '@/hooks/usePredictionSets'
import useRuns from '@/hooks/useRuns'
import PrerequisiteGuard from '@/components/PrerequisiteGuard'

// ── Shared style tokens ────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500'
const selectCls =
  'w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'
const sectionCls =
  'bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4'
const sectionTitleCls = 'text-sm font-semibold text-slate-800 uppercase tracking-wide'

// ── Panel: Run ID ──────────────────────────────────────────────────────────────

interface RunIdPanelProps {
  register: ReturnType<typeof useForm<RunFormData>>['register']
  errors: ReturnType<typeof useForm<RunFormData>>['formState']['errors']
}

const RunIdPanel = ({ register, errors }: RunIdPanelProps) => (
  <div className={sectionCls}>
    <p className={sectionTitleCls}>Run ID</p>

    <div>
      <label className={labelCls}>Run Name</label>
      <input
        {...register('name')}
        placeholder="e.g. 2025 PenaltyOnly v3"
        className={inputCls}
      />
      {errors.name && (
        <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>
      )}
    </div>

    <div>
      <label className={labelCls}>Comments</label>
      <textarea
        {...register('comments')}
        rows={4}
        maxLength={5000}
        placeholder="Write any notes here that describe the scope and purpose of this run…"
        className={`${inputCls} resize-y`}
      />
      {errors.comments && (
        <p className="text-red-500 text-xs mt-1">{errors.comments.message}</p>
      )}
    </div>
  </div>
)

// ── Panel: Constraints ─────────────────────────────────────────────────────────

interface ConstraintsPanelProps {
  register: ReturnType<typeof useForm<RunFormData>>['register']
  rulesetSnapshots: { ruleset_id: string; name: string }[]
  netCatSnapshots: { net_cats_id: string; name: string }[]
  fixedGameSets: { fixed_game_set_id: string; name: string }[] | undefined
  errors: ReturnType<typeof useForm<RunFormData>>['formState']['errors']
}

const ConstraintsPanel = ({
  register,
  rulesetSnapshots,
  netCatSnapshots,
  fixedGameSets,
  errors,
}: ConstraintsPanelProps) => (
  <div className={sectionCls}>
    <p className={sectionTitleCls}>Constraints</p>

    <div>
      <label className={labelCls}>Ruleset</label>
      <select {...register('ruleset_id')} className={selectCls}>
        <option value="">Select snapshot…</option>
        {rulesetSnapshots.map((rs) => (
          <option key={rs.ruleset_id} value={rs.ruleset_id}>
            {rs.name}
          </option>
        ))}
      </select>
      {errors.ruleset_id && (
        <p className="text-red-500 text-xs mt-1">{errors.ruleset_id.message}</p>
      )}
    </div>

    <div>
      <label className={labelCls}>
        Network Categories{' '}
        <span className="text-slate-400 font-normal">(optional)</span>
      </label>
      <select {...register('net_cats_id')} className={selectCls}>
        <option value="">None</option>
        {netCatSnapshots.map((nc) => (
          <option key={nc.net_cats_id} value={nc.net_cats_id}>
            {nc.name}
          </option>
        ))}
      </select>
    </div>

    <div>
      <label className={labelCls}>
        Fixed Game Set{' '}
        <span className="text-slate-400 font-normal">(optional)</span>
      </label>
      <select {...register('fixed_game_set_id')} className={selectCls}>
        <option value="">None</option>
        {fixedGameSets?.map((fg) => (
          <option key={fg.fixed_game_set_id} value={fg.fixed_game_set_id}>
            {fg.name}
          </option>
        ))}
      </select>
    </div>
  </div>
)

// ── Panel: Objective ───────────────────────────────────────────────────────────

interface ObjectivePanelProps {
  register: ReturnType<typeof useForm<RunFormData>>['register']
  predictionSets: { prediction_set_id: string; name: string }[] | undefined
  runType: string
}

const ObjectivePanel = ({ register, predictionSets, runType }: ObjectivePanelProps) => (
  <div className={sectionCls}>
    <p className={sectionTitleCls}>Objective</p>

    <div>
      <label className={labelCls}>Run Type</label>
      <select {...register('run_type')} className={selectCls}>
        <option value="PenaltyOnly">Penalty Only</option>
        <option value="MultiObjective">Multi-Objective (efficient frontier)</option>
      </select>
    </div>

    {runType === 'MultiObjective' && (
      <div>
        <label className={labelCls}>
          Ratings Predictions{' '}
          <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <select {...register('prediction_set_id')} className={selectCls}>
          <option value="">None</option>
          {predictionSets?.map((ps) => (
            <option key={ps.prediction_set_id} value={ps.prediction_set_id}>
              {ps.name}
            </option>
          ))}
        </select>
      </div>
    )}

    <div>
      <label className={labelCls}>Scope</label>
      <select {...register('scope')} className={selectCls}>
        <option value="Full">Full Schedule</option>
      </select>
    </div>
  </div>
)

// ── Page ──────────────────────────────────────────────────────────────────────

const RunPage = () => {
  const { selectedSeason } = useSeasonStore()
  const { data: rulesets } = useRulesets(selectedSeason)
  const { data: fixedGameSets } = useFixedGameSets(selectedSeason)
  const { data: netCatsList } = useNetCats(selectedSeason)
  const { data: predictionSetsList } = usePredictionSets(selectedSeason)
  const { data: allRuns } = useRuns(selectedSeason)
  const createRun = useCreateRun(selectedSeason)
  const navigate = useNavigate()
  const draft = useRunDraftStore()

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<RunFormData>({
    resolver: zodResolver(runSchema),
    defaultValues: draft.formValues,
  })

  // Sync form → draft store on every change
  useEffect(() => {
    const { unsubscribe } = watch((values) => draft.setFormValues(values as RunFormData))
    return unsubscribe
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (data: RunFormData) => {
    if (allRuns?.some((r) => r.name === data.name)) {
      setError('name', { message: 'A run with this name already exists for this season.' })
      return
    }

    const payload: RunPayload = {
      ...data,
      warm_start_solution_id: null,
      perturbate_if_infeasible: false,
      perturbation_time_limit: -1,
      skip_feasibility_check: false,
    }

    createRun.mutate(payload, {
      onSuccess: () => {
        draft.clearDraft()
        navigate('/history')
      },
    })
  }

  const runType = watch('run_type')
  const rulesetSnapshots = rulesets?.filter((r) => r.is_snapshot) ?? []
  const netCatSnapshots = netCatsList?.filter((nc) => nc.is_snapshot) ?? []

  return (
    <PrerequisiteGuard
      met={!!selectedSeason}
      message="Select a season and complete the prior steps before launching a run."
    >
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-bold text-slate-900">
          Launch Run · {selectedSeason}
        </h1>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <RunIdPanel register={register} errors={errors} />
            <ConstraintsPanel
              register={register}
              rulesetSnapshots={rulesetSnapshots}
              netCatSnapshots={netCatSnapshots}
              fixedGameSets={fixedGameSets}
              errors={errors}
            />
            <ObjectivePanel register={register} predictionSets={predictionSetsList} runType={runType} />
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-4">
            <button
              type="submit"
              disabled={createRun.isPending}
              className="px-6 py-2 bg-slate-900 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50"
            >
              {createRun.isPending ? 'Submitting…' : 'Launch Run'}
            </button>
            {createRun.isError && (
              <span className="text-red-500 text-sm">
                Error launching run. Check console.
              </span>
            )}
          </div>
        </form>
      </div>
    </PrerequisiteGuard>
  )
}

export default RunPage
