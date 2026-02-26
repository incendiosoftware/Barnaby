/**
 * Thematic icon components. Use currentColor so icons inherit parent color.
 */

const iconProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  fill: 'none' as const,
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

type IconProps = { className?: string; size?: number }

export function BuildIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <path d="M14.7 6.3 17.7 9.3" />
      <path d="M8 5h4l2 2v4" />
      <path d="M6 13l6 6" />
      <path d="M10 17l-2 2" />
      <path d="M7 14l-2 2" />
    </svg>
  )
}

export function CloseIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <path d="M18 6 6 18" />
      <path d="M6 6 18 18" />
    </svg>
  )
}

export function CollapseAllIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <path d="M8 6H6v2" />
      <path d="M16 6h2v2" />
      <path d="M6 16v2h2" />
      <path d="M18 16v2h-2" />
      <path d="M9 12h6" />
    </svg>
  )
}

export function CommitIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <circle cx="12" cy="12" r="2" />
      <path d="M5 12h5" />
      <path d="M14 12h5" />
    </svg>
  )
}

export function DeployIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <path d="M12 3v6" />
      <path d="m9 6 3-3 3 3" />
      <path d="M6 11h12" />
      <path d="M7 21h10" />
      <path d="M8 11v6a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-6" />
    </svg>
  )
}

export function DockIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 15h16" />
      <path d="M9 12l3-3 3 3" />
    </svg>
  )
}

export function ExpandAllIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <path d="M8 6H6v2" />
      <path d="M16 6h2v2" />
      <path d="M6 16v2h2" />
      <path d="M18 16v2h-2" />
      <path d="M9 12h6" />
      <path d="M12 9v6" />
    </svg>
  )
}

export function FolderIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <path d="M4 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" />
      <path d="M4 9h20" />
    </svg>
  )
}

export function GitIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <circle cx="6" cy="18" r="2" />
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M8 6h4a4 4 0 0 1 4 4v0" />
      <path d="M8 18h4a4 4 0 0 0 4-4v0" />
      <path d="M6 8v8" />
    </svg>
  )
}

export function GridIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <rect x="3" y="4" width="8" height="7" />
      <rect x="13" y="4" width="8" height="7" />
      <rect x="3" y="13" width="8" height="7" />
      <rect x="13" y="13" width="8" height="7" />
    </svg>
  )
}

export function InteractionModeIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <path d="M7 12a3 3 0 1 1 3 3H7v-3z" />
      <path d="M14 9h3a3 3 0 1 1-3 3v-3z" />
    </svg>
  )
}

export function OpenExternalIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <path d="M14 5h5v5" />
      <path d="M10 14 19 5" />
      <rect x="5" y="9" width="10" height="10" rx="2" />
    </svg>
  )
}

export function PanelBottomIcon({ className, size = 24, active = false }: IconProps & { active?: boolean }) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <rect x="3" y="4" width="18" height="16" />
      <rect x="3" y="15" width="18" height="5" fill="currentColor" fillOpacity={active ? 0.6 : 0.15} />
    </svg>
  )
}

export function PanelLeftIcon({ className, size = 24, active = false }: IconProps & { active?: boolean }) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <rect x="3" y="4" width="18" height="16" />
      <rect x="3" y="4" width="6" height="16" fill="currentColor" fillOpacity={active ? 0.6 : 0.15} />
    </svg>
  )
}

export function PanelRightIcon({ className, size = 24, active = false }: IconProps & { active?: boolean }) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <rect x="3" y="4" width="18" height="16" />
      <rect x="15" y="4" width="6" height="16" fill="currentColor" fillOpacity={active ? 0.6 : 0.15} />
    </svg>
  )
}

export function PanelTopIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <rect x="3" y="4" width="18" height="16" />
      <rect x="3" y="4" width="18" height="6" />
    </svg>
  )
}

export function PermissionIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <path d="M12 3l7 4v6c0 5-3 8-7 9-4-1-7-4-7-9V7l7-4z" />
      <path d="M9.5 12.5 11 14l3.5-4" />
    </svg>
  )
}

export function PushIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <path d="M12 16V5" />
      <path d="m7 10 5-5 5 5" />
      <path d="M6 19h12" />
    </svg>
  )
}

export function RefreshIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v6h-6" />
    </svg>
  )
}

export function ReleaseIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <path d="M12 3l3 6 6 .9-4.5 4.4 1.1 6.4L12 18l-5.6 2.9 1.1-6.4L3 9.9 9 9z" />
    </svg>
  )
}

export function RobotIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <rect x="6" y="7" width="12" height="10" rx="2" />
      <circle cx="10" cy="12" r="1" />
      <circle cx="14" cy="12" r="1" />
      <line x1="12" y1="7" x2="12" y2="4" />
      <circle cx="12" cy="3" r="1" />
    </svg>
  )
}

export function SandboxIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <path d="M4 10l8-4 8 4" />
      <path d="M4 10v8l8 4 8-4v-8" />
      <path d="M12 6v16" />
    </svg>
  )
}

export function SendIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <path d="M12 19V7" />
      <path d="m7 12 5-5 5 5" />
      <path d="M5 19h14" />
    </svg>
  )
}

export function SendArrowUpIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <path d="M12 19V7" />
      <path d="m7 12 5-5 5 5" />
      <path d="M5 19h14" />
    </svg>
  )
}

export function SettingsIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4" />
      <path d="M12 18.8v2.4" />
      <path d="M2.8 12h2.4" />
      <path d="M18.8 12h2.4" />
      <path d="M5.4 5.4l1.7 1.7" />
      <path d="M16.9 16.9l1.7 1.7" />
      <path d="M18.6 5.4l-1.7 1.7" />
      <path d="M7.1 16.9l-1.7 1.7" />
      <circle cx="12" cy="12" r="7" />
    </svg>
  )
}

export function SpinnerIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <path d="M12 4a8 8 0 1 1-8 8" />
    </svg>
  )
}

export function SplitHorizontalIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <rect x="3" y="4" width="18" height="16" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  )
}

export function SplitPanelIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <rect x="3" y="4" width="18" height="16" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  )
}

export function SplitVerticalIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <rect x="3" y="4" width="18" height="16" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  )
}

export function StopIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <rect x="7" y="7" width="10" height="10" rx="0" />
    </svg>
  )
}

export function StopFilledIcon({ className, size = 24 }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={size} height={size} className={className}>
      <rect x="7" y="7" width="10" height="10" rx="1" />
    </svg>
  )
}

export function StopOutlineIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <rect x="7" y="7" width="10" height="10" />
    </svg>
  )
}

export function StopSquareIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <circle cx="12" cy="12" r="9" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  )
}

export function TileGridIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <rect x="3" y="4" width="8" height="7" />
      <rect x="13" y="4" width="8" height="7" />
      <rect x="3" y="13" width="8" height="7" />
      <rect x="13" y="13" width="8" height="7" />
    </svg>
  )
}

export function TileHorizontalIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <rect x="3" y="4" width="18" height="16" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
    </svg>
  )
}

export function TileHorizontalFilledIcon({ className, size = 24 }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={size} height={size} className={className}>
      <rect x="3" y="4" width="5" height="16" />
      <rect x="10" y="4" width="4" height="16" />
      <rect x="16" y="4" width="5" height="16" />
    </svg>
  )
}

export function TileVerticalIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <rect x="3" y="4" width="18" height="16" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </svg>
  )
}

export function TileVerticalFilledIcon({ className, size = 24 }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={size} height={size} className={className}>
      <rect x="3" y="4" width="18" height="4" />
      <rect x="3" y="10" width="18" height="4" />
      <rect x="3" y="16" width="18" height="4" />
    </svg>
  )
}

export function ViewIcon({ className, size = 24 }: IconProps) {
  return (
    <svg {...iconProps} width={size} height={size} className={className}>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}
