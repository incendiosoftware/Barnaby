/**
 * Orchestrator storage – license key and settings.
 * Used by main process and plugin host.
 */
import path from 'node:path'
import fs from 'node:fs'


export function readOrchestratorSecrets(getAppStorageDir: () => string): { licenseKey?: string } {
  const secretsPath = path.join(getAppStorageDir(), 'orchestrator-secrets.json')
  if (!fs.existsSync(secretsPath)) return {}
  try {
    const raw = fs.readFileSync(secretsPath, 'utf8')
    if (!raw.trim()) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const obj = parsed as Record<string, unknown>
    return { licenseKey: typeof obj.licenseKey === 'string' ? obj.licenseKey : undefined }
  } catch {
    return {}
  }
}

export function writeOrchestratorSecrets(getAppStorageDir: () => string, next: { licenseKey?: string }) {
  const storageDir = getAppStorageDir()
  const secretsPath = path.join(storageDir, 'orchestrator-secrets.json')
  fs.mkdirSync(path.dirname(secretsPath), { recursive: true })
  fs.writeFileSync(secretsPath, JSON.stringify(next, null, 2), 'utf8')
}

export type OrchestratorSettingsData = {
  orchestratorModel?: string
  workerProvider?: string
  workerModel?: string
  maxParallelPanels?: number
  maxTaskAttempts?: number
}

export function readOrchestratorSettings(getAppStorageDir: () => string): OrchestratorSettingsData {
  const settingsPath = path.join(getAppStorageDir(), 'orchestrator-settings.json')
  if (!fs.existsSync(settingsPath)) return {}
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8')
    if (!raw.trim()) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as OrchestratorSettingsData
  } catch {
    return {}
  }
}

export function writeOrchestratorSettings(getAppStorageDir: () => string, data: OrchestratorSettingsData) {
  const storageDir = getAppStorageDir()
  const settingsPath = path.join(storageDir, 'orchestrator-settings.json')
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf8')
}
