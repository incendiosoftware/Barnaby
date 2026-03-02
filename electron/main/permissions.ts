import fs from 'node:fs'
import path from 'node:path'

export type WriteCursorCliConfigOptions = {
  cwd: string
  permissionMode: 'verify-first' | 'proceed-always'
  allowedCommandPrefixes?: string[]
  allowedAutoReadPrefixes?: string[]
  allowedAutoWritePrefixes?: string[]
  deniedAutoReadPrefixes?: string[]
  deniedAutoWritePrefixes?: string[]
  cursorAllowBuilds?: boolean
}

function normalizePrefixesForConfig(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const value = item.trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result.slice(0, 64)
}

function buildAllowedShellPermissions(allowedCommandPrefixes: string[]): string[] {
  const binaries = new Set<string>()
  let allowsPackageManager = false
  const add = (binary: string) => {
    const value = binary.trim()
    if (!value) return
    binaries.add(`Shell(${value})`)
  }
  const addCompanionBinaries = () => {
    add('node')
    add('node.exe')
    add('esbuild')
    add('esbuild.exe')
    add('vite')
    if (process.platform === 'win32') {
      add('cmd')
      add('cmd.exe')
    } else {
      add('sh')
      add('bash')
    }
  }
  const packageManagers = new Set(['npm', 'npx', 'pnpm', 'yarn', 'bun'])

  if (allowedCommandPrefixes.length === 0) {
    add('*')
    return Array.from(binaries)
  }

  for (const prefix of allowedCommandPrefixes) {
    const parts = prefix.trim().split(/\s+/)
    const primary = parts[0]
    if (!primary) continue
    add(primary)
    if (packageManagers.has(primary.toLowerCase())) {
      allowsPackageManager = true
      addCompanionBinaries()
    }
  }

  if (allowsPackageManager) add('*')

  return Array.from(binaries)
}

/**
 * Write .cursor/cli.json for Cursor IDE agent permissions.
 * Call from workspace save and Codex connect.
 * When cursorAllowBuilds is true, adds sandbox: { mode: "disabled" } to avoid spawn EPERM on Windows.
 */
export function writeCursorCliConfig(options: WriteCursorCliConfigOptions): void {
  const {
    cwd,
    permissionMode,
    cursorAllowBuilds = false,
  } = options

  const allowedCommandPrefixes = normalizePrefixesForConfig(options.allowedCommandPrefixes)
  const allowedAutoReadPrefixes = normalizePrefixesForConfig(options.allowedAutoReadPrefixes)
  const allowedAutoWritePrefixes = normalizePrefixesForConfig(options.allowedAutoWritePrefixes)
  const deniedAutoReadPrefixes = normalizePrefixesForConfig(options.deniedAutoReadPrefixes)
  const deniedAutoWritePrefixes = normalizePrefixesForConfig(options.deniedAutoWritePrefixes)

  if (permissionMode !== 'proceed-always' && !cursorAllowBuilds) {
    return
  }

  const configDir = path.join(cwd, '.cursor')
  const configPath = path.join(configDir, 'cli.json')

  const allowedBinaries = buildAllowedShellPermissions(allowedCommandPrefixes)
  const readRules =
    allowedAutoReadPrefixes.length > 0
      ? allowedAutoReadPrefixes.map((p) => `Read(${p}**)`)
      : ['Read(**)']
  const writeRules =
    allowedAutoWritePrefixes.length > 0
      ? allowedAutoWritePrefixes.map((p) => `Write(${p}**)`)
      : ['Write(**)']
  const deniedRead = deniedAutoReadPrefixes.map((p) => `Read(${p}**)`)
  const deniedWrite = deniedAutoWritePrefixes.map((p) => `Write(${p}**)`)

  const config: Record<string, unknown> = {
    permissions: {
      allow: [...allowedBinaries, ...readRules, ...writeRules],
      deny: [...deniedRead, ...deniedWrite],
    },
  }

  if (cursorAllowBuilds) {
    config.sandbox = { mode: 'disabled' }
  }

  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
  } catch (err) {
    console.error(`Failed to write Cursor CLI config: ${String(err)}`)
  }
}

export type PermissionOptions = {
  allowedCommandPrefixes?: string[]
  allowedAutoReadPrefixes?: string[]
  allowedAutoWritePrefixes?: string[]
  deniedAutoReadPrefixes?: string[]
  deniedAutoWritePrefixes?: string[]
}

export class PermissionManager {
  allowedCommandPrefixes: string[] = []
  allowedAutoReadPrefixes: string[] = []
  allowedAutoWritePrefixes: string[] = []
  deniedAutoReadPrefixes: string[] = []
  deniedAutoWritePrefixes: string[] = []

  constructor(options: PermissionOptions) {
    this.allowedCommandPrefixes = this.normalizePrefixes(options.allowedCommandPrefixes)
    this.allowedAutoReadPrefixes = this.normalizePrefixes(options.allowedAutoReadPrefixes)
    this.allowedAutoWritePrefixes = this.normalizePrefixes(options.allowedAutoWritePrefixes)
    this.deniedAutoReadPrefixes = this.normalizePrefixes(options.deniedAutoReadPrefixes)
    this.deniedAutoWritePrefixes = this.normalizePrefixes(options.deniedAutoWritePrefixes)
  }

  private normalizePrefixes(raw: unknown): string[] {
    if (!Array.isArray(raw)) return []
    const seen = new Set<string>()
    const result: string[] = []
    for (const item of raw) {
      if (typeof item !== 'string') continue
      const value = item.trim()
      if (!value) continue
      const key = value.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      result.push(value)
    }
    return result.slice(0, 64)
  }

  writeCliConfig(cwd: string) {
    const configDir = path.join(cwd, '.cursor')
    const configPath = path.join(configDir, 'cli.json')

    // If all lists are empty, we should NOT enforce a restrictive cli.json.
    // Instead, we remove it to restore the default "Allow All" behavior of the agent.
    if (
      this.allowedCommandPrefixes.length === 0 &&
      this.allowedAutoReadPrefixes.length === 0 &&
      this.allowedAutoWritePrefixes.length === 0 &&
      this.deniedAutoReadPrefixes.length === 0 &&
      this.deniedAutoWritePrefixes.length === 0
    ) {
      if (fs.existsSync(configPath)) {
        try {
          fs.unlinkSync(configPath)
        } catch (e) {
          /* ignore */
        }
      }
      return
    }

    // Resolve shell permissions from explicit prefixes plus required toolchain companions.
    const allowedBinaries = this.buildAllowedShellPermissions()

    // Build read/write rules
    const readRules =
      this.allowedAutoReadPrefixes.length > 0
        ? this.allowedAutoReadPrefixes.map((p) => `Read(${p}**)`)
        : ['Read(**)']

    const writeRules =
      this.allowedAutoWritePrefixes.length > 0
        ? this.allowedAutoWritePrefixes.map((p) => `Write(${p}**)`)
        : ['Write(**)']

    const deniedRead = this.deniedAutoReadPrefixes.map((p) => `Read(${p}**)`)
    const deniedWrite = this.deniedAutoWritePrefixes.map((p) => `Write(${p}**)`)

    const config = {
      permissions: {
        allow: [...allowedBinaries, ...readRules, ...writeRules],
        deny: [...deniedRead, ...deniedWrite],
      },
    }

    try {
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
    } catch (err) {
      // Best effort
      console.error(`Failed to write permission config: ${String(err)}`)
    }
  }

  private buildAllowedShellPermissions(): string[] {
    const binaries = new Set<string>()
    let allowsPackageManager = false
    const add = (binary: string) => {
      const value = binary.trim()
      if (!value) return
      binaries.add(`Shell(${value})`)
    }
    const addCompanionBinaries = () => {
      add('node')
      add('esbuild')
      add('esbuild.exe')
      if (process.platform === 'win32') {
        add('cmd')
        add('cmd.exe')
      } else {
        add('sh')
        add('bash')
      }
    }
    const packageManagers = new Set(['npm', 'npx', 'pnpm', 'yarn', 'bun'])

    if (this.allowedCommandPrefixes.length === 0) {
      // Empty allowlist should map to fully open shell execution.
      add('*')
      return Array.from(binaries)
    }

    for (const prefix of this.allowedCommandPrefixes) {
      const parts = prefix.trim().split(/\s+/)
      const primary = parts[0]
      if (!primary) continue
      add(primary)
      if (packageManagers.has(primary.toLowerCase())) {
        allowsPackageManager = true
        addCompanionBinaries()
      }
    }

    // Package managers can invoke arbitrary workspace toolchains (vite, esbuild, node-gyp, etc.).
    // Granting npm/pnpm/yarn/bun should therefore permit shell subprocesses broadly.
    if (allowsPackageManager) add('*')

    return Array.from(binaries)
  }

  checkPathAccess(pathStr: string, mode: 'read' | 'write'): { allowed: boolean; error?: string } {
    const list = mode === 'read' ? this.allowedAutoReadPrefixes : this.allowedAutoWritePrefixes
    const denied = mode === 'read' ? this.deniedAutoReadPrefixes : this.deniedAutoWritePrefixes
    
    if (list.length === 0 && denied.length === 0) return { allowed: true }

    const p = pathStr.trim().replace(/\\/g, '/')

    // Check denials first
    for (const prefix of denied) {
      if (p.startsWith(prefix)) {
        return { allowed: false, error: `Access denied by policy (blocked prefix: ${prefix})` }
      }
    }

    // Then check allows
    if (list.length === 0) return { allowed: true } // Default to allow if no explicit allows
    for (const prefix of list) {
      if (p.startsWith(prefix)) return { allowed: true }
    }

    return { allowed: false, error: `Access denied by policy (path not in allowed prefixes)` }
  }
}
