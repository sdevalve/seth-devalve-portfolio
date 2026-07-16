export default interface PredictionSet {
  prediction_set_id: string
  season_id: string
  name: string
  fixed_game_set_id: string | null
  status: 'idle' | 'running' | 'complete' | 'error'
  v_primary_path: string | null
  v_secondary_path: string | null
  v_primetime_path: string | null
  created_at: string
}
