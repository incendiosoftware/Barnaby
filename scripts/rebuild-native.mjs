#!/usr/bin/env node
/**
 * Best-effort rebuild of native Node modules (node-pty) for Electron.
 * Runs as part of postinstall. Fails silently if build tools are missing.
 *
 * Requirements for a successful rebuild:
 *   - Python 3.x on PATH
 *   - C++ build tools (Visual Studio on Windows, Xcode CLT on macOS, gcc on Linux)
 *
 * If these are missing, node-pty's N-API prebuilds may still work at runtime.
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const nodePtyDir = join(root, 'node_modules', 'node-pty')
if (!existsSync(nodePtyDir)) {
  // node-pty not installed (optional dep) — nothing to do
  process.exit(0)
}

const electronRebuild = join(root, 'node_modules', '.bin', 'electron-rebuild')
if (!existsSync(electronRebuild) && !existsSync(electronRebuild + '.cmd')) {
  process.exit(0)
}

try {
  console.log('[postinstall] Rebuilding native modules for Electron...')
  execSync(`"${electronRebuild}" -m "${nodePtyDir}"`, {
    cwd: root,
    stdio: 'inherit',
    timeout: 120_000,
  })
  console.log('[postinstall] Native modules rebuilt successfully.')
} catch {
  console.log(
    '[postinstall] Native module rebuild skipped (missing Python or C++ build tools).\n' +
    '             The built-in terminal may not work. To fix:\n' +
    '               1. Install Python 3: https://www.python.org/downloads/\n' +
    '               2. Install C++ build tools (Visual Studio or `npm install -g windows-build-tools`)\n' +
    '               3. Run: npx electron-rebuild'
  )
}
