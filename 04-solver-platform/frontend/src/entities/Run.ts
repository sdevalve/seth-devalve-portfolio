export type RunType = 'MultiObjective' | 'PenaltyOnly' | 'Perturbation' | 'PartialMatchups'
export type RunScope = 'Full' | 'PrimeTimeOnly'
export type RunStatus = 'queued' | 'building' | 'feasibility_check' | 'solving' | 'perturbating' | 'infeasible' | 'complete' | 'failed' | 'stopped'

export interface RunParams {
  run_type: string
  scope: string
  ruleset_name: string | null
  net_cats_name: string | null
  prediction_set_name: string | null
  fixed_game_set_name: string | null
  comments: string | null
  gurobi?: {
    mip_gap: number
    no_rel_time: number
    degen_moves: number
    method: number
    cuts: number
    mip_focus?: number
    presolve?: number
    time_limit: number | null
    pool_solutions?: number
    pool_gap?: number | null
    pool_search_mode?: number
  }
}

export default interface Run {
  run_id: string
  season_id: string
  ruleset_id: string
  fixed_game_set_id: string | null
  prediction_set_id: string | null
  net_cats_id: string | null
  name: string
  comments: string | null
  run_type: RunType
  scope: RunScope
  status: RunStatus
  run_params: RunParams | null
  npz_path: string | null
  error_message: {
    message: string
    iis_rows: number[]
    all_iis_rows: number[]
    infeas_rows: Record<string, unknown>[] | null
  } | null
  created_at: string
  created_by: string
}
