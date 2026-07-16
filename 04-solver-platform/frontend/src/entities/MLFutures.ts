export interface MLFuturesPlayoff {
  make: number | null
  miss: number | null
}

export interface MLFutures {
  futures_id: string
  season_id: string
  playoffs: Record<string, MLFuturesPlayoff> | null
  wintotals: Record<string, number | null> | null
  division_odds: Record<string, number | null> | null
  conference_odds: Record<string, number | null> | null
  superbowl_odds: Record<string, number | null> | null
  updated_at: string
}
