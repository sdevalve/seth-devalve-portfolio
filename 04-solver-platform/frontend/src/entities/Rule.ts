export type ConstraintType =
  | 'Team/Slot/Week'
  | 'Team/Slot/Week_discrete'
  | 'Bye/minibye'
  | 'Bye/timeslot'
  | 'DH'
  | 'DH_discrete'
  | 'pingpong'

export default interface Rule {
  active: 0 | 1
  operator: 'Max' | 'Min'
  games: number
  // Integer for rolling window; comma-separated string for discrete constraint types
  weeks: number | string
  week_start: number | string
  week_end: number | string
  slot: string
  penalty: number
  constraint_type: ConstraintType
  hard: 'hard' | ''
  penalty_cap: 0 | 1
  comment: string
  slack_bound: number
  ti: 0 | 1
  teams: string
}
