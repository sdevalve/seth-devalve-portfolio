export interface ScheduleRecord {
  week: number        // 1-based global week
  slot: string        // e.g. "SNF", "MNF", "Saturday"
  tod:  number | null // time-of-day index; null for slots without TOD dimension
  home: string        // team abbreviation e.g. "KC"
  away: string        // team abbreviation e.g. "BAL"
}

export default interface Solution {
  solution_id:           string
  run_id:                string
  job_id:                string | null
  incumbent_number:      number
  sol_file_path:         string | null
  objective_value:       number | null
  penalty_score:         number | null              // null until enriched
  ratings_score:         number | null              // null until enriched
  penalty_total:         number | null              // computed at save time
  ratings_total:         number | null              // computed at save time (null if no prediction set)
  sanity_ok:             boolean | null
  optimality_gap:        number | null
  is_final:              boolean
  is_perturbation:       boolean
  assignment_changes:    number | null              // sum(t_abs) for Perturbation run_type
  found_at:              string
  schedule_records_json: ScheduleRecord[] | null    // null until NPZ available after solve
  dh_by_week_json:       Record<string, string> | null  // {week_1based: "CBS"|"FOX"|"CBS/FOX"}
}
