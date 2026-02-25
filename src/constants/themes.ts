/**
 * Theme constants and catalog.
 */

import type { StandaloneTheme } from '../types'
import { DEFAULT_DIAGNOSTICS_MESSAGE_COLORS } from './index'

type BaseStandaloneTheme = Omit<
  StandaloneTheme,
  keyof typeof DEFAULT_DIAGNOSTICS_MESSAGE_COLORS | 'assistantBubbleBgLight' | 'assistantBubbleBgDark'
>

export const BASE_THEMES: BaseStandaloneTheme[] = [
  { id: 'default-light', name: 'Default Light', mode: 'light', accent500: '#88c0d0', accent600: '#5e81ac', accent700: '#4c6a91', accentText: '#d8e9f0', accentSoft: '#e5f2f7', accentSoftDark: 'rgba(94,129,172,0.28)', dark950: '#2e3440', dark900: '#3b4252' },
  { id: 'default-dark', name: 'Default Dark', mode: 'dark', accent500: '#88c0d0', accent600: '#5e81ac', accent700: '#4c6a91', accentText: '#d8e9f0', accentSoft: '#e5f2f7', accentSoftDark: 'rgba(94,129,172,0.28)', dark950: '#383838', dark900: '#454545' },
  { id: 'obsidian-black', name: 'Obsidian Black', mode: 'dark', accent500: '#7c3aed', accent600: '#6d28d9', accent700: '#5b21b6', accentText: '#ddd6fe', accentSoft: '#ede9fe', accentSoftDark: 'rgba(124,58,237,0.24)', dark950: '#000000', dark900: '#0a0a0a' },
  { id: 'dracula', name: 'Dracula', mode: 'dark', accent500: '#bd93f9', accent600: '#a87ef5', accent700: '#8f62ea', accentText: '#f3e8ff', accentSoft: '#f5f3ff', accentSoftDark: 'rgba(189,147,249,0.25)', dark950: '#191a21', dark900: '#232533' },
  { id: 'nord-light', name: 'Nord Light', mode: 'light', accent500: '#88c0d0', accent600: '#5e81ac', accent700: '#4c6a91', accentText: '#d8e9f0', accentSoft: '#e5f2f7', accentSoftDark: 'rgba(94,129,172,0.28)', dark950: '#2e3440', dark900: '#3b4252' },
  { id: 'nord-dark', name: 'Nord Dark', mode: 'dark', accent500: '#88c0d0', accent600: '#5e81ac', accent700: '#4c6a91', accentText: '#d8e9f0', accentSoft: '#e5f2f7', accentSoftDark: 'rgba(94,129,172,0.28)', dark950: '#2e3440', dark900: '#3b4252' },
  { id: 'solarized-light', name: 'Solarized Light', mode: 'light', accent500: '#2aa198', accent600: '#268e87', accent700: '#1f7a74', accentText: '#d1fae5', accentSoft: '#dcfce7', accentSoftDark: 'rgba(42,161,152,0.26)', dark950: '#002b36', dark900: '#073642' },
  { id: 'solarized-dark', name: 'Solarized Dark', mode: 'dark', accent500: '#2aa198', accent600: '#268e87', accent700: '#1f7a74', accentText: '#d1fae5', accentSoft: '#dcfce7', accentSoftDark: 'rgba(42,161,152,0.26)', dark950: '#002b36', dark900: '#073642' },
  { id: 'gruvbox-light', name: 'Gruvbox Light', mode: 'light', accent500: '#d79921', accent600: '#b57614', accent700: '#9a5f10', accentText: '#fef3c7', accentSoft: '#fffbeb', accentSoftDark: 'rgba(215,153,33,0.26)', dark950: '#1d2021', dark900: '#282828' },
  { id: 'gruvbox-dark', name: 'Gruvbox Dark', mode: 'dark', accent500: '#d79921', accent600: '#b57614', accent700: '#9a5f10', accentText: '#fef3c7', accentSoft: '#fffbeb', accentSoftDark: 'rgba(215,153,33,0.26)', dark950: '#1d2021', dark900: '#282828' },
  { id: 'tokyo-night-light', name: 'Tokyo Night Light', mode: 'light', accent500: '#0db9d7', accent600: '#0aa2c0', accent700: '#0889a3', accentText: '#cceef3', accentSoft: '#e0f7fa', accentSoftDark: 'rgba(13,185,215,0.22)', dark950: '#1a1b26', dark900: '#24283b' },
  { id: 'tokyo-night-dark', name: 'Tokyo Night Dark', mode: 'dark', accent500: '#7aa2f7', accent600: '#5f88e8', accent700: '#4c74d0', accentText: '#dbeafe', accentSoft: '#eff6ff', accentSoftDark: 'rgba(122,162,247,0.26)', dark950: '#1a1b26', dark900: '#24283b' },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', mode: 'dark', accent500: '#cba6f7', accent600: '#b68cf0', accent700: '#9f73e3', accentText: '#f5e8ff', accentSoft: '#faf5ff', accentSoftDark: 'rgba(203,166,247,0.26)', dark950: '#1e1e2e', dark900: '#313244' },
  { id: 'github-dark', name: 'GitHub Dark', mode: 'dark', accent500: '#58a6ff', accent600: '#3b82d6', accent700: '#2f6fb8', accentText: '#dbeafe', accentSoft: '#eff6ff', accentSoftDark: 'rgba(88,166,255,0.26)', dark950: '#0d1117', dark900: '#161b22' },
  { id: 'monokai', name: 'Monokai', mode: 'dark', accent500: '#a6e22e', accent600: '#84cc16', accent700: '#65a30d', accentText: '#ecfccb', accentSoft: '#f7fee7', accentSoftDark: 'rgba(166,226,46,0.22)', dark950: '#1f1f1f', dark900: '#272822' },
  { id: 'one-dark', name: 'One Dark', mode: 'dark', accent500: '#61afef', accent600: '#3d8fd9', accent700: '#2f75ba', accentText: '#dbeafe', accentSoft: '#eff6ff', accentSoftDark: 'rgba(97,175,239,0.26)', dark950: '#1e2127', dark900: '#282c34' },
  { id: 'ayu-mirage', name: 'Ayu Mirage', mode: 'dark', accent500: '#ffb454', accent600: '#f59e0b', accent700: '#d97706', accentText: '#ffedd5', accentSoft: '#fff7ed', accentSoftDark: 'rgba(255,180,84,0.24)', dark950: '#1f2430', dark900: '#242936' },
  { id: 'material-ocean', name: 'Material Ocean', mode: 'dark', accent500: '#82aaff', accent600: '#5d8bef', accent700: '#4a74d1', accentText: '#dbeafe', accentSoft: '#eff6ff', accentSoftDark: 'rgba(130,170,255,0.26)', dark950: '#0f111a', dark900: '#1a1c25' },
  { id: 'synthwave-84', name: 'Synthwave 84', mode: 'dark', accent500: '#ff7edb', accent600: '#ec4899', accent700: '#be185d', accentText: '#fce7f3', accentSoft: '#fdf2f8', accentSoftDark: 'rgba(255,126,219,0.26)', dark950: '#241b2f', dark900: '#2b213a' },
]

export const THEMES: StandaloneTheme[] = BASE_THEMES.map((theme) => ({
  ...theme,
  assistantBubbleBgLight: `color-mix(in srgb, ${theme.accentSoft} 34%, white)`,
  assistantBubbleBgDark: `color-mix(in srgb, ${theme.accentSoftDark} 45%, ${theme.dark900})`,
  ...DEFAULT_DIAGNOSTICS_MESSAGE_COLORS,
}))
