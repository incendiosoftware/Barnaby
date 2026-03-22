import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import fs from 'node:fs'

export const execFileAsync = promisify(execFile)

export function getCliSpawnEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  if (process.platform === 'win32') {
    const npmBin = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : ''
    if (npmBin && env.PATH && !env.PATH.includes(npmBin)) {
      env.PATH = `${npmBin}${path.delimiter}${env.PATH}`
    }
  }
  return env
}

export function resolveNpmCliJsEntry(cliName: string): string | null {
  if (process.platform !== 'win32') return null
  const npmBin = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : ''
  if (!npmBin) return null
  const cmdPath = path.join(npmBin, `${cliName}.cmd`)
  if (!fs.existsSync(cmdPath)) return null
  try {
    const cmdContent = fs.readFileSync(cmdPath, 'utf8')
    const match = cmdContent.match(/%dp0%\\([^\s"]+\.js)/i)
    if (match) {
      const jsPath = path.join(npmBin, match[1])
      if (fs.existsSync(jsPath)) return jsPath
    }
  } catch { /* fall through */ }
  return null
}

export function findNodeExeOnPath(): string | null {
  const pathDirs = (process.env.PATH ?? '').split(path.delimiter)
  for (const dir of pathDirs) {
    const candidate = path.join(dir, process.platform === 'win32' ? 'node.exe' : 'node')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

export const CLI_AUTH_CHECK_TIMEOUT_MS = 8_000
export const CLI_MODELS_QUERY_TIMEOUT_MS = 60_000

export function runCliCommand(executable: string, args: string[], timeoutMs = CLI_AUTH_CHECK_TIMEOUT_MS): Promise<{ stdout: string; stderr: string }> {
  const env = getCliSpawnEnv()
  return new Promise((resolve, reject) => {
    const abortController = new AbortController()
    const timer = setTimeout(() => {
      abortController.abort()
      reject(new Error(`CLI check timed out after ${timeoutMs / 1000}s. The CLI may be slow to start or hung.`))
    }, timeoutMs)

    const finish = (err: Error | null, result?: { stdout: string; stderr: string }) => {
      clearTimeout(timer)
      if (err) reject(err)
      else resolve(result!)
    }

    if (process.platform === 'win32') {
      const jsEntry = resolveNpmCliJsEntry(executable)
      const nodeExe = jsEntry ? findNodeExeOnPath() : null
      if (jsEntry && nodeExe) {
        execFileAsync(nodeExe, [jsEntry, ...args], { windowsHide: true, maxBuffer: 1024 * 1024, env, signal: abortController.signal })
          .then((res) => finish(null, res))
          .catch(finish)
        return
      }
      const fullCmd = [executable, ...args].map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')
      execFileAsync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', fullCmd], { windowsHide: true, maxBuffer: 1024 * 1024, env, signal: abortController.signal })
        .then((res) => finish(null, res))
        .catch(finish)
      return
    }
    execFileAsync(executable, args, { windowsHide: true, maxBuffer: 1024 * 1024, env, signal: abortController.signal })
      .then((res) => finish(null, res))
      .catch(finish)
  })
}

export async function isCliInstalled(executable: string): Promise<boolean> {
  try {
    await runCliCommand(executable, ['--version'])
    return true
  } catch {
    return false
  }
}
