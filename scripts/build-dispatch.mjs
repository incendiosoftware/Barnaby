#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const args = process.argv
  .slice(2)
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean)

let targetScript = ''
if (args.length === 0) {
  targetScript = 'build:portable:raw'
} else if (args.length === 1 && args[0] === 'raw') {
  targetScript = 'build:portable:raw'
} else if (args.length === 1 && (args[0] === 'bump' || args[0] === 'versioned')) {
  targetScript = 'build:portable'
} else {
  console.error('[build] Invalid arguments.')
  console.error('[build] Allowed usage:')
  console.error('  npm run build')
  console.error('  npm run build raw')
  console.error('  npm run build bump')
  console.error('  npm run build versioned')
  console.error('  npm run build:raw')
  console.error('  npm run build:dist:raw')
  console.error('  npm run build:portable:raw')
  process.exit(1)
}

const result = spawnSync(`npm run ${targetScript}`, {
  stdio: 'inherit',
  env: process.env,
  shell: true,
})

if (result.error) {
  console.error(`[build] Failed to run "${targetScript}": ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
