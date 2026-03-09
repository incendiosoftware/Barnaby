#!/usr/bin/env node
/**
 * Apply build/icon.ico to built Windows executables using rcedit.
 * electron-builder with signAndEditExecutable:false skips icon embedding;
 * this script patches the exe(s) after build so the custom icon appears.
 */
import fs from 'node:fs'
import path from 'node:path'
import { rcedit } from 'rcedit'

const root = process.cwd()
const iconPath = path.join(root, 'build', 'icon.ico')

if (!fs.existsSync(iconPath)) {
  console.warn('[apply-exe-icon] build/icon.ico not found, skipping')
  process.exit(0)
}

// Read version from package.json
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = pkg.version
const releaseDir = path.join(root, 'release', version)

if (!fs.existsSync(releaseDir)) {
  console.warn('[apply-exe-icon] release dir not found:', releaseDir)
  process.exit(0)
}

const targets = [
  path.join(releaseDir, 'win-unpacked', 'Barnaby.exe'),
  path.join(releaseDir, `Barnaby_${version}_portable.exe`),
  path.join(releaseDir, `Barnaby_${version}_setup.exe`),
]

let patched = 0
for (const exePath of targets) {
  if (fs.existsSync(exePath)) {
    try {
      await rcedit(exePath, { icon: iconPath })
      console.log('[apply-exe-icon] Applied icon to', path.relative(root, exePath))
      patched++
    } catch (err) {
      console.error('[apply-exe-icon] Failed to patch', exePath, err.message)
    }
  }
}

if (patched === 0) {
  console.warn('[apply-exe-icon] No executables found to patch')
}
