import useSeasons from '@/hooks/useSeasons'
import useSeasonStore from '@/store/useSeasonStore'

const SeasonSelector = () => {
  const { data: seasons, isLoading } = useSeasons()
  const { selectedSeason, setSelectedSeason } = useSeasonStore()

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-slate-300 font-semibold uppercase tracking-wider whitespace-nowrap">
        Active Season
      </label>
      <select
        value={selectedSeason ?? ''}
        onChange={(e) => setSelectedSeason(Number(e.target.value))}
        disabled={isLoading}
        className="rounded-md border border-slate-500 bg-white text-slate-900 text-sm font-medium px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 cursor-pointer"
      >
        <option value="" disabled>
          Select year…
        </option>
        {seasons?.map((s) => (
          <option key={s.season_id} value={s.year}>
            {s.year}
          </option>
        ))}
      </select>
    </div>
  )
}

export default SeasonSelector
