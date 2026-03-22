import path from 'node:path'
import fs from 'node:fs'
import { PROVIDER_SECRETS_FILENAME } from './constants'
import { appendRuntimeLog, getAppStorageDirPath } from './logger'

export function getProviderSecretsPath() {
  return path.join(getAppStorageDirPath(), PROVIDER_SECRETS_FILENAME)
}

export function readProviderSecrets(): Record<string, { apiKey?: string }> {
  const secretsPath = getProviderSecretsPath()
  if (!fs.existsSync(secretsPath)) return {}
  try {
    const raw = fs.readFileSync(secretsPath, 'utf8')
    if (!raw.trim()) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, { apiKey?: string }>
  } catch (err) {
    appendRuntimeLog('read-provider-secrets-failed', String(err), 'warn')
    return {}
  }
}

export function writeProviderSecrets(next: Record<string, { apiKey?: string }>) {
  const secretsPath = getProviderSecretsPath()
  fs.mkdirSync(path.dirname(secretsPath), { recursive: true })
  fs.writeFileSync(secretsPath, JSON.stringify(next, null, 2), 'utf8')
}

export function getProviderApiKey(providerId: string): string {
  const secrets = readProviderSecrets()
  return (secrets[providerId]?.apiKey ?? '').trim()
}

export function setProviderApiKey(providerId: string, apiKey: string) {
  const secrets = readProviderSecrets()
  const key = apiKey.trim()
  if (!key) {
    delete secrets[providerId]
  } else {
    secrets[providerId] = { ...(secrets[providerId] ?? {}), apiKey: key }
  }
  writeProviderSecrets(secrets)
  return { ok: true, hasKey: key.length > 0 }
}

export function importProviderApiKeyFromEnv(providerId: string) {
  const envVarByProvider: Record<string, string> = {
    openrouter: 'OPENROUTER_API_KEY',
    codex: 'OPENAI_API_KEY',
  }
  const envVar = envVarByProvider[providerId]
  if (!envVar) {
    return { ok: false as const, hasKey: false, imported: false, detail: `No environment mapping for provider "${providerId}".` }
  }
  const value = (process.env[envVar] ?? '').trim()
  if (!value) {
    return { ok: false as const, hasKey: false, imported: false, detail: `${envVar} is not set in this process environment.` }
  }
  const saved = setProviderApiKey(providerId, value)
  return { ok: true as const, hasKey: saved.hasKey, imported: true as const, detail: `Imported API key from ${envVar}.` }
}
