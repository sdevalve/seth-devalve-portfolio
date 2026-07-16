export default interface ColorPolicy {
  color_policy_id: string
  season_id:       string
  slot_colors:     Record<string, string | null>
  palette:         string[]
  tod_formats:     Record<string, string | null>
  dh_format:       string | null
  updated_at:      string | null
}
