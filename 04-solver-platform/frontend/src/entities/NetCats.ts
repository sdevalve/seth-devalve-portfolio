export interface NetCatEntry {
  entry_id: string
  net_cats_id: string
  slot: string
  operator: 'Max' | 'Min'
  games: number
  matchups: string   // comma-delimited "AWAY@HOME,..."
}

export interface NetCats {
  net_cats_id: string
  season_id: string
  name: string
  is_snapshot: boolean
  created_at: string
  entries: NetCatEntry[]
}
