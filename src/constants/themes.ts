/**
 * Theme constants and catalog.
 */

import type { StandaloneTheme, Theme } from '../types'
import { DEFAULT_DIAGNOSTICS_MESSAGE_COLORS } from './index'

type ThemeSeed = {
  id: string
  name: string
  codeSyntax: Theme
  accent: string
  accentStrong: string
  accentMuted: string
  accentOnPrimary: string
  accentTint: string
  bgBase: string
  bgSurface: string
}

function buildTheme(seed: ThemeSeed): StandaloneTheme {
  const isLight = seed.codeSyntax === 'light'
  return {
    ...seed,
    bgElevated: isLight
      ? `color-mix(in srgb, ${seed.bgSurface} 80%, white)`
      : `color-mix(in srgb, ${seed.bgSurface} 88%, white)`,
    textPrimary: isLight
      ? 'hsl(220, 16%, 14%)'
      : `color-mix(in srgb, #ffffff 90%, ${seed.bgSurface})`,
    textSecondary: isLight
      ? 'hsl(220, 11%, 34%)'
      : `color-mix(in srgb, #ffffff 72%, ${seed.bgSurface})`,
    textTertiary: isLight
      ? 'hsl(220, 9%, 46%)'
      : `color-mix(in srgb, #ffffff 55%, ${seed.bgSurface})`,
    borderDefault: isLight
      ? `color-mix(in srgb, ${seed.bgBase} 86%, hsl(220, 10%, 58%))`
      : `color-mix(in srgb, ${seed.bgBase} 78%, white)`,
    borderStrong: isLight
      ? `color-mix(in srgb, ${seed.bgSurface} 70%, hsl(220, 10%, 52%))`
      : `color-mix(in srgb, ${seed.bgSurface} 65%, white)`,
    assistantBubbleBg: isLight
      ? `color-mix(in srgb, ${seed.accentTint} 42%, white)`
      : `color-mix(in srgb, ${seed.accentTint} 48%, ${seed.bgSurface})`,
    scrollbarThumb: isLight
      ? `color-mix(in srgb, ${seed.bgSurface} 34%, hsl(220, 10%, 45%))`
      : `color-mix(in srgb, ${seed.bgSurface} 65%, white)`,
    scrollbarTrack: isLight
      ? `color-mix(in srgb, ${seed.bgBase} 84%, white)`
      : seed.bgBase,
    ...DEFAULT_DIAGNOSTICS_MESSAGE_COLORS,
  }
}

const THEME_SEEDS: ThemeSeed[] = [
  {
    id: 'default',
    name: 'Default',
    codeSyntax: 'light',
    accent: '#88c0d0',
    accentStrong: '#5e81ac',
    accentMuted: '#4c6a91',
    accentOnPrimary: '#d8e9f0',
    accentTint: '#f0f6ff',
    bgBase: '#f5f5f5',
    bgSurface: '#ffffff',
  },
  {
    id: 'custom',
    name: 'Custom',
    codeSyntax: 'light',
    accent: '#88c0d0',
    accentStrong: '#5e81ac',
    accentMuted: '#4c6a91',
    accentOnPrimary: '#d8e9f0',
    accentTint: '#f0f6ff',
    bgBase: '#f5f5f5',
    bgSurface: '#ffffff',
  },
  {
    id: 'pearl-ash',
    name: 'Pearl Ash',
    codeSyntax: 'light',
    accent: 'hsl(220, 28%, 56%)',
    accentStrong: 'hsl(220, 30%, 46%)',
    accentMuted: 'hsl(220, 18%, 39%)',
    accentOnPrimary: 'hsl(0, 0%, 98%)',
    accentTint: 'hsl(220, 24%, 94%)',
    bgBase: 'hsl(0, 0%, 95%)',
    bgSurface: '#ffffff',
  },
  {
    id: 'rose-quartz',
    name: 'Rose Quartz',
    codeSyntax: 'light',
    accent: 'hsl(340, 34%, 61%)',
    accentStrong: 'hsl(340, 37%, 50%)',
    accentMuted: 'hsl(340, 23%, 41%)',
    accentOnPrimary: 'hsl(0, 0%, 99%)',
    accentTint: 'hsl(340, 28%, 93%)',
    bgBase: 'hsl(340, 20%, 93%)',
    bgSurface: '#ffffff',
  },
  {
    id: 'azure-wash',
    name: 'Azure Wash',
    codeSyntax: 'light',
    accent: 'hsl(210, 46%, 56%)',
    accentStrong: 'hsl(210, 52%, 46%)',
    accentMuted: 'hsl(210, 31%, 39%)',
    accentOnPrimary: 'hsl(0, 0%, 99%)',
    accentTint: 'hsl(210, 48%, 93%)',
    bgBase: 'hsl(210, 25%, 93%)',
    bgSurface: '#ffffff',
  },
  {
    id: 'sage-mist',
    name: 'Sage Mist',
    codeSyntax: 'light',
    accent: 'hsl(145, 30%, 50%)',
    accentStrong: 'hsl(145, 36%, 40%)',
    accentMuted: 'hsl(145, 22%, 34%)',
    accentOnPrimary: 'hsl(0, 0%, 99%)',
    accentTint: 'hsl(145, 28%, 93%)',
    bgBase: 'hsl(150, 15%, 93%)',
    bgSurface: '#ffffff',
  },
  {
    id: 'lilac-haze',
    name: 'Lilac Haze',
    codeSyntax: 'light',
    accent: 'hsl(266, 38%, 62%)',
    accentStrong: 'hsl(266, 44%, 51%)',
    accentMuted: 'hsl(266, 26%, 42%)',
    accentOnPrimary: 'hsl(0, 0%, 99%)',
    accentTint: 'hsl(266, 34%, 93%)',
    bgBase: 'hsl(270, 20%, 93%)',
    bgSurface: '#ffffff',
  },
  {
    id: 'warm-parchment',
    name: 'Warm Parchment',
    codeSyntax: 'light',
    accent: 'hsl(36, 46%, 54%)',
    accentStrong: 'hsl(31, 52%, 44%)',
    accentMuted: 'hsl(28, 33%, 38%)',
    accentOnPrimary: 'hsl(0, 0%, 99%)',
    accentTint: 'hsl(40, 48%, 92%)',
    bgBase: 'hsl(35, 30%, 92%)',
    bgSurface: '#ffffff',
  },
  {
    id: 'graphite-void',
    name: 'Graphite Void',
    codeSyntax: 'dark',
    accent: 'hsl(220, 24%, 68%)',
    accentStrong: 'hsl(220, 28%, 58%)',
    accentMuted: 'hsl(220, 24%, 70%)',
    accentOnPrimary: 'hsl(220, 20%, 12%)',
    accentTint: 'hsl(220, 22%, 24%)',
    bgBase: 'hsl(0, 0%, 8%)',
    bgSurface: 'hsl(0, 0%, 11%)',
  },
  {
    id: 'dusk-mauve',
    name: 'Dusk Mauve',
    codeSyntax: 'dark',
    accent: 'hsl(332, 40%, 68%)',
    accentStrong: 'hsl(332, 44%, 58%)',
    accentMuted: 'hsl(332, 36%, 74%)',
    accentOnPrimary: 'hsl(332, 28%, 14%)',
    accentTint: 'hsl(340, 15%, 24%)',
    bgBase: 'hsl(340, 15%, 9%)',
    bgSurface: 'hsl(340, 15%, 12%)',
  },
  {
    id: 'midnight-slate',
    name: 'Midnight Slate',
    codeSyntax: 'dark',
    accent: 'hsl(214, 52%, 67%)',
    accentStrong: 'hsl(214, 58%, 58%)',
    accentMuted: 'hsl(214, 42%, 73%)',
    accentOnPrimary: 'hsl(214, 35%, 14%)',
    accentTint: 'hsl(210, 20%, 24%)',
    bgBase: 'hsl(210, 20%, 9%)',
    bgSurface: 'hsl(210, 20%, 12%)',
  },
  {
    id: 'deep-boreal',
    name: 'Deep Boreal',
    codeSyntax: 'dark',
    accent: 'hsl(150, 30%, 62%)',
    accentStrong: 'hsl(150, 34%, 52%)',
    accentMuted: 'hsl(150, 23%, 69%)',
    accentOnPrimary: 'hsl(150, 24%, 14%)',
    accentTint: 'hsl(150, 15%, 23%)',
    bgBase: 'hsl(150, 15%, 9%)',
    bgSurface: 'hsl(150, 15%, 12%)',
  },
  {
    id: 'astral-violet',
    name: 'Astral Violet',
    codeSyntax: 'dark',
    accent: 'hsl(270, 48%, 70%)',
    accentStrong: 'hsl(270, 54%, 60%)',
    accentMuted: 'hsl(270, 40%, 76%)',
    accentOnPrimary: 'hsl(270, 30%, 14%)',
    accentTint: 'hsl(270, 15%, 24%)',
    bgBase: 'hsl(270, 15%, 9%)',
    bgSurface: 'hsl(270, 15%, 12%)',
  },
  {
    id: 'smoked-bronze',
    name: 'Smoked Bronze',
    codeSyntax: 'dark',
    accent: 'hsl(28, 48%, 62%)',
    accentStrong: 'hsl(28, 54%, 53%)',
    accentMuted: 'hsl(28, 38%, 69%)',
    accentOnPrimary: 'hsl(28, 32%, 14%)',
    accentTint: 'hsl(35, 15%, 23%)',
    bgBase: 'hsl(35, 15%, 9%)',
    bgSurface: 'hsl(35, 15%, 12%)',
  },
]

export const THEMES: StandaloneTheme[] = THEME_SEEDS.map(buildTheme)
