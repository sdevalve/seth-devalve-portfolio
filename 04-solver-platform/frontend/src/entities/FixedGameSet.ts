export interface FixedGame {
  week: number
  home_abbr: string
  away_abbr: string
  slot?: string
  tod?: number
}

export default interface FixedGameSet {
  fixed_game_set_id: string
  season_id: string
  name: string
  source_solution_id: string | null
  ruleset_id: string | null
  run_id: string | null
  games: FixedGame[]
  created_at: string
  created_by: string
}
