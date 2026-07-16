export default interface Weekmap {
  weekmap_id: string
  season_id: string
  // Keys are slot codes; values are arrays of length num_weeks (network name or null per week)
  data: Record<string, (string | null)[]>
  updated_at: string
}
