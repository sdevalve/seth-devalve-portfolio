import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { seasonSchema, type SeasonFormData, DAYS_OF_WEEK } from "@/schemas/seasonSchema";
import useSeason from "@/hooks/useSeason";
import useSaveSeasonSettings from "@/hooks/useSaveSeasonSettings";
import useSeasonStore from "@/store/useSeasonStore";
import PrerequisiteGuard from "@/components/PrerequisiteGuard";

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = ['Basic', 'Calendar', 'Bye Weeks', 'Game Limits'] as const
type Tab = typeof TABS[number]

// ── Sub-components ────────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-400'
const inputDisabledCls =
  'w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-slate-100 text-slate-400 cursor-not-allowed'
const selectCls =
  'w-full px-3 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white'

interface FieldProps {
  label: string
  description: string
  children: React.ReactNode
}

const Field = ({ label, description, children }: FieldProps) => (
  <div className="flex flex-col gap-1">
    <label className="text-sm font-medium text-slate-700">{label}</label>
    <div>{children}</div>
    <p className="text-xs text-slate-400 leading-snug">{description}</p>
  </div>
)

// ── Page ──────────────────────────────────────────────────────────────────────

const SeasonSettingsPage = () => {
  const { selectedSeason } = useSeasonStore();
  const { data: season } = useSeason(selectedSeason);
  const saveMutation = useSaveSeasonSettings(season?.season_id ?? null);

  const [activeTab, setActiveTab] = useState<Tab>('Basic')

  // Local text state for the comma-delimited Double DH Weeks input.
  const [ddhInput, setDdhInput] = useState("");
  const [ddhError, setDdhError] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<SeasonFormData>({
    resolver: zodResolver(seasonSchema),
    defaultValues: {
      year: new Date().getFullYear(),
      num_weeks: 18,
      num_teams: 32,
      num_matchups: 272,
      thanksgiving_week: undefined,
      christmas_week: undefined,
      double_dh_weeks: [],
      christmas_day: undefined,
      bye_start: 5,
      bye_end: 14,
      num_bye_weeks: 1,
      min_weeks_between_byes: 0,
      max_byes_per_week: 6,
      max_consec_home: 3,
      max_consec_away: 3,
    },
  });

  const numWeeks = watch("num_weeks");
  const numByeWeeks = watch("num_bye_weeks");
  const minBtwByesDisabled = !(numByeWeeks > 1);

  useEffect(() => {
    if (season) {
      reset({
        year: season.year,
        num_weeks: season.num_weeks,
        num_teams: season.num_teams,
        num_matchups: season.num_matchups,
        thanksgiving_week: season.thanksgiving_week ?? undefined,
        christmas_week: season.christmas_week ?? undefined,
        double_dh_weeks: season.double_dh_weeks ?? [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        christmas_day: (season.christmas_day ?? undefined) as any,
        bye_start: season.bye_start,
        bye_end: season.bye_end,
        num_bye_weeks: season.num_bye_weeks,
        min_weeks_between_byes: season.min_weeks_between_byes,
        max_byes_per_week: season.max_byes_per_week,
        max_consec_home: season.max_consec_home,
        max_consec_away: season.max_consec_away,
      });
      setDdhInput(season.double_dh_weeks?.join(", ") ?? "");
      setDdhError("");
    }
  }, [season, reset]);

  const handleDdhChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const str = e.target.value;
    setDdhInput(str);

    if (!str.trim()) {
      setValue("double_dh_weeks", [], { shouldDirty: true });
      setDdhError("");
      return;
    }

    const parts = str.split(",").map((s) => s.trim()).filter(Boolean);
    const parsed = parts.map(Number);

    if (parsed.some((n) => !Number.isFinite(n) || !Number.isInteger(n))) {
      setDdhError("Each entry must be a whole number");
      return;
    }

    const wks = numWeeks ?? 18;
    const outOfRange = parsed.filter((n) => n < 1 || n > wks);
    if (outOfRange.length > 0) {
      setDdhError(`All weeks must be between 1 and ${wks}`);
      return;
    }

    setValue("double_dh_weeks", parsed, { shouldDirty: true });
    setDdhError("");
  };

  const onSubmit = (data: SeasonFormData) => {
    saveMutation.mutate(data);
  };

  return (
    <PrerequisiteGuard
      met={!!selectedSeason}
      message="Select a season from the top bar first."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl flex flex-col gap-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-slate-900">Season Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Schedule parameters and constraints for the selected season.
          </p>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-end gap-0">
            {TABS.map((tab) => {
              const isActive = tab === activeTab
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={[
                    'px-4 py-2 text-sm border-l border-t border-r rounded-t transition-colors',
                    isActive
                      ? 'bg-white border-slate-200 text-slate-900 font-medium -mb-px z-10 relative'
                      : 'bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50',
                  ].join(' ')}
                >
                  {tab}
                </button>
              )
            })}
          </div>

          {/* ── Panel ─────────────────────────────────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-b-xl rounded-tr-xl shadow-sm p-6">

            {/* Basic */}
            {activeTab === 'Basic' && (
              <div className="flex flex-col gap-5">
                <h2 className="text-base font-semibold text-slate-800">Basic</h2>
                <div className="grid grid-cols-2 gap-4">
                  {(
                    [
                      { name: "year",         label: "Year",          description: "The NFL season year.",                                min: 2020, max: 2040 },
                      { name: "num_weeks",    label: "Num Weeks",     description: "Total number of regular-season weeks.",               min: 1,    max: 22 },
                      { name: "num_teams",    label: "Num Teams",     description: "Number of NFL teams in the season.",                  min: 2,    max: undefined },
                      { name: "num_matchups", label: "Num Matchups",  description: "Total number of matchups to schedule across all weeks.", min: 1, max: undefined },
                    ] as const
                  ).map(({ name, label, description, min, max }) => (
                    <Field key={name} label={label} description={description}>
                      <input
                        {...register(name, { valueAsNumber: true })}
                        type="number"
                        min={min}
                        max={max}
                        className={inputCls}
                      />
                      {errors[name] && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors[name]?.message}
                        </p>
                      )}
                    </Field>
                  ))}
                </div>
              </div>
            )}

            {/* Calendar */}
            {activeTab === 'Calendar' && (
              <div className="flex flex-col gap-5">
                <h2 className="text-base font-semibold text-slate-800">Calendar</h2>
                <div className="grid grid-cols-2 gap-4">
                  <Field
                    label="Thanksgiving Week"
                    description="Global week number of Thanksgiving. Used to place the Thursday and Friday Thanksgiving games."
                  >
                    <input
                      {...register("thanksgiving_week", { valueAsNumber: true })}
                      type="number"
                      min={1}
                      max={numWeeks}
                      placeholder="—"
                      className={inputCls}
                    />
                    {errors.thanksgiving_week && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.thanksgiving_week?.message as string}
                      </p>
                    )}
                  </Field>

                  <Field
                    label="Christmas Week"
                    description="Global week number containing Christmas Day. Activates Christmas game constraints."
                  >
                    <input
                      {...register("christmas_week", { valueAsNumber: true })}
                      type="number"
                      min={1}
                      max={numWeeks}
                      placeholder="—"
                      className={inputCls}
                    />
                    {errors.christmas_week && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.christmas_week?.message as string}
                      </p>
                    )}
                  </Field>

                  <Field
                    label="Christmas Day"
                    description="Day of the week Christmas falls on. Controls which slots are eligible for Christmas games."
                  >
                    <select {...register("christmas_day")} className={selectCls}>
                      <option value="" disabled>Select a day…</option>
                      {DAYS_OF_WEEK.map((day) => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                  </Field>

                  <div className="col-span-2">
                    <Field
                      label="Double DH Weeks"
                      description="Weeks where both CBS and FOX host a double-header. Enter comma-separated week numbers, e.g. 13, 14."
                    >
                      <input
                        type="text"
                        value={ddhInput}
                        onChange={handleDdhChange}
                        placeholder="e.g. 13, 14"
                        className={inputCls}
                      />
                      {ddhError && (
                        <p className="text-red-500 text-xs mt-1">{ddhError}</p>
                      )}
                      {!ddhError && errors.double_dh_weeks && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors.double_dh_weeks.message}
                        </p>
                      )}
                    </Field>
                  </div>
                </div>
              </div>
            )}

            {/* Bye Weeks */}
            {activeTab === 'Bye Weeks' && (
              <div className="flex flex-col gap-5">
                <h2 className="text-base font-semibold text-slate-800">Bye Week Rules</h2>
                <div className="grid grid-cols-2 gap-4">
                  {(
                    [
                      { name: "bye_start",     label: "Bye Start Week",              description: "Earliest global week a team may take a bye.",             min: 1 },
                      { name: "bye_end",       label: "Bye End Week",                description: "Latest global week a team may take a bye.",               min: 1 },
                      { name: "num_bye_weeks", label: "Bye Weeks per Team",          description: "Number of bye weeks assigned to each team per season.",    min: 0 },
                      { name: "max_byes_per_week", label: "Max Byes Per Week",       description: "Maximum number of teams on bye in any single week.",       min: 1 },
                    ] as const
                  ).map(({ name, label, description, min }) => (
                    <Field key={name} label={label} description={description}>
                      <input
                        {...register(name, { valueAsNumber: true })}
                        type="number"
                        min={min}
                        className={inputCls}
                      />
                      {errors[name] && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors[name]?.message}
                        </p>
                      )}
                    </Field>
                  ))}

                  <div className="col-span-2">
                    <Field
                      label="Min Weeks Between Multiple Byes"
                      description={
                        minBtwByesDisabled
                          ? "Only applicable when Bye Weeks per Team is greater than 1."
                          : "Minimum number of weeks separating a team's consecutive bye weeks."
                      }
                    >
                      <input
                        {...register("min_weeks_between_byes", { valueAsNumber: true })}
                        type="number"
                        min={0}
                        disabled={minBtwByesDisabled}
                        className={minBtwByesDisabled ? inputDisabledCls : inputCls}
                      />
                      {errors.min_weeks_between_byes && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors.min_weeks_between_byes.message}
                        </p>
                      )}
                    </Field>
                  </div>
                </div>
              </div>
            )}

            {/* Game Limits */}
            {activeTab === 'Game Limits' && (
              <div className="flex flex-col gap-5">
                <h2 className="text-base font-semibold text-slate-800">Consecutive Game Limits</h2>
                <div className="grid grid-cols-2 gap-4">
                  {(
                    [
                      { name: "max_consec_home", label: "Max Consecutive Home", description: "Maximum number of consecutive home games any team can be scheduled.", min: 1 },
                      { name: "max_consec_away", label: "Max Consecutive Away", description: "Maximum number of consecutive away games any team can be scheduled.", min: 1 },
                    ] as const
                  ).map(({ name, label, description, min }) => (
                    <Field key={name} label={label} description={description}>
                      <input
                        {...register(name, { valueAsNumber: true })}
                        type="number"
                        min={min}
                        className={inputCls}
                      />
                      {errors[name] && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors[name]?.message}
                        </p>
                      )}
                    </Field>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* ── Save ─────────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 pb-8">
          <button
            type="submit"
            disabled={saveMutation.isPending || !isDirty}
            className="px-5 py-2 bg-slate-900 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving…" : "Save Settings"}
          </button>
          {saveMutation.isSuccess && (
            <span className="text-sm text-emerald-600 font-medium">Saved</span>
          )}
          {saveMutation.isError && (
            <span className="text-sm text-red-500 font-medium">Error. Check console.</span>
          )}
        </div>

      </form>
    </PrerequisiteGuard>
  );
};

export default SeasonSettingsPage;
