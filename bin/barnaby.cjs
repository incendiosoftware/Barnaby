#!/usr/bin/env node
'use strict'

const { spawn } = require('child_process')
const path = require('path')

const pkgRoot = path.join(__dirname, '..')
const mainPath = path.join(pkgRoot, 'dist-electron', 'main', 'index.js')

const electron = require('electron')
// stdio: 'ignore' when no TTY (e.g. Start menu shortcut) prevents a console window.
// stdio: 'inherit' when run from terminal keeps plugin logs visible for debugging.
const child = spawn(electron, [mainPath], {
  stdio: process.stdout?.isTTY ? 'inherit' : 'ignore',
  cwd: pkgRoot,
  env: { ...process.env }
})

child.on('exit', (code) => process.exit(code ?? 0))
