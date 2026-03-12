import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJsonPath = path.join(root, 'package.json')
const packageLockPath = path.join(root, 'package-lock.json')

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
const packageJsonVersion = typeof packageJson.version === 'string' ? packageJson.version.trim() : ''

if (!packageJsonVersion) {
  console.error('[release] package.json version is missing.')
  process.exit(1)
}

if (!fs.existsSync(packageLockPath)) {
  console.error('[release] package-lock.json is missing.')
  process.exit(1)
}

const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'))
const packageLockVersion = typeof packageLock.version === 'string' ? packageLock.version.trim() : ''
const rootPackageVersion =
  packageLock.packages && packageLock.packages[''] && typeof packageLock.packages[''].version === 'string'
    ? packageLock.packages[''].version.trim()
    : ''

if (packageLockVersion !== packageJsonVersion || rootPackageVersion !== packageJsonVersion) {
  console.error(
    `[release] Version mismatch detected. package.json=${packageJsonVersion}, package-lock.json=${packageLockVersion || '(missing)'}, package-lock packages[\"\"].version=${rootPackageVersion || '(missing)'}`,
  )
  process.exit(1)
}

console.log(`[release] Version files aligned at ${packageJsonVersion}`)
