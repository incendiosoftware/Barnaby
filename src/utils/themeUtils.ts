import type { StandaloneTheme, ThemeOverrides, ThemeOverrideValues } from '../types'
import {
  CUSTOM_THEME_ID,
  FONT_SCALE_STEP,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  THEME_EDITABLE_FIELDS,
  THEME_OVERRIDES_STORAGE_KEY,
} from '../constants'
import { THEMES } from '../constants/themes'

export function applyThemeOverrides(overrides: ThemeOverrides): StandaloneTheme[] {
  return THEMES.map((theme) => {
    if (theme.id !== CUSTOM_THEME_ID) return theme
    const override = overrides[CUSTOM_THEME_ID]
    if (!override) return theme
    const next: StandaloneTheme = { ...theme }
    for (const field of THEME_EDITABLE_FIELDS) {
      const value = override[field.key]
      if (typeof value === 'string' && value.trim()) next[field.key] = value.trim()
    }
    return next
  })
}

export function sanitizeThemeOverrides(raw: unknown): ThemeOverrides {
  if (!raw || typeof raw !== 'object') return {}
  const knownIds = new Set(THEMES.map((theme) => theme.id))
  const source = raw as Record<string, unknown>
  const result: ThemeOverrides = {}
  for (const [themeId, overrideValue] of Object.entries(source)) {
    if (themeId !== CUSTOM_THEME_ID) continue
    if (!knownIds.has(themeId)) continue
    if (!overrideValue || typeof overrideValue !== 'object') continue
    const override = overrideValue as Record<string, unknown>
    const nextOverride: ThemeOverrideValues = {}
    for (const field of THEME_EDITABLE_FIELDS) {
      const value = override[field.key]
      if (typeof value === 'string' && value.trim()) nextOverride[field.key] = value.trim()
    }
    if (Object.keys(nextOverride).length > 0) result[themeId] = nextOverride
  }
  return result
}

export function getInitialThemeOverrides(): ThemeOverrides {
  try {
    const raw = globalThis.localStorage?.getItem(THEME_OVERRIDES_STORAGE_KEY)
    if (!raw) return {}
    return sanitizeThemeOverrides(JSON.parse(raw))
  } catch {
    return {}
  }
}

export function cloneTheme(theme: StandaloneTheme): StandaloneTheme {
  return { ...theme }
}

export function extractHexColor(value: string): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const shortHex = raw.match(/^#([0-9a-fA-F]{3})$/)
  if (shortHex) {
    const [r, g, b] = shortHex[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  const fullHex = raw.match(/^#([0-9a-fA-F]{6})$/)
  if (fullHex) return `#${fullHex[1].toLowerCase()}`
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
  const rgb = raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+\s*)?\)$/i)
  if (rgb) {
    const [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }
  // Resolve hsl(), color-mix(), and other CSS color functions via the browser
  if (typeof document !== 'undefined') {
    const el = document.createElement('span')
    el.style.color = raw
    document.body.appendChild(el)
    const computed = getComputedStyle(el).color
    document.body.removeChild(el)
    const m = computed.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/)
    if (m) return `#${toHex(Number(m[1]))}${toHex(Number(m[2]))}${toHex(Number(m[3]))}`
  }
  return null
}

export function getNextFontScale(current: number, deltaY: number) {
  const direction = deltaY < 0 ? 1 : -1
  return Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, Number((current + direction * FONT_SCALE_STEP).toFixed(2))))
}

export function isZoomWheelGesture(e: { ctrlKey: boolean; metaKey: boolean }) {
  return e.ctrlKey || e.metaKey
}
