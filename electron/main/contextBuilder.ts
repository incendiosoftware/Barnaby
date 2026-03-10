/**
 * Phase 3: Automatic context enrichment.
 *
 * Detects workspace characteristics (languages, frameworks, package manager,
 * test framework, monorepo structure) and returns a compact summary string
 * suitable for injection into the dynamic system prompt.
 *
 * All detection is synchronous and fast — reads only top-level config files.
 */

import fs from 'node:fs'
import path from 'node:path'

export interface WorkspaceProfile {
  languages: string[]
  frameworks: string[]
  packageManager: string | null
  testFramework: string | null
  buildTool: string | null
  monorepo: boolean
  workspacePackages: string[]
}

interface DetectorResult {
  languages?: string[]
  frameworks?: string[]
  packageManager?: string
  testFramework?: string
  buildTool?: string
}

function fileExists(root: string, name: string): boolean {
  try {
    return fs.statSync(path.join(root, name)).isFile()
  } catch {
    return false
  }
}

function dirExists(root: string, name: string): boolean {
  try {
    return fs.statSync(path.join(root, name)).isDirectory()
  } catch {
    return false
  }
}

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function detectNode(root: string): DetectorResult | null {
  const pkgPath = path.join(root, 'package.json')
  const pkg = readJsonSafe(pkgPath)
  if (!pkg) return null

  const result: DetectorResult = { languages: [], frameworks: [] }

  // Language
  const allDeps = {
    ...(pkg.dependencies as Record<string, string> ?? {}),
    ...(pkg.devDependencies as Record<string, string> ?? {}),
  }

  if (allDeps.typescript || fileExists(root, 'tsconfig.json')) {
    result.languages!.push('TypeScript')
  } else {
    result.languages!.push('JavaScript')
  }

  // Frameworks
  if (allDeps.react || allDeps['react-dom']) result.frameworks!.push('React')
  if (allDeps.vue) result.frameworks!.push('Vue')
  if (allDeps.svelte) result.frameworks!.push('Svelte')
  if (allDeps.next) result.frameworks!.push('Next.js')
  if (allDeps.nuxt) result.frameworks!.push('Nuxt')
  if (allDeps.express) result.frameworks!.push('Express')
  if (allDeps.fastify) result.frameworks!.push('Fastify')
  if (allDeps.nestjs || allDeps['@nestjs/core']) result.frameworks!.push('NestJS')
  if (allDeps.electron) result.frameworks!.push('Electron')
  if (allDeps['angular'] || allDeps['@angular/core']) result.frameworks!.push('Angular')

  // Package manager
  if (fileExists(root, 'bun.lockb') || fileExists(root, 'bun.lock')) {
    result.packageManager = 'bun'
  } else if (fileExists(root, 'pnpm-lock.yaml')) {
    result.packageManager = 'pnpm'
  } else if (fileExists(root, 'yarn.lock')) {
    result.packageManager = 'yarn'
  } else if (fileExists(root, 'package-lock.json')) {
    result.packageManager = 'npm'
  }

  // Test framework
  if (allDeps.vitest) result.testFramework = 'vitest'
  else if (allDeps.jest) result.testFramework = 'jest'
  else if (allDeps.mocha) result.testFramework = 'mocha'
  else if (allDeps['@playwright/test']) result.testFramework = 'playwright'
  else if (allDeps.cypress) result.testFramework = 'cypress'

  // Build tool
  if (allDeps.vite) result.buildTool = 'vite'
  else if (allDeps.webpack) result.buildTool = 'webpack'
  else if (allDeps.esbuild) result.buildTool = 'esbuild'
  else if (allDeps.rollup) result.buildTool = 'rollup'
  else if (allDeps.parcel) result.buildTool = 'parcel'
  else if (allDeps.turbopack || allDeps.turbo) result.buildTool = 'turbo'

  return result
}

function detectPython(root: string): DetectorResult | null {
  const hasPyproject = fileExists(root, 'pyproject.toml')
  const hasRequirements = fileExists(root, 'requirements.txt')
  const hasSetupPy = fileExists(root, 'setup.py')
  const hasPipfile = fileExists(root, 'Pipfile')

  if (!hasPyproject && !hasRequirements && !hasSetupPy && !hasPipfile) return null

  const result: DetectorResult = { languages: ['Python'], frameworks: [] }

  if (hasPyproject) result.packageManager = 'uv/pip'
  else if (hasPipfile) result.packageManager = 'pipenv'

  // Simple framework detection via directory structure
  if (dirExists(root, 'manage.py') || fileExists(root, 'manage.py')) result.frameworks!.push('Django')
  if (fileExists(root, 'app.py') || dirExists(root, 'flask')) result.frameworks!.push('Flask')

  if (fileExists(root, 'pytest.ini') || fileExists(root, 'conftest.py')) result.testFramework = 'pytest'

  return result
}

function detectRust(root: string): DetectorResult | null {
  if (!fileExists(root, 'Cargo.toml')) return null
  return {
    languages: ['Rust'],
    packageManager: 'cargo',
    buildTool: 'cargo',
  }
}

function detectGo(root: string): DetectorResult | null {
  if (!fileExists(root, 'go.mod')) return null
  return {
    languages: ['Go'],
    packageManager: 'go modules',
    buildTool: 'go',
  }
}

function detectJava(root: string): DetectorResult | null {
  if (fileExists(root, 'pom.xml')) {
    return { languages: ['Java'], buildTool: 'maven', packageManager: 'maven' }
  }
  if (fileExists(root, 'build.gradle') || fileExists(root, 'build.gradle.kts')) {
    return { languages: ['Java/Kotlin'], buildTool: 'gradle', packageManager: 'gradle' }
  }
  return null
}

function detectDotnet(root: string): DetectorResult | null {
  try {
    const entries = fs.readdirSync(root)
    const hasCsproj = entries.some(e => e.endsWith('.csproj'))
    const hasFsproj = entries.some(e => e.endsWith('.fsproj'))
    const hasSln = entries.some(e => e.endsWith('.sln'))
    if (!hasCsproj && !hasFsproj && !hasSln) return null
    return {
      languages: [hasFsproj ? 'F#' : 'C#'],
      buildTool: 'dotnet',
      packageManager: 'nuget',
    }
  } catch {
    return null
  }
}

function detectMonorepo(root: string): { monorepo: boolean; packages: string[] } {
  // pnpm workspaces
  if (fileExists(root, 'pnpm-workspace.yaml')) {
    return { monorepo: true, packages: listTopLevelSubdirs(root, ['packages', 'apps', 'libs']) }
  }

  // npm/yarn workspaces in package.json
  const pkg = readJsonSafe(path.join(root, 'package.json'))
  if (pkg && Array.isArray(pkg.workspaces)) {
    return { monorepo: true, packages: listTopLevelSubdirs(root, ['packages', 'apps', 'libs']) }
  }
  if (pkg && typeof pkg.workspaces === 'object' && Array.isArray((pkg.workspaces as { packages?: string[] }).packages)) {
    return { monorepo: true, packages: listTopLevelSubdirs(root, ['packages', 'apps', 'libs']) }
  }

  // Lerna
  if (fileExists(root, 'lerna.json')) {
    return { monorepo: true, packages: listTopLevelSubdirs(root, ['packages']) }
  }

  // Nx
  if (fileExists(root, 'nx.json')) {
    return { monorepo: true, packages: listTopLevelSubdirs(root, ['packages', 'apps', 'libs']) }
  }

  // Cargo workspace
  if (fileExists(root, 'Cargo.toml')) {
    try {
      const raw = fs.readFileSync(path.join(root, 'Cargo.toml'), 'utf8')
      if (raw.includes('[workspace]')) {
        return { monorepo: true, packages: listTopLevelSubdirs(root, ['crates', 'packages']) }
      }
    } catch { /* ignore */ }
  }

  return { monorepo: false, packages: [] }
}

function listTopLevelSubdirs(root: string, candidates: string[]): string[] {
  const result: string[] = []
  for (const dir of candidates) {
    const full = path.join(root, dir)
    try {
      const entries = fs.readdirSync(full, { withFileTypes: true })
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith('.')) {
          result.push(`${dir}/${e.name}`)
        }
      }
    } catch { /* dir doesn't exist */ }
  }
  return result
}

/**
 * Detect workspace characteristics. Returns a profile describing languages,
 * frameworks, tooling, and monorepo status.
 */
export function detectWorkspaceProfile(root: string): WorkspaceProfile {
  const detectors = [detectNode, detectPython, detectRust, detectGo, detectJava, detectDotnet]

  const languages = new Set<string>()
  const frameworks = new Set<string>()
  let packageManager: string | null = null
  let testFramework: string | null = null
  let buildTool: string | null = null

  for (const detect of detectors) {
    const result = detect(root)
    if (!result) continue
    result.languages?.forEach(l => languages.add(l))
    result.frameworks?.forEach(f => frameworks.add(f))
    if (result.packageManager && !packageManager) packageManager = result.packageManager
    if (result.testFramework && !testFramework) testFramework = result.testFramework
    if (result.buildTool && !buildTool) buildTool = result.buildTool
  }

  const mono = detectMonorepo(root)

  return {
    languages: Array.from(languages),
    frameworks: Array.from(frameworks),
    packageManager,
    testFramework,
    buildTool,
    monorepo: mono.monorepo,
    workspacePackages: mono.packages,
  }
}

/**
 * Build a compact summary string from a workspace profile,
 * suitable for injection into the dynamic system prompt.
 */
export function formatWorkspaceProfile(profile: WorkspaceProfile): string {
  const lines: string[] = []

  if (profile.languages.length) {
    lines.push(`Languages: ${profile.languages.join(', ')}`)
  }
  if (profile.frameworks.length) {
    lines.push(`Frameworks: ${profile.frameworks.join(', ')}`)
  }
  if (profile.packageManager) {
    lines.push(`Package manager: ${profile.packageManager}`)
  }
  if (profile.buildTool) {
    lines.push(`Build tool: ${profile.buildTool}`)
  }
  if (profile.testFramework) {
    lines.push(`Test framework: ${profile.testFramework}`)
  }
  if (profile.monorepo) {
    lines.push(`Monorepo: yes${profile.workspacePackages.length ? ` (${profile.workspacePackages.join(', ')})` : ''}`)
  }

  return lines.join('\n')
}

/**
 * One-call convenience: detect + format.
 * Returns empty string if nothing detected.
 */
export function buildWorkspaceContextSummary(root: string): string {
  const profile = detectWorkspaceProfile(root)
  return formatWorkspaceProfile(profile)
}
