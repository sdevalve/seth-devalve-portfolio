import { create } from 'zustand'

interface SeasonStore {
  selectedSeason: number | null
  setSelectedSeason: (season: number) => void
}

const useSeasonStore = create<SeasonStore>((set) => ({
  selectedSeason: null,
  setSelectedSeason: (season) => set(() => ({ selectedSeason: season })),
}))

export default useSeasonStore
