/**
 * Theme constants and catalog.
 */

import type { StandaloneTheme } from '../types'
import { DEFAULT_DIAGNOSTICS_MESSAGE_COLORS } from './index'

type BaseThemeSkeleton = Pick<
  StandaloneTheme,
  'id' | 'name' | 'codeSyntax' | 'accent' | 'accentStrong' | 'accentMuted' | 'accentOnPrimary' | 'accentTint'
>

const LIGHT_SURFACES = {
  bgBase: '#f5f5f5',
  bgSurface: '#ffffff',
  bgElevated: '#f8fafc',
  textPrimary: '#171717',
  textSecondary: '#525252',
  textTertiary: '#737373',
  borderDefault: '#d4d4d4',
  borderStrong: '#a3a3a3',
  scrollbarThumb: 'rgba(115, 115, 115, 0.55)',
  scrollbarTrack: 'rgba(229, 229, 229, 0.45)',
} as const

const BASE_THEMES: BaseThemeSkeleton[] = [
  { id: 'default-light', name: 'Default Light', codeSyntax: 'light', accent: '#88c0d0', accentStrong: '#5e81ac', accentMuted: '#4c6a91', accentOnPrimary: '#d8e9f0', accentTint: '#e5f2f7' },
  { id: 'default-dark', name: 'Default Dark', codeSyntax: 'dark', accent: '#88c0d0', accentStrong: '#5e81ac', accentMuted: '#4c6a91', accentOnPrimary: '#d8e9f0', accentTint: 'rgba(94,129,172,0.28)' },
  { id: 'obsidian-black', name: 'Obsidian Black', codeSyntax: 'dark', accent: '#7c3aed', accentStrong: '#6d28d9', accentMuted: '#5b21b6', accentOnPrimary: '#ddd6fe', accentTint: 'rgba(124,58,237,0.24)' },
  { id: 'dracula', name: 'Dracula', codeSyntax: 'dark', accent: '#bd93f9', accentStrong: '#a87ef5', accentMuted: '#8f62ea', accentOnPrimary: '#f3e8ff', accentTint: 'rgba(189,147,249,0.25)' },
  { id: 'nord-light', name: 'Nord Light', codeSyntax: 'light', accent: '#88c0d0', accentStrong: '#5e81ac', accentMuted: '#4c6a91', accentOnPrimary: '#d8e9f0', accentTint: '#f0f6ff' },
  { id: 'nord-dark', name: 'Nord Dark', codeSyntax: 'dark', accent: '#88c0d0', accentStrong: '#5e81ac', accentMuted: '#4c6a91', accentOnPrimary: '#d8e9f0', accentTint: 'rgba(94,129,172,0.28)' },
  { id: 'solarized-light', name: 'Solarized Light', codeSyntax: 'light', accent: '#2aa198', accentStrong: '#268e87', accentMuted: '#1f7a74', accentOnPrimary: '#d1fae5', accentTint: '#dcfce7' },
  { id: 'solarized-dark', name: 'Solarized Dark', codeSyntax: 'dark', accent: '#2aa198', accentStrong: '#268e87', accentMuted: '#1f7a74', accentOnPrimary: '#d1fae5', accentTint: 'rgba(42,161,152,0.26)' },
  { id: 'gruvbox-light', name: 'Gruvbox Light', codeSyntax: 'light', accent: '#d79921', accentStrong: '#b57614', accentMuted: '#9a5f10', accentOnPrimary: '#fef3c7', accentTint: '#fffbeb' },
  { id: 'gruvbox-dark', name: 'Gruvbox Dark', codeSyntax: 'dark', accent: '#d79921', accentStrong: '#b57614', accentMuted: '#9a5f10', accentOnPrimary: '#fef3c7', accentTint: 'rgba(215,153,33,0.26)' },
  { id: 'tokyo-night-light', name: 'Tokyo Night Light', codeSyntax: 'light', accent: '#0db9d7', accentStrong: '#0aa2c0', accentMuted: '#0889a3', accentOnPrimary: '#cceef3', accentTint: '#e0f7fa' },
  { id: 'tokyo-night-dark', name: 'Tokyo Night Dark', codeSyntax: 'dark', accent: '#7aa2f7', accentStrong: '#5f88e8', accentMuted: '#4c74d0', accentOnPrimary: '#dbeafe', accentTint: 'rgba(122,162,247,0.26)' },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', codeSyntax: 'dark', accent: '#cba6f7', accentStrong: '#b68cf0', accentMuted: '#9f73e3', accentOnPrimary: '#f5e8ff', accentTint: 'rgba(203,166,247,0.26)' },
  { id: 'github-dark', name: 'GitHub Dark', codeSyntax: 'dark', accent: '#58a6ff', accentStrong: '#3b82d6', accentMuted: '#2f6fb8', accentOnPrimary: '#dbeafe', accentTint: 'rgba(88,166,255,0.26)' },
  { id: 'monokai', name: 'Monokai', codeSyntax: 'dark', accent: '#a6e22e', accentStrong: '#84cc16', accentMuted: '#65a30d', accentOnPrimary: '#ecfccb', accentTint: 'rgba(166,226,46,0.22)' },
  { id: 'one-dark', name: 'One Dark', codeSyntax: 'dark', accent: '#61afef', accentStrong: '#3d8fd9', accentMuted: '#2f75ba', accentOnPrimary: '#dbeafe', accentTint: 'rgba(97,175,239,0.26)' },
  { id: 'ayu-mirage', name: 'Ayu Mirage', codeSyntax: 'dark', accent: '#ffb454', accentStrong: '#f59e0b', accentMuted: '#d97706', accentOnPrimary: '#ffedd5', accentTint: 'rgba(255,180,84,0.24)' },
  { id: 'material-ocean', name: 'Material Ocean', codeSyntax: 'dark', accent: '#82aaff', accentStrong: '#5d8bef', accentMuted: '#4a74d1', accentOnPrimary: '#dbeafe', accentTint: 'rgba(130,170,255,0.26)' },
  { id: 'synthwave-84', name: 'Synthwave 84', codeSyntax: 'dark', accent: '#ff7edb', accentStrong: '#ec4899', accentMuted: '#be185d', accentOnPrimary: '#fce7f3', accentTint: 'rgba(255,126,219,0.26)' },
  { id: 'custom', name: 'Custom', codeSyntax: 'light', accent: '#88c0d0', accentStrong: '#5e81ac', accentMuted: '#4c6a91', accentOnPrimary: '#d8e9f0', accentTint: '#e5f2f7' },
]

const DARK_SURFACES_BY_THEME_ID: Record<string, { bgBase: string; bgSurface: string }> = {
  'default-dark': { bgBase: '#383838', bgSurface: '#454545' },
  'obsidian-black': { bgBase: '#000000', bgSurface: '#0a0a0a' },
  dracula: { bgBase: '#191a21', bgSurface: '#232533' },
  'nord-dark': { bgBase: '#2e3440', bgSurface: '#3b4252' },
  'solarized-dark': { bgBase: '#002b36', bgSurface: '#073642' },
  'gruvbox-dark': { bgBase: '#1d2021', bgSurface: '#282828' },
  'tokyo-night-dark': { bgBase: '#1a1b26', bgSurface: '#24283b' },
  'catppuccin-mocha': { bgBase: '#1e1e2e', bgSurface: '#313244' },
  'github-dark': { bgBase: '#0d1117', bgSurface: '#161b22' },
  monokai: { bgBase: '#1f1f1f', bgSurface: '#272822' },
  'one-dark': { bgBase: '#1e2127', bgSurface: '#282c34' },
  'ayu-mirage': { bgBase: '#1f2430', bgSurface: '#242936' },
  'material-ocean': { bgBase: '#0f111a', bgSurface: '#1a1c25' },
  'synthwave-84': { bgBase: '#241b2f', bgSurface: '#2b213a' },
}

function toStandaloneTheme(base: BaseThemeSkeleton): StandaloneTheme {
  if (base.codeSyntax === 'light') {
    return {
      ...base,
      ...LIGHT_SURFACES,
      assistantBubbleBg: `color-mix(in srgb, ${base.accentTint} 34%, white)`,
      ...DEFAULT_DIAGNOSTICS_MESSAGE_COLORS,
    }
  }

  const surfaces = DARK_SURFACES_BY_THEME_ID[base.id] ?? { bgBase: '#171717', bgSurface: '#262626' }
  return {
    ...base,
    bgBase: surfaces.bgBase,
    bgSurface: surfaces.bgSurface,
    bgElevated: `color-mix(in srgb, ${surfaces.bgSurface} 84%, white)`,
    textPrimary: `color-mix(in srgb, #ffffff 90%, ${surfaces.bgSurface})`,
    textSecondary: `color-mix(in srgb, #ffffff 72%, ${surfaces.bgSurface})`,
    textTertiary: `color-mix(in srgb, #ffffff 55%, ${surfaces.bgSurface})`,
    borderDefault: `color-mix(in srgb, ${surfaces.bgBase} 78%, white)`,
    borderStrong: `color-mix(in srgb, ${surfaces.bgSurface} 65%, white)`,
    assistantBubbleBg: `color-mix(in srgb, ${base.accentTint} 45%, ${surfaces.bgSurface})`,
    scrollbarThumb: `color-mix(in srgb, ${surfaces.bgSurface} 65%, white)`,
    scrollbarTrack: surfaces.bgBase,
    ...DEFAULT_DIAGNOSTICS_MESSAGE_COLORS,
    ...(base.id === 'nord-dark' ? { operationTrace: '#5c6e9d' } : {}),
  }
}

export const THEMES: StandaloneTheme[] = BASE_THEMES.map(toStandaloneTheme)
