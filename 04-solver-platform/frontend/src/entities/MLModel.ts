export interface MLModel {
  ml_model_id: string
  season_id: string
  /** Ordered list of market names, e.g. ["NY", "LA", "Chicago"] */
  markets: string[]
  /** { tvCode: { market: coefficient } }  e.g. { "RAVEN": { "NY": 12.5 } } */
  market_coefs: Record<string, Record<string, number>>
  /** Flat rows from the 'combined' sheet */
  model_coefs: Record<string, unknown>[]
  uploaded_at: string
  raw_data_path: string | null
  old_model_path: string | null
}
