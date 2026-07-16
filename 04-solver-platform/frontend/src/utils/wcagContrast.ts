// WCAG 2.1 relative luminance and contrast-based text color selection.

function toLinear(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

// Returns '#ffffff' or '#000000' — whichever meets WCAG AA on the given background.
export function textOnBackground(bgHex: string): '#ffffff' | '#000000' {
  return relativeLuminance(bgHex) < 0.179 ? '#ffffff' : '#000000'
}
