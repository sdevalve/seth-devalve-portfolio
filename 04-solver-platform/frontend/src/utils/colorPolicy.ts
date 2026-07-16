import { textOnBackground } from './wcagContrast'
import type ColorPolicy from '@/entities/ColorPolicy'

export interface CellColors {
  bg: string            // hex background
  text: string          // WCAG-compliant foreground
  fontWeight?: 'bold' | 'normal'
  fontStyle?: 'italic' | 'normal'
  textDecoration?: 'underline' | 'none'
}

// Fallback palette when no ColorPolicy has been saved for a season.
const SLOT_COLORS: Record<string, string> = {
  SNF:           '#0F7004',
  MNF:           '#E7D40B',
  TNF:           '#930393',
  Friday:        '#9900ff',
  Saturday:      '#FF46F5',
  Thanksgiving:  '#cacace',
  Christmas:     '#000000',
  International: '#8a8a8f',
  DH:            '#edd182',
  SundayEarly:   '#FFFFFF',
  // CBS/FOX early/late windows (matching original hex_dictionary)
  'CBS Early':   '#ff6666',
  'CBS Late':    '#CC0000',
  'FOX Early':   '#00ace6',
  'FOX Late':    '#1a1aff',
}

// TOD index → ColorPolicy tod_formats key
const TOD_LABELS = ['morning', 'afternoon', 'mid-afternoon', 'evening']

/** Strip trailing digits from a slot name: "MNF1" → "MNF", "SNF" → "SNF". */
export function collapseSlot(slot: string): string {
  return slot.replace(/\d+$/, '')
}

/** Map 0-based TOD index to the ColorPolicy tod_formats key. */
export function todIndexToLabel(i: number): string {
  return TOD_LABELS[i] ?? 'morning'
}

/**
 * Resolve a color lookup key for the given slot + tod.
 * For CBS/FOX: tod in (0,1) = Early window, tod in (2,3) = Late window.
 * Returns e.g. "CBS Early", "FOX Late", or the collapsed slot name for all others.
 */
export function resolveSlotKey(slot: string, tod: number | null): string {
  const collapsed = collapseSlot(slot)
  if ((collapsed === 'CBS' || collapsed === 'FOX') && tod !== null) {
    return `${collapsed} ${tod < 2 ? 'Early' : 'Late'}`
  }
  return collapsed
}

/** Resolve the background hex for a slot+tod from the policy (with fallback). */
function slotBg(slot: string, tod: number | null, policy: ColorPolicy | null): string {
  const key  = resolveSlotKey(slot, tod)
  const base = collapseSlot(slot)
  if (policy) {
    const saved = policy.slot_colors[key] ?? policy.slot_colors[base]
    if (saved) return saved
  }
  return SLOT_COLORS[key] ?? SLOT_COLORS[base] ?? '#FFFFFF'
}

/** Build font-style overrides from the saved TOD format for this cell. */
function todStyle(
  tod: number | null,
  policy: ColorPolicy | null,
): Pick<CellColors, 'fontWeight' | 'fontStyle' | 'textDecoration'> {
  if (tod === null || !policy) return {}
  const fmt = policy.tod_formats[todIndexToLabel(tod)]
  if (!fmt) return {}
  if (fmt === 'bold')      return { fontWeight: 'bold' }
  if (fmt === 'italic')    return { fontStyle: 'italic' }
  if (fmt === 'underline') return { textDecoration: 'underline' }
  return {}
}

/** Build font-style overrides for the DH column cell. */
export function dhStyle(
  policy: ColorPolicy | null,
): Pick<CellColors, 'fontWeight' | 'fontStyle' | 'textDecoration'> {
  if (!policy?.dh_format) return {}
  const fmt = policy.dh_format
  if (fmt === 'bold')      return { fontWeight: 'bold' }
  if (fmt === 'italic')    return { fontStyle: 'italic' }
  if (fmt === 'underline') return { textDecoration: 'underline' }
  return {}
}

/**
 * For CBS/FOX cells, tod encodes early/late × DH:
 *   0 = early DH,  1 = early non-DH,  2 = late DH,  3 = late non-DH
 * tod 0 or 2 → double-header game → apply dh_format styling.
 */
function isDhTod(slot: string, tod: number | null): boolean {
  const collapsed = collapseSlot(slot)
  return (collapsed === 'CBS' || collapsed === 'FOX') && (tod === 0 || tod === 2)
}

/** Home cell: solid slot color background, WCAG text + TOD style. */
export function getHomeColors(
  slot: string,
  tod: number | null,
  policy: ColorPolicy | null,
): CellColors {
  const bg = slotBg(slot, tod, policy)
  const base = { bg, text: textOnBackground(bg), ...todStyle(tod, policy) }
  return isDhTod(slot, tod) ? { ...base, ...dhStyle(policy) } : base
}

/** Away cell: white background, slot color as text + TOD style. */
export function getAwayColors(
  slot: string,
  tod: number | null,
  policy: ColorPolicy | null,
): CellColors {
  const base = { bg: '#FFFFFF', text: slotBg(slot, tod, policy), ...todStyle(tod, policy) }
  return isDhTod(slot, tod) ? { ...base, ...dhStyle(policy) } : base
}

export const BYE_COLORS: CellColors = { bg: '#000000', text: '#ffffff' }
