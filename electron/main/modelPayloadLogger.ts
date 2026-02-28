import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const APP_STORAGE_DIRNAME = '.storage'
const RUNTIME_LOG_FILENAME = 'runtime.log'
const DEBUG_LOG_FILENAME = 'debug.log'
const DEFAULT_PREVIEW_CHARS = 1200

type ModelPayloadAudit = {
  provider: string
  endpoint: string
  model?: string
  serializedPayload: string
  meta?: Record<string, unknown>
}

function isTruthyEnv(name: string) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

function isModelPayloadLogEnabled() {
  if (isTruthyEnv('BARNABY_MODEL_PAYLOAD_LOG')) return true
  try {
    const p = path.join(app.getPath('userData'), '.storage', 'app-state.json')
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
      const state = parsed?.state || parsed
      if (state?.applicationSettings?.enableMessageSizeLog === true) return true
    }
  } catch { }
  return false
}

function isModelPayloadContentEnabled() {
  return isTruthyEnv('BARNABY_MODEL_PAYLOAD_LOG_CONTENT')
}

function getStorageDirPath() {
  return path.join(app.getPath('userData'), APP_STORAGE_DIRNAME)
}

function getRuntimeLogPath() {
  return path.join(getStorageDirPath(), RUNTIME_LOG_FILENAME)
}

function getDebugLogPath() {
  return path.join(getStorageDirPath(), DEBUG_LOG_FILENAME)
}

function redactLargeBinaryLikeSegments(input: string) {
  // Redact inline image/audio payloads so previews stay readable.
  return input.replace(/data:[^;\s]+;base64,[A-Za-z0-9+/=]+/g, '[data-url-redacted]')
}

function buildPreview(serializedPayload: string) {
  if (!isModelPayloadContentEnabled()) return undefined
  const preview = redactLargeBinaryLikeSegments(serializedPayload)
  const maxChars = Number(process.env.BARNABY_MODEL_PAYLOAD_PREVIEW_CHARS ?? DEFAULT_PREVIEW_CHARS)
  const limit = Number.isFinite(maxChars) && maxChars > 0 ? Math.floor(maxChars) : DEFAULT_PREVIEW_CHARS
  return preview.length <= limit ? preview : `${preview.slice(0, limit)}...`
}

function appendDebugLine(line: string) {
  const logPath = getDebugLogPath()
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  const ts = new Date().toISOString()
  fs.appendFileSync(logPath, `[${ts}] ${line}\n`, 'utf8')
}

function appendRuntimeEntry(entry: unknown) {
  const logPath = getRuntimeLogPath()
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8')
}

export function logModelPayloadAudit(input: ModelPayloadAudit) {
  if (!isModelPayloadLogEnabled()) return

  try {
    const payloadBytes = Buffer.byteLength(input.serializedPayload, 'utf8')
    const payloadChars = input.serializedPayload.length
    const estimatedTokens = Math.max(1, Math.round(payloadBytes / 4))
    const preview = buildPreview(input.serializedPayload)
    const entry = {
      at: new Date().toISOString(),
      level: 'info',
      pid: process.pid,
      event: 'model-payload',
      detail: {
        provider: input.provider,
        endpoint: input.endpoint,
        model: input.model ?? null,
        payloadBytes,
        payloadChars,
        estimatedTokens,
        ...(input.meta ?? {}),
        ...(preview != null ? { preview } : {}),
      },
    }
    appendRuntimeEntry(entry)
    appendDebugLine(
      `[MODEL_PAYLOAD] provider=${input.provider} endpoint=${input.endpoint} model=${input.model ?? 'n/a'} bytes=${payloadBytes} chars=${payloadChars} estTokens=${estimatedTokens}`,
    )
  } catch {
    // Best-effort diagnostics only.
  }
}

