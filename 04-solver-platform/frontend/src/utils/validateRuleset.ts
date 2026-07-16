import type Rule from '@/entities/Rule'
import type { ConstraintType } from '@/entities/Rule'

// ── Constants ────────────────────────────────────────────────────────────────

export const CONSTRAINT_TYPES: ConstraintType[] = [
  'Team/Slot/Week',
  'Team/Slot/Week_discrete',
  'Bye/minibye',
  'Bye/timeslot',
  'DH',
  'DH_discrete',
  'pingpong',
]

const DISCRETE_TYPES: ConstraintType[] = ['Team/Slot/Week_discrete', 'DH_discrete']
const TEAMS_NOT_REQUIRED: ConstraintType[] = ['DH', 'DH_discrete', 'Bye/minibye', 'Bye/timeslot']

// Fields that are optional (not validated) for specific Bye constraint types
const OPTIONAL_OPERATOR:   ConstraintType[] = ['Bye/timeslot', 'Bye/minibye']
const OPTIONAL_GAMES:      ConstraintType[] = ['Bye/timeslot', 'Bye/minibye']
const OPTIONAL_WEEK_START: ConstraintType[] = ['Bye/timeslot', 'Bye/minibye']
const OPTIONAL_WEEK_END:   ConstraintType[] = ['Bye/timeslot']  // Bye/minibye still requires WeekEnd

// CBS/FOX valid suffixes: singles E, L, S, DH plus two-character combos ES, EDH, LS, LDH
const CBS_FOX_SUFFIXES = ['E', 'L', 'S', 'DH', 'ES', 'EDH', 'LS', 'LDH']

// ── Slot parsing & validation ─────────────────────────────────────────────────

/**
 * Parse a slot field value into individual entries, respecting pipe groups.
 * e.g. "|SNF,MNF|,Friday" → ["|SNF,MNF|", "Friday"]
 */
export function parseSlotEntries(slot: string): string[] {
  const entries: string[] = []
  let current = ''
  let inPipe = false

  for (const ch of slot) {
    if (ch === '|') {
      inPipe = !inPipe
      current += ch
    } else if (ch === ',' && !inPipe) {
      const trimmed = current.trim()
      if (trimmed) entries.push(trimmed)
      current = ''
    } else {
      current += ch
    }
  }
  const trimmed = current.trim()
  if (trimmed) entries.push(trimmed)
  return entries
}

/**
 * Count the logical length of a slot field value.
 * Pipe groups count as 1. Used for Weeks cross-validation.
 */
export function countSlotEntries(slot: string): number {
  return parseSlotEntries(slot).length
}

/**
 * Validate a single slot code (no commas, no pipe group wrapper).
 * Returns null if valid, error string if invalid.
 *
 * Prefix order (strict): [H | A | Acc]? [div | con]? then slot root.
 * "Acc" must be checked before "A" to avoid greedy single-char match.
 * CBS/FOX roots accept suffixes from CBS_FOX_SUFFIXES, or no suffix.
 * Other roots accept no suffix, OR the full root+integer must be a predefined slot.
 */
function validateSingleSlotCode(code: string, configuredSlots: string[]): string | null {
  if (!code) return 'Empty slot code'
  if (code.toLowerCase() === 'global') return null

  let remaining = code

  // Step 1: Strip location prefix — Acc before A to avoid consuming 'A' from 'Acc'
  const locationMatch = remaining.match(/^(acc|h|a)/i)
  if (locationMatch) {
    remaining = remaining.slice(locationMatch[0].length)
  }

  // Step 2: Strip matchup-type prefix (div | con)
  const matchupMatch = remaining.match(/^(div|con)/i)
  if (matchupMatch) {
    remaining = remaining.slice(matchupMatch[0].length)
  }

  // Step 3: Empty remaining → implicit global
  if (!remaining || remaining.toLowerCase() === 'global') return null

  const upperRemaining = remaining.toUpperCase()

  // Step 4: CBS/FOX — valid alone or with an approved suffix
  for (const slot of configuredSlots) {
    const upperSlot = slot.toUpperCase()
    if (upperSlot !== 'CBS' && upperSlot !== 'FOX') continue

    if (upperRemaining === upperSlot) return null // CBS or FOX alone, valid

    if (upperRemaining.startsWith(upperSlot)) {
      const suffix = upperRemaining.slice(upperSlot.length)
      if (CBS_FOX_SUFFIXES.includes(suffix)) return null
      return `Invalid suffix '${suffix}' for ${upperSlot}. Allowed: ${CBS_FOX_SUFFIXES.join(', ')} (or no suffix)`
    }
  }

  // Step 5: Regular (non-CBS/FOX) slots
  const regularSlots = configuredSlots.filter(
    (s) => s.toUpperCase() !== 'CBS' && s.toUpperCase() !== 'FOX'
  )

  // 5a. Exact match
  for (const slot of regularSlots) {
    if (upperRemaining === slot.toUpperCase()) return null
  }

  // 5b. Remaining is a base name — some predefined slot = remaining + digits
  for (const slot of regularSlots) {
    const su = slot.toUpperCase()
    if (su.startsWith(upperRemaining) && /^\d+$/.test(su.slice(upperRemaining.length))) {
      return null
    }
  }

  // 5c. Remaining ends with digits → only valid if the full string is an exact predefined slot
  //     (already checked in 5a). Flag invalid integer variants clearly.
  const intSuffixMatch = upperRemaining.match(/^(.+?)(\d+)$/)
  if (intSuffixMatch) {
    const base = intSuffixMatch[1]
    const hasVariants = regularSlots.some((s) => {
      const su = s.toUpperCase()
      return su.startsWith(base) && /^\d+$/.test(su.slice(base.length))
    })
    if (hasVariants) {
      return `'${remaining}' is not a defined variant of '${remaining.replace(/\d+$/, '')}' (check Slots & Networks)`
    }
  }

  return `Unrecognized slot '${remaining}' in '${code}'`
}

/**
 * Validate a single slot entry, which may be a pipe group "|A,B,C|" or a plain code.
 */
function validateSlotEntry(entry: string, configuredSlots: string[]): string | null {
  // Pipe group: |SNF,MNF,TNF|
  if (entry.startsWith('|') && entry.endsWith('|')) {
    const inner = entry.slice(1, -1)
    const parts = inner.split(',').map((s) => s.trim())
    for (const part of parts) {
      const err = validateSingleSlotCode(part, configuredSlots)
      if (err) return `In pipe group: ${err}`
    }
    return null
  }

  return validateSingleSlotCode(entry, configuredSlots)
}

/**
 * Validate the full Slot field value.
 * Returns null if valid, error string if invalid.
 */
export function validateSlotField(slot: string, configuredSlots: string[]): string | null {
  if (!slot || !slot.trim()) return 'Slot is required'

  const entries = parseSlotEntries(slot)
  if (entries.length === 0) return 'Slot is required'

  for (const entry of entries) {
    const err = validateSlotEntry(entry, configuredSlots)
    if (err) return err
  }

  return null
}

// ── Teams field validation ────────────────────────────────────────────────────

function validateTeamsField(
  teams: string,
  teamAbbreviations: Set<string>
): string | null {
  const raw = teams.trim()
  if (!raw || raw.toLowerCase() === 'all') return null

  const entries = raw.split(',').map((s) => s.trim())
  let hasTeams = false
  let hasMatchups = false

  for (const entry of entries) {
    if (!entry) continue
    if (entry.includes('@')) {
      hasMatchups = true
      const parts = entry.split('@').map((s) => s.trim())
      if (parts.length !== 2) return `Invalid matchup format: '${entry}' (expected A@B)`
      for (const p of parts) {
        if (!teamAbbreviations.has(p.toUpperCase())) {
          return `Unknown team abbreviation '${p}' in matchup '${entry}'`
        }
      }
    } else {
      hasTeams = true
      if (!teamAbbreviations.has(entry.toUpperCase())) {
        return `Unknown team abbreviation '${entry}'`
      }
    }
  }

  if (hasTeams && hasMatchups) {
    return 'Cannot mix team names and matchups in the Teams column'
  }

  return null
}

// ── Discrete week list validation ─────────────────────────────────────────────

function validateDiscreteWeekList(value: string | number | null | undefined, numWeeks: number, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') return null // blank allowed
  const str = String(value).trim()
  if (!str) return null
  const parts = str.split(',').map((s) => s.trim())
  for (const p of parts) {
    const n = Number(p)
    if (!Number.isInteger(n) || n < 1 || n > numWeeks) {
      return `${fieldName}: '${p}' must be an integer between 1 and ${numWeeks}`
    }
  }
  return null
}

// ── Full row validation ───────────────────────────────────────────────────────

export interface RowValidationError {
  row: number
  field: string
  message: string
}

export function validateRuleRow(
  row: Partial<Rule>,
  rowIndex: number,
  configuredSlots: string[],
  numWeeks: number,
  teamAbbreviations: Set<string>
): RowValidationError[] {
  const errors: RowValidationError[] = []
  const r = (field: string, message: string) => errors.push({ row: rowIndex, field, message })

  const ct = (row.constraint_type ?? '') as ConstraintType
  const isDiscrete = DISCRETE_TYPES.includes(ct)
  const active = row.active ?? 1

  // Active
  if (row.active !== 0 && row.active !== 1) r('Active', 'Must be 0 or 1')

  // Operator (not required for Bye/timeslot, Bye/minibye)
  if (!OPTIONAL_OPERATOR.includes(ct) && row.operator !== 'Max' && row.operator !== 'Min')
    r('Operator', "Must be 'Max' or 'Min'")

  // Games / occurrences (not required for Bye/timeslot, Bye/minibye)
  if (!OPTIONAL_GAMES.includes(ct)) {
    const games = Number(row.games)
    if (!Number.isInteger(games) || games < 0) r('Games', 'Must be a non-negative integer')
  }

  // ConstraintType
  if (!CONSTRAINT_TYPES.includes(ct)) r('ConstraintType', `Must be one of: ${CONSTRAINT_TYPES.join(', ')}`)

  // Weeks
  if (!isDiscrete) {
    const weeks = Number(row.weeks)
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > numWeeks) {
      r('Weeks', `Must be an integer between 1 and ${numWeeks}`)
    } else {
      // Cross-check: if Slot has >1 entry, Weeks must equal that count
      if (row.slot) {
        const slotCount = countSlotEntries(row.slot)
        if (slotCount > 1 && weeks !== slotCount) {
          r('Weeks', `Must equal the number of slot entries (${slotCount}) when multiple slots are specified`)
        }
      }
    }
  }

  // WeekStart (not required for Bye/timeslot, Bye/minibye)
  if (!isDiscrete && !OPTIONAL_WEEK_START.includes(ct)) {
    const ws = Number(row.week_start)
    if (!Number.isInteger(ws) || ws < 1 || ws > numWeeks) {
      r('WeekStart', `Must be an integer between 1 and ${numWeeks}`)
    }
  }

  // WeekEnd (not required for Bye/timeslot; still required for Bye/minibye)
  if (isDiscrete) {
    const err = validateDiscreteWeekList(row.week_end, numWeeks, 'WeekEnd')
    if (err) r('WeekEnd', err)
  } else if (!OPTIONAL_WEEK_END.includes(ct)) {
    const we = Number(row.week_end)
    const weeks = Number(row.weeks)
    if (!Number.isInteger(we) || we < 1 || we > numWeeks) {
      r('WeekEnd', `Must be an integer between 1 and ${numWeeks}`)
    } else if (!OPTIONAL_WEEK_START.includes(ct)) {
      // Cross-check only when WeekStart is also required (avoids false error when ws is blank)
      const ws = Number(row.week_start)
      if (we - ws + 1 < weeks) {
        r('WeekEnd', `WeekEnd - WeekStart + 1 (${we - ws + 1}) must be >= Weeks (${weeks})`)
      }
    }
  }

  // Slot
  if (row.slot !== undefined && row.slot !== null) {
    const slotErr = validateSlotField(row.slot, configuredSlots)
    if (slotErr) r('Slot', slotErr)
  } else {
    r('Slot', 'Slot is required')
  }

  // Penalty
  const penalty = Number(row.penalty)
  if (isNaN(penalty) || penalty <= 0) r('Penalty', 'Must be a positive number')

  // hard_slack
  if (row.hard !== 'hard' && row.hard !== '') r('hard_slack', "Must be 'hard' or blank")

  // PenaltyCap
  if (row.penalty_cap !== 0 && row.penalty_cap !== 1) r('PenaltyCap', 'Must be 0 or 1')

  // SlackBound
  const sb = Number(row.slack_bound ?? 0)
  if (!Number.isInteger(sb) || sb < 0) r('SlackBound', 'Must be a non-negative integer')

  // TI
  if (row.ti !== 0 && row.ti !== 1) r('TI', 'Must be 0 or 1')

  // Teams (required when active=1 and type requires it)
  if (active === 1 && !TEAMS_NOT_REQUIRED.includes(ct)) {
    const teams = (row.teams ?? '').trim()
    if (!teams) {
      r('Teams', 'Required for this constraint type when Active=1')
    } else {
      const teamsErr = validateTeamsField(teams, teamAbbreviations)
      if (teamsErr) r('Teams', teamsErr)
    }
  } else if (row.teams && (row.teams as string).trim()) {
    const teamsErr = validateTeamsField(row.teams as string, teamAbbreviations)
    if (teamsErr) r('Teams', teamsErr)
  }

  return errors
}

// ── CSV/XLSX row → Rule mapping ───────────────────────────────────────────────

const EXPECTED_HEADERS = [
  'Active', 'Operator', 'Games', 'Weeks', 'WeekStart', 'WeekEnd',
  'Slot', 'Penalty', 'ConstraintType', 'hard_slack', 'PenaltyCap',
  'Comment', 'SlackBound', 'TI', 'Teams',
]

const HEADER_PATTERN = /^active$/i

export interface ParseResult {
  rules: Rule[]
  errors: RowValidationError[]
}

function coerceBit(val: unknown): 0 | 1 {
  const n = Number(val)
  return n === 1 ? 1 : 0
}

function coerceInt(val: unknown, fallback: number): number {
  const n = Number(val)
  return Number.isInteger(n) ? n : fallback
}

export function parseRulesetSheet(
  rows: unknown[][],
  configuredSlots: string[],
  numWeeks: number,
  teamAbbreviations: Set<string>
): ParseResult {
  const errors: RowValidationError[] = []
  const rules: Rule[] = []

  if (rows.length === 0) return { rules, errors: [{ row: 0, field: '', message: 'File is empty' }] }

  // Detect header row
  let dataStart = 0
  if (rows.length > 0 && HEADER_PATTERN.test(String(rows[0][0] ?? '').trim())) {
    dataStart = 1
  }

  // Validate header columns if present
  if (dataStart === 1) {
    const headers = rows[0].map((h) => String(h ?? '').trim())
    const missing = EXPECTED_HEADERS.filter((h) => !headers.some((fh) => fh.toLowerCase() === h.toLowerCase()))
    if (missing.length > 0) {
      return {
        rules: [],
        errors: [{ row: 1, field: 'Header', message: `Missing columns: ${missing.join(', ')}` }],
      }
    }
  }

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1

    // Skip entirely blank rows
    if (row.every((cell) => cell === null || cell === undefined || String(cell).trim() === '')) continue

    const get = (idx: number): string => String(row[idx] ?? '').trim()

    const rule: Rule = {
      active: coerceBit(get(0)),
      operator: (['Max', 'Min'].includes(get(1)) ? get(1) : 'Max') as 'Max' | 'Min',
      games: coerceInt(get(2), 1),
      weeks: get(3) || 1,
      week_start: get(4) || 1,
      week_end: get(5) || numWeeks,
      slot: get(6),
      penalty: Number(get(7)) || 1,
      constraint_type: (CONSTRAINT_TYPES.includes(get(8) as ConstraintType) ? get(8) : 'Team/Slot/Week') as ConstraintType,
      hard: (get(9).toLowerCase() === 'hard' ? 'hard' : '') as 'hard' | '',
      penalty_cap: coerceBit(get(10)),
      comment: get(11),
      slack_bound: coerceInt(get(12), 0),
      ti: coerceBit(get(13)),
      teams: get(14),
    }

    const rowErrors = validateRuleRow(rule, rowNum, configuredSlots, numWeeks, teamAbbreviations)
    errors.push(...rowErrors)
    rules.push(rule)
  }

  return { rules, errors }
}
