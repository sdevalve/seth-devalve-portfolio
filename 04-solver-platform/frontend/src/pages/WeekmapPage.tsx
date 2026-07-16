import { useEffect, useState } from 'react'
import useSeason from '@/hooks/useSeason'
import useWeekmap from '@/hooks/useWeekmap'
import useSaveWeekmap from '@/hooks/useSaveWeekmap'
import useSeasonStore from '@/store/useSeasonStore'
import PrerequisiteGuard from '@/components/PrerequisiteGuard'

const WeekmapPage = () => {
  const { selectedSeason } = useSeasonStore()
  const { data: season } = useSeason(selectedSeason)
  const { data: weekmapData } = useWeekmap(selectedSeason)
  const saveMutation = useSaveWeekmap(selectedSeason)

  const numWeeks = season?.num_weeks ?? 18
  const networks = season?.networks ?? []
  const slots = season?.slots ?? []

  // weekmap state: slot → array of (network | null) per week
  const [weekmap, setWeekmap] = useState<Record<string, (string | null)[]>>({})

  useEffect(() => {
    if (slots.length === 0) return
    // Build merged state: every current slot gets a full-length array.
    // Saved values are used where they exist; missing/new slots get nulls.
    const merged: Record<string, (string | null)[]> = {}
    slots.forEach((s) => {
      const saved = weekmapData?.data?.[s]
      merged[s] = Array.from({ length: numWeeks }, (_, i) => saved?.[i] ?? null)
    })
    setWeekmap(merged)
  }, [weekmapData, slots, numWeeks])

  const setCell = (slot: string, weekIdx: number, value: string | null) => {
    setWeekmap((prev) => ({
      ...prev,
      [slot]: prev[slot]?.map((v, i) => (i === weekIdx ? value : v)) ?? [],
    }))
  }

  const fillColumn = (slot: string, value: string | null) => {
    setWeekmap((prev) => ({
      ...prev,
      [slot]: Array(numWeeks).fill(value),
    }))
  }

  const slotsReady = slots.length > 0 && networks.length > 0
  const prerequisitesMet = !!selectedSeason && !!season && slotsReady

  return (
    <PrerequisiteGuard
      met={prerequisitesMet}
      message="Complete Slots & Networks before filling in the weekmap."
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Weekmap · {selectedSeason}</h1>
            <p className="text-sm text-slate-500">
              Assign a broadcast network to each slot for every week. Leave blank if that slot
              doesn't air that week.
            </p>
          </div>
          <button
            onClick={() => saveMutation.mutate(weekmap)}
            disabled={saveMutation.isPending}
            className="px-3 py-1.5 text-sm bg-green-700 text-white rounded hover:bg-green-600 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Weekmap'}
          </button>
        </div>

        <div className="overflow-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="bg-slate-800 text-white px-2 py-1 sticky left-0 z-10 w-12">
                  Wk
                </th>
                {slots.map((slot) => (
                  <th
                    key={slot}
                    className="bg-slate-800 text-white px-2 py-1 min-w-[120px] text-center"
                  >
                    <div className="mb-1">{slot}</div>
                    {/* Fill entire column at once */}
                    <select
                      className="w-full text-[10px] bg-slate-700 text-white rounded px-1 py-0.5 border-0"
                      defaultValue=""
                      onChange={(e) => fillColumn(slot, e.target.value || null)}
                    >
                      <option value="">Fill col…</option>
                      <option value="">Clear</option>
                      {networks.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: numWeeks }, (_, wi) => (
                <tr key={wi} className="border-b border-slate-200">
                  <td className="bg-slate-100 text-center font-bold text-slate-700 px-2 py-1 sticky left-0">
                    {wi + 1}
                  </td>
                  {slots.map((slot) => (
                    <td key={slot} className="px-1 py-0.5">
                      <select
                        value={weekmap[slot]?.[wi] ?? ''}
                        onChange={(e) => setCell(slot, wi, e.target.value || null)}
                        className="w-full text-xs rounded border border-slate-200 px-1 py-0.5 bg-white"
                      >
                        <option value="">—</option>
                        {networks.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {saveMutation.isSuccess && <p className="text-green-600 text-sm">Weekmap saved ✓</p>}
        {saveMutation.isError && <p className="text-red-500 text-sm">Error saving weekmap</p>}
      </div>
    </PrerequisiteGuard>
  )
}

export default WeekmapPage
