/**
 * Theme CSS overrides injected as a <style> block to remap Tailwind
 * blue-* and neutral-* utilities to the active theme's CSS custom properties.
 */
export const THEME_PRESET_CSS = `
  .theme-preset .bg-blue-600 { background-color: var(--theme-accent-600) !important; }
  .theme-preset .hover\\:bg-blue-500:hover { background-color: var(--theme-accent-500) !important; }
  .theme-preset .border-blue-500 { border-color: var(--theme-accent-600) !important; }
  .theme-preset .text-blue-700,
  .theme-preset .text-blue-800,
  .theme-preset .text-blue-900 { color: var(--theme-accent-700) !important; }
  .theme-preset .bg-blue-50,
  .theme-preset .bg-blue-100,
  .theme-preset .bg-blue-50\\/90,
  .theme-preset .bg-blue-50\\/70 { background-color: var(--theme-accent-soft) !important; }
  .theme-preset .border-blue-200,
  .theme-preset .border-blue-300 { border-color: color-mix(in srgb, var(--theme-accent-500) 40%, white) !important; }
  .theme-preset .text-blue-950 { color: var(--theme-accent-700) !important; }
  .dark .theme-preset .dark\\:bg-blue-950,
  .dark .theme-preset .dark\\:bg-blue-950\\/20,
  .dark .theme-preset .dark\\:bg-blue-950\\/25,
  .dark .theme-preset .dark\\:bg-blue-950\\/30,
  .dark .theme-preset .dark\\:bg-blue-950\\/40,
  .dark .theme-preset .dark\\:bg-blue-950\\/50,
  .dark .theme-preset .dark\\:bg-blue-900\\/40 { background-color: var(--theme-accent-soft-dark) !important; }
  .dark .theme-preset .dark\\:text-blue-100,
  .dark .theme-preset .dark\\:text-blue-200,
  .dark .theme-preset .dark\\:text-blue-300 { color: var(--theme-accent-text) !important; }
  .dark .theme-preset .dark\\:border-blue-900,
  .dark .theme-preset .dark\\:border-blue-800,
  .dark .theme-preset .dark\\:border-blue-900\\/60,
  .dark .theme-preset .dark\\:border-blue-900\\/70 { border-color: color-mix(in srgb, var(--theme-accent-500) 50%, black) !important; }
  .dark .theme-preset .dark\\:bg-neutral-950 { background-color: var(--theme-dark-950) !important; }
  .dark .theme-preset .dark\\:bg-neutral-900 { background-color: var(--theme-dark-900) !important; }
  .dark .theme-preset .dark\\:bg-neutral-800 { background-color: color-mix(in srgb, var(--theme-dark-900) 84%, white) !important; }
  .dark .theme-preset .dark\\:border-neutral-800 { border-color: color-mix(in srgb, var(--theme-dark-950) 78%, white) !important; }
  .dark .theme-preset .dark\\:border-neutral-700 { border-color: color-mix(in srgb, var(--theme-dark-900) 74%, white) !important; }
  .dark .theme-preset .dark\\:border-neutral-600 { border-color: color-mix(in srgb, var(--theme-dark-900) 65%, white) !important; }
  .dark .theme-preset .dark\\:text-neutral-300 { color: color-mix(in srgb, #ffffff 82%, var(--theme-dark-900)) !important; }
  .dark .theme-preset .dark\\:text-neutral-200,
  .dark .theme-preset .dark\\:text-neutral-100 { color: color-mix(in srgb, #ffffff 90%, var(--theme-dark-900)) !important; }
  .theme-preset .hover\\:bg-blue-50:hover { background-color: var(--theme-accent-soft) !important; }
  .dark .theme-preset .dark\\:hover\\:bg-blue-900\\/40:hover,
  .dark .theme-preset .dark\\:hover\\:bg-blue-900\\/20:hover { background-color: var(--theme-accent-soft-dark) !important; }
  .theme-preset .hover\\:bg-blue-100:hover { background-color: var(--theme-accent-soft) !important; }
  .theme-preset .focus-visible\\:ring-blue-400\\/60:focus-visible,
  .theme-preset .focus\\:ring-blue-100:focus,
  .theme-preset .ring-blue-100 { box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme-accent-500) 25%, white) !important; }
  .theme-preset .focus\\:border-blue-400:focus { border-color: var(--theme-accent-600) !important; }
  .dark .theme-preset .dark\\:focus\\:ring-blue-900\\/40:focus { box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-accent-500) 35%, black) !important; }
  .dark .theme-preset .dark\\:focus\\:border-blue-700:focus { border-color: var(--theme-accent-600) !important; }
  .theme-preset .border-blue-400,
  .theme-preset .dark\\:border-blue-600 { border-color: var(--theme-accent-600) !important; }
  .dark .theme-preset .dark\\:hover\\:bg-neutral-700:hover { background-color: color-mix(in srgb, var(--theme-dark-900) 74%, white) !important; }
  .dark .theme-preset .dark\\:hover\\:bg-neutral-800:hover { background-color: color-mix(in srgb, var(--theme-dark-900) 84%, white) !important; }
  .theme-preset .hover\\:border-blue-200:hover,
  .theme-preset .dark\\:hover\\:border-blue-900\\/60:hover { border-color: color-mix(in srgb, var(--theme-accent-500) 40%, white) !important; }
  .dark .theme-preset .dark\\:hover\\:border-blue-900\\/60:hover { border-color: color-mix(in srgb, var(--theme-accent-500) 50%, black) !important; }
  .theme-preset .hover\\:text-blue-700:hover { color: var(--theme-accent-700) !important; }
  .dark .theme-preset .dark\\:hover\\:text-blue-300:hover { color: var(--theme-accent-text) !important; }

  .theme-preset * {
    scrollbar-width: thin;
    scrollbar-color: rgba(115, 115, 115, 0.55) rgba(229, 229, 229, 0.45);
  }
  .theme-preset *::-webkit-scrollbar { width: 10px; height: 10px; }
  .theme-preset *::-webkit-scrollbar-track { background: rgba(229, 229, 229, 0.45); }
  .theme-preset *::-webkit-scrollbar-thumb {
    background: rgba(115, 115, 115, 0.55);
    border-radius: 999px;
    border: 2px solid rgba(229, 229, 229, 0.45);
  }
  .dark .theme-preset * { scrollbar-color: color-mix(in srgb, var(--theme-dark-900) 65%, white) var(--theme-dark-950); }
  .dark .theme-preset *::-webkit-scrollbar-track { background: var(--theme-dark-950); }
  .dark .theme-preset *::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--theme-dark-900) 65%, white);
    border-color: var(--theme-dark-950);
  }
`
