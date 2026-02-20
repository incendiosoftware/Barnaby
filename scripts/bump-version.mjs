import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJsonPath = path.join(root, 'package.json')
const packageLockPath = path.join(root, 'package-lock.json')

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

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
const currentVersion = packageJson.version
const nextVersion = bumpPatch(currentVersion)
packageJson.version = nextVersion
fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')

if (fs.existsSync(packageLockPath)) {
  const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'))
  if (typeof packageLock.version === 'string') packageLock.version = nextVersion
  if (packageLock.packages && packageLock.packages[''] && typeof packageLock.packages[''].version === 'string') {
    packageLock.packages[''].version = nextVersion
  }
  fs.writeFileSync(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`, 'utf8')
}

console.log(`Version bumped: ${currentVersion} -> ${nextVersion}`)
