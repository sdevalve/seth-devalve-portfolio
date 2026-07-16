import { create } from 'zustand'

interface NetCatsSelectionStore {
  /** Set of "AWAY@HOME" matchup keys that are checked in the matchup table. */
  selected: Set<string>
  toggle: (key: string) => void
  isSelected: (key: string) => boolean
  clear: () => void
  selectAll: (keys: string[]) => void
}

const useNetCatsSelectionStore = create<NetCatsSelectionStore>((set, get) => ({
  selected: new Set(),
  toggle: (key) =>
    set((s) => {
      const next = new Set(s.selected)
      next.has(key) ? next.delete(key) : next.add(key)
      return { selected: next }
    }),
  isSelected: (key) => get().selected.has(key),
  clear: () => set({ selected: new Set() }),
  selectAll: (keys) => set({ selected: new Set(keys) }),
}))

export default useNetCatsSelectionStore
