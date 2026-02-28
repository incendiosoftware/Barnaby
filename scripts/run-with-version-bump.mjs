import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const command = process.argv.slice(2).join(' ').trim()
if (!command) {
  console.error('Usage: node scripts/run-with-version-bump.mjs "<command>"')
  process.exit(1)
}

const root = process.cwd()
const packageJsonPath = path.join(root, 'package.json')
const packageLockPath = path.join(root, 'package-lock.json')

const originalPackageJsonText = fs.readFileSync(packageJsonPath, 'utf8')
const hadPackageLock = fs.existsSync(packageLockPath)
const originalPackageLockText = hadPackageLock ? fs.readFileSync(packageLockPath, 'utf8') : null

function bumpPatch(version) {
  const parts = String(version).trim().split('.')
  if (parts.length !== 3) {
    throw new Error(`Expected semantic version x.y.z, got "${version}"`)
  }
  const [major, minor, patch] = parts.map((p) => Number(p))
  if ([major, minor, patch].some((n) => Number.isNaN(n))) {
    throw new Error(`Expected numeric semantic version, got "${version}"`)
  }
  return `${major}.${minor}.${patch + 1}`
}

function restoreVersionFiles() {
  fs.writeFileSync(packageJsonPath, originalPackageJsonText, 'utf8')
  if (originalPackageLockText === null) {
    if (fs.existsSync(packageLockPath)) fs.rmSync(packageLockPath)
    return
  }
  fs.writeFileSync(packageLockPath, originalPackageLockText, 'utf8')
}

const packageJson = JSON.parse(originalPackageJsonText)
const currentVersion = packageJson.version
const nextVersion = bumpPatch(currentVersion)
packageJson.version = nextVersion
fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')

if (hadPackageLock) {
  const packageLock = JSON.parse(originalPackageLockText)
  if (typeof packageLock.version === 'string') packageLock.version = nextVersion
  if (packageLock.packages && packageLock.packages[''] && typeof packageLock.packages[''].version === 'string') {
    packageLock.packages[''].version = nextVersion
  }
  fs.writeFileSync(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`, 'utf8')
}

console.log(`Version bumped: ${currentVersion} -> ${nextVersion}`)

const child = spawn(command, {
  cwd: root,
  env: process.env,
  shell: true,
  stdio: 'inherit'
})

child.on('error', (error) => {
  console.error(`Failed to start command: ${error.message}`)
  restoreVersionFiles()
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (code === 0) process.exit(0)

  restoreVersionFiles()
  if (signal) {
    console.error(`Command terminated by signal: ${signal}`)
  } else {
    console.error(`Command failed with exit code ${code}`)
  }
  process.exit(code ?? 1)
})
