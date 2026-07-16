import { z } from 'zod'

export const runSchema = z.object({
  name: z.string().min(1, 'Run name is required'),
  comments: z.string().max(5000).nullable().optional(),
  ruleset_id: z.string().min(1, 'Select a ruleset'),
  fixed_game_set_id: z.string().nullable().optional(),
  prediction_set_id: z.string().nullable().optional(),
  net_cats_id: z.string().nullable().optional(),
  run_type: z.enum(['MultiObjective', 'PenaltyOnly', 'Perturbation', 'PartialMatchups']),
  scope: z.enum(['Full', 'PrimeTimeOnly']),
})

export type RunFormData = z.infer<typeof runSchema>
