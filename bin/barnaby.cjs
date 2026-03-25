#!/usr/bin/env node
'use strict'

const { spawn, execFileSync } = require('child_process')
const path = require('path')

const pkgRoot = path.join(__dirname, '..')
const mainPath = path.join(pkgRoot, 'dist-electron', 'main', 'index.js')

let electron
try {
  electron = require('electron')
} catch (_) {
  // Electron not bundled (e.g. global npm install) — try finding it on PATH
  try {
    const which = process.platform === 'win32' ? 'where' : 'which'
    electron = execFileSync(which, ['electron'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0]
  } catch (_) {
    console.error(
      'Barnaby requires Electron but it was not found.\n' +
      'Install it globally:  npm i -g electron\n' +
      'Then run:  barnaby'
    )
    process.exit(1)
  }
}

const child = spawn(electron, [mainPath], {
  stdio: process.stdout?.isTTY ? 'inherit' : 'ignore',
  cwd: pkgRoot,
  env: { ...process.env }
})

child.on('exit', (code) => process.exit(code ?? 0))
