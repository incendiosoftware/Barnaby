import fs from 'node:fs'
import path from 'node:path'

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

    // Extract binary names from command prefixes to allow execution
    const allowedBinaries = new Set<string>()
    if (this.allowedCommandPrefixes.length === 0) {
      // If the user specified file rules but NO command rules,
      // we can't easily "Allow All Shells" in cli.json safely.
      // We will default to allowing common build tools if the list is empty but other rules exist.
      allowedBinaries.add('Shell(npm)')
      allowedBinaries.add('Shell(node)')
      allowedBinaries.add('Shell(git)')
    } else {
      for (const prefix of this.allowedCommandPrefixes) {
        const parts = prefix.trim().split(/\s+/)
        if (parts[0]) allowedBinaries.add(`Shell(${parts[0]})`)
      }
    }

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
        allow: [...Array.from(allowedBinaries), ...readRules, ...writeRules],
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

  checkPathAccess(pathStr: string, mode: 'read' | 'write'): { allowed: boolean; error?: string } {
    const list = mode === 'read' ? this.allowedAutoReadPrefixes : this.allowedAutoWritePrefixes
    const denied = mode === 'read' ? this.deniedAutoReadPrefixes : this.deniedAutoWritePrefixes
    
    if (list.length === 0 && denied.length === 0) return { allowed: true }

    const p = pathStr.trim().replace(/\/g, '/')

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
