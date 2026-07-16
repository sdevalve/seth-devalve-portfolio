import { z } from 'zod'

// Preprocessor for required integer fields from number inputs:
// converts NaN (empty input) to undefined so zod rejects it as missing.
const requiredInt = z.preprocess(
  (v) =>
    v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))
      ? undefined
      : Number(v),
  z
    .number({
      required_error: 'This field is required',
      invalid_type_error: 'Must be a number',
    })
    .int(),
)

export const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

export const seasonSchema = z
  .object({
    year: z.number().int().min(2020).max(2040),
    num_weeks: z.number().int().min(1).max(22),
    num_teams: z.number().int().min(2),
    num_matchups: z.number().int().min(1),
    thanksgiving_week: requiredInt,
    christmas_week: requiredInt,
    double_dh_weeks: z.array(z.number().int().min(1)).min(1, 'Enter at least one week'),
    christmas_day: z.enum(DAYS_OF_WEEK, {
      errorMap: () => ({ message: 'Select a day of the week' }),
    }),
    bye_start: z.number().int().min(1),
    bye_end: z.number().int().min(1),
    num_bye_weeks: z.number().int().min(0),
    min_weeks_between_byes: z.number().int().min(0),
    max_byes_per_week: z.number().int().min(1),
    max_consec_home: z.number().int().min(1),
    max_consec_away: z.number().int().min(1),
  })
  .refine((d) => d.bye_end >= d.bye_start, {
    message: 'Bye end must be >= bye start',
    path: ['bye_end'],
  })
  .refine((d) => d.bye_start >= 1 && d.bye_end <= d.num_weeks, {
    message: 'Bye window must fall within total season weeks',
    path: ['bye_end'],
  })
  .superRefine((d, ctx) => {
    if (d.thanksgiving_week < 1 || d.thanksgiving_week > d.num_weeks) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Must be between 1 and ${d.num_weeks}`,
        path: ['thanksgiving_week'],
      })
    }
    if (d.christmas_week < 1 || d.christmas_week > d.num_weeks) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Must be between 1 and ${d.num_weeks}`,
        path: ['christmas_week'],
      })
    }
  })

export type SeasonFormData = z.infer<typeof seasonSchema>
