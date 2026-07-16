import type Rule from './Rule'

export default interface Ruleset {
  ruleset_id: string
  season_id: string | null // null = evergreen (applies to all seasons)
  name: string
  description: string | null
  parent_ruleset_id: string | null
  is_snapshot: boolean
  feasibility_status: 'feasible' | 'infeasible' | null
  rules: Rule[]
  created_at: string
  created_by: string
}
