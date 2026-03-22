import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

export function getReleaseVersion() {
  const packagePaths = [
    path.join(process.env.APP_ROOT || '', 'package.json'),
    path.join(app.getAppPath(), 'package.json'),
  ]
  for (const pkgPath of packagePaths) {
    try {
      if (fs.existsSync(pkgPath)) {
        const raw = fs.readFileSync(pkgPath, 'utf8')
        const parsed = JSON.parse(raw) as { version?: unknown }
        if (typeof parsed.version === 'string' && parsed.version.trim()) return parsed.version.trim()
      }
    } catch {
    }
  }
  return app.getVersion()
}
