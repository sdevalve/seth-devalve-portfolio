import { z } from 'zod'
import type { ConstraintType } from '../entities/Rule'

export const CONSTRAINT_TYPES = [
  'Team/Slot/Week',
  'Team/Slot/Week_discrete',
  'Bye/minibye',
  'Bye/timeslot',
  'DH',
  'DH_discrete',
  'pingpong',
] as const satisfies readonly ConstraintType[]

// Constraint types that do NOT require a Teams value
const TEAMS_NOT_REQUIRED: ConstraintType[] = ['DH', 'DH_discrete', 'Bye/minibye', 'Bye/timeslot']

export const ruleRowSchema = z
  .object({
    active: z.union([z.literal(0), z.literal(1)]),
    operator: z.enum(['Max', 'Min']),
    games: z.number().int().positive(),
    weeks: z.union([z.number().int().positive(), z.string()]),
    week_start: z.union([z.number().int().positive(), z.string()]),
    week_end: z.union([z.number().int().positive(), z.string()]),
    slot: z.string().min(1),
    penalty: z.number().positive(),
    constraint_type: z.enum(CONSTRAINT_TYPES),
    hard: z.enum(['hard', '']),
    penalty_cap: z.union([z.literal(0), z.literal(1)]),
    comment: z.string(),
    slack_bound: z.number().int().min(0),
    ti: z.union([z.literal(0), z.literal(1)]),
    teams: z.string(),
  })
  .refine(
    (row) => {
      if (row.active === 0) return true
      if (TEAMS_NOT_REQUIRED.includes(row.constraint_type as ConstraintType)) return true
      return row.teams.trim().length > 0
    },
    { message: 'Teams required for this constraint type when active', path: ['teams'] }
  )

export type RuleRow = z.infer<typeof ruleRowSchema>
