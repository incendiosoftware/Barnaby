#!/usr/bin/env node
/**
 * Sync build/icon.ico to public/favicon.ico so the BrowserWindow and packaged
 * app use the same icon. electron-builder reads build/icon.ico for the .exe;
 * the runtime uses public/favicon.ico (copied to dist by Vite).
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const src = path.join(root, 'build', 'icon.ico')
const dest = path.join(root, 'public', 'favicon.ico')

if (!fs.existsSync(src)) {
  console.warn('[sync-icon] build/icon.ico not found, skipping sync')
  process.exit(0)
}

fs.copyFileSync(src, dest)
console.log('[sync-icon] Copied build/icon.ico → public/favicon.ico')
