#!/usr/bin/env node
/**
 * Creates a Start menu shortcut for Barnaby on Windows (global install only).
 * Fixes: (1) App not findable in Windows search (2) Taskbar pinning shows Electron.
 * Tip: Pin the "Barnaby" shortcut from Start menu to taskbar for correct icon.
 */
import { platform } from 'node:os'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

function main() {
  if (platform() !== 'win32') return
  const force = process.argv.includes('--force')
  if (!force && process.env.npm_config_global !== 'true') return

  const __dirname = dirname(fileURLToPath(import.meta.url))
  const pkgRoot = join(__dirname, '..')

  // Use node + our script directly (barnaby.cmd may not exist yet when postinstall runs)
  const barnabyScript = join(pkgRoot, 'bin', 'barnaby.cjs')
  if (!existsSync(barnabyScript)) return
  const nodeExe = process.execPath

  // Prefer .ico for Windows shortcuts (PNG often fails)
  const iconPath = [
    join(pkgRoot, 'build', 'icon.ico'),
    join(pkgRoot, 'dist', 'favicon.ico'),
    join(pkgRoot, 'public', 'favicon.ico'),
    join(pkgRoot, 'dist', 'appicon.png'),
    join(pkgRoot, 'public', 'appicon.png')
  ].find(existsSync)
  const startMenuDir = join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  const shortcutPath = join(startMenuDir, 'Barnaby.lnk')

  const ps = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')
$Shortcut.TargetPath = '${nodeExe.replace(/'/g, "''")}'
$Shortcut.Arguments = '${barnabyScript.replace(/'/g, "''")}'
$Shortcut.WorkingDirectory = '${(process.env.USERPROFILE || '').replace(/'/g, "''")}'
$Shortcut.Description = 'Barnaby - AI agent IDE'
${iconPath ? `if (Test-Path '${iconPath.replace(/'/g, "''")}') { $Shortcut.IconLocation = '${iconPath.replace(/'/g, "''")},0' }` : ''}
$Shortcut.Save()
  `
  try {
    const tmp = join(process.env.TEMP || '', 'barnaby-shortcut.ps1')
    writeFileSync(tmp, ps.trim(), 'utf8')
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmp}"`, { stdio: 'pipe' })
    console.log('[Barnaby] Start menu shortcut created. Pin it to taskbar for the correct icon.')
  } catch {
  // Silent fail - shortcut is optional
}
}

main()
