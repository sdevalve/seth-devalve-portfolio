export default interface Season {
  season_id: string
  year: number
  num_weeks: number
  num_teams: number
  num_matchups: number
  networks: string[]
  slots: string[]
  new_network_dict: Record<string, string> | null
  thanksgiving_week: number | null
  christmas_week: number | null
  double_dh_weeks: number[] | null
  christmas_day: string | null
  bye_start: number
  bye_end: number
  num_bye_weeks: number
  min_weeks_between_byes: number
  max_byes_per_week: number
  max_consec_home: number
  max_consec_away: number
  tv_ratings_s3_key: string | null
  created_at: string
  created_by: string
}
