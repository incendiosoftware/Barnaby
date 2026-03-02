import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { writeCursorCliConfig } from '../electron/main/permissions'

describe('writeCursorCliConfig', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-cli-config-test-'))
  })

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true })
    } catch {
      /* ignore */
    }
  })

  function readCliConfig(): unknown {
    const configPath = path.join(tempDir, '.cursor', 'cli.json')
    const raw = fs.readFileSync(configPath, 'utf8')
    return JSON.parse(raw)
  }

  it('writes sandbox mode disabled when cursorAllowBuilds is true', () => {
    writeCursorCliConfig({
      cwd: tempDir,
      permissionMode: 'verify-first',
      allowedCommandPrefixes: ['npm'],
      cursorAllowBuilds: true,
    })

    const config = readCliConfig() as Record<string, unknown>
    expect(config.sandbox).toEqual({ mode: 'disabled' })
    expect(config.permissions).toBeDefined()
    expect((config.permissions as Record<string, unknown>).allow).toBeDefined()
  })

  it('does not write when permissionMode is verify-first and cursorAllowBuilds is false', () => {
    writeCursorCliConfig({
      cwd: tempDir,
      permissionMode: 'verify-first',
      allowedCommandPrefixes: ['npm'],
      cursorAllowBuilds: false,
    })

    const configPath = path.join(tempDir, '.cursor', 'cli.json')
    expect(fs.existsSync(configPath)).toBe(false)
  })

  it('writes permissive config with proceed-always and empty allowlists', () => {
    writeCursorCliConfig({
      cwd: tempDir,
      permissionMode: 'proceed-always',
      allowedCommandPrefixes: [],
      allowedAutoReadPrefixes: [],
      allowedAutoWritePrefixes: [],
      deniedAutoReadPrefixes: [],
      deniedAutoWritePrefixes: [],
      cursorAllowBuilds: false,
    })

    const config = readCliConfig() as Record<string, unknown>
    const allow = (config.permissions as Record<string, unknown>).allow as string[]
    expect(allow).toContain('Shell(*)')
    expect(allow).toContain('Read(**)')
    expect(allow).toContain('Write(**)')
  })

  it('includes Shell(npm) and Shell(*) when npm is in allowedCommandPrefixes', () => {
    writeCursorCliConfig({
      cwd: tempDir,
      permissionMode: 'proceed-always',
      allowedCommandPrefixes: ['npm', 'npx'],
      cursorAllowBuilds: false,
    })

    const config = readCliConfig() as Record<string, unknown>
    const allow = (config.permissions as Record<string, unknown>).allow as string[]
    expect(allow.some((a) => a === 'Shell(npm)')).toBe(true)
    expect(allow.some((a) => a === 'Shell(*)')).toBe(true)
  })
})
