import { spawn } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { errorMessage } from './logger'
import { getProviderApiKey } from './providerSecrets'
import { getCliSpawnEnv, resolveNpmCliJsEntry, findNodeExeOnPath } from './cliUtils'
import { getProviderApiKeyOrEnv } from './providerManager'
import type { ModelsByProvider } from './types'

export const MODEL_PING_TIMEOUT_MS = 30_000
export const MODEL_PING_PROMPT = 'Reply with only the word OK.'

export const FALLBACK_CLAUDE_MODELS: Array<{ id: string; displayName: string }> = [
  { id: 'claude-opus-4-6', displayName: 'Claude Opus 4.6' },
  { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5' },
  { id: 'claude-sonnet-4-5-20250929', displayName: 'Claude Sonnet 4.5' },
  { id: 'claude-opus-4-5-20251101', displayName: 'Claude Opus 4.5' },
  { id: 'claude-opus-4-1-20250805', displayName: 'Claude Opus 4.1' },
  { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4' },
  { id: 'claude-opus-4-20250514', displayName: 'Claude Opus 4' },
  { id: 'opus', displayName: 'Claude Opus (alias)' },
  { id: 'sonnet', displayName: 'Claude Sonnet (alias)' },
  { id: 'haiku', displayName: 'Claude Haiku (alias)' },
]

export const FALLBACK_GEMINI_MODELS: Array<{ id: string; displayName: string }> = [
  { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
  { id: 'gemini-3-pro-preview', displayName: 'Gemini 3 Pro (Preview)' },
  { id: 'gemini-3-flash-preview', displayName: 'Gemini 3 Flash (Preview)' },
]

export function normalizeGeminiModelForCli(modelId: string): string {
  const map: Record<string, string> = {
    'gemini-1.5-pro': 'pro',
    'gemini-1.5-flash': 'flash',
    'gemini-2.0-flash': 'flash',
    'gemini-3-pro': 'pro',
    'gemini-pro': 'flash',
    'gemini-1.0-pro': 'flash',
  }
  return map[modelId] ?? modelId
}

export function normalizeClaudeModelForCli(modelId: string): string {
  const trimmed = String(modelId ?? '').trim()
  if (!trimmed) return 'sonnet'
  const normalized = trimmed.toLowerCase()
  const aliasMap: Record<string, string> = {
    'claude-sonnet-4-5-20250929': 'sonnet',
    'claude-sonnet-4-6': 'sonnet',
    'claude-opus-4-1-20250805': 'opus',
    'claude-haiku-3-5-20241022': 'haiku',
  }
  return aliasMap[normalized] ?? trimmed
}

export function isClaudeModelNotFoundError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('model') &&
    (lower.includes('not found') || lower.includes('unknown') || lower.includes('invalid'))
  )
}

export function dedupeModels(models: Array<{ id: string; displayName: string }>): Array<{ id: string; displayName: string }> {
  const seen = new Set<string>()
  const out: Array<{ id: string; displayName: string }> = []
  for (const model of models) {
    const id = String(model.id ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      displayName: String(model.displayName ?? '').trim() || id,
    })
  }
  return out
}

export async function pingGeminiModel(modelId: string): Promise<{ ok: boolean; durationMs: number; error?: string }> {
  const start = Date.now()
  const normalized = normalizeGeminiModelForCli(modelId)
  const env = getCliSpawnEnv()
  return new Promise((resolve) => {
    const args = ['-m', normalized, '--yolo', '--output-format', 'stream-json']
    const proc = process.platform === 'win32'
      ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'gemini', ...args], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env } as object)
      : spawn('gemini', args, { stdio: ['pipe', 'pipe', 'pipe'], env })

    const timer = setTimeout(() => {
      try { proc.kill() } catch { /* ignore */ }
      resolve({ ok: false, durationMs: Date.now() - start, error: 'Timed out' })
    }, MODEL_PING_TIMEOUT_MS)

    let resolved = false
    const done = (ok: boolean, error?: string) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      resolve({ ok, durationMs: Date.now() - start, error })
    }

    proc.stdin?.write(MODEL_PING_PROMPT)
    proc.stdin?.end()

    let buf = ''
    proc.stdout?.setEncoding('utf8')
    proc.stdout?.on('data', (chunk: string) => {
      buf += chunk
      for (const line of buf.split('\n')) {
        const t = line.trim()
        if (!t) continue
        try {
          const evt = JSON.parse(t)
          if (evt.type === 'message' && (evt.role === 'assistant' || evt.role === 'model') && typeof evt.content === 'string' && evt.content.trim()) {
            try { proc.kill() } catch { /* ignore */ }
            done(true)
            return
          }
          if (evt.type === 'error') {
            done(false, evt.message ?? 'Model error')
            return
          }
        } catch { /* not JSON, ignore */ }
      }
    })
    proc.on('exit', (code) => done(code === 0, code !== 0 ? `Exit ${code}` : undefined))
    proc.on('error', (err) => done(false, err.message))
  })
}

export async function pingClaudeModel(modelId: string, cwd?: string): Promise<{ ok: boolean; durationMs: number; error?: string }> {
  const start = Date.now()
  const pingCwd = typeof cwd === 'string' && cwd.trim() ? path.resolve(cwd.trim()) : process.cwd()
  const runPingAttempt = async (attemptModelId: string): Promise<{ ok: boolean; error?: string }> => {
    const jsEntry = resolveNpmCliJsEntry('claude')
    const nodeExe = jsEntry ? findNodeExeOnPath() : null
    const env = getCliSpawnEnv()
    return new Promise((resolve) => {
      const args = ['--model', attemptModelId, '--print', '--output-format', 'stream-json', '--input-format', 'stream-json']
      let proc: ReturnType<typeof spawn>
      if (jsEntry && nodeExe) {
        proc = spawn(nodeExe, [jsEntry, ...args], { cwd: pingCwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env } as object)
      } else if (process.platform === 'win32') {
        proc = spawn(
          process.env.ComSpec ?? 'cmd.exe',
          ['/d', '/s', '/c', 'claude', ...args],
          { cwd: pingCwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env } as object,
        )
      } else {
        proc = spawn('claude', args, { cwd: pingCwd, stdio: ['pipe', 'pipe', 'pipe'], env })
      }

      const timer = setTimeout(() => {
        try { proc.kill() } catch { /* ignore */ }
        resolve({ ok: false, error: 'Timed out' })
      }, MODEL_PING_TIMEOUT_MS)

      let resolved = false
      const done = (ok: boolean, error?: string) => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)
        resolve({ ok, error })
      }

      const pingMsg = JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: MODEL_PING_PROMPT }],
        },
      }) + '\n'
      proc.stdin?.write(pingMsg)
      proc.stdin?.end()

      let stdoutBuffer = ''
      let stderrBuffer = ''
      proc.stdout?.setEncoding('utf8')
      proc.stderr?.setEncoding('utf8')
      proc.stderr?.on('data', (chunk: string) => {
        stderrBuffer += chunk
      })
      proc.stdout?.on('data', (chunk: string) => {
        stdoutBuffer += chunk
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() ?? ''
        for (const line of lines) {
          const t = line.trim()
          if (!t) continue
          try {
            const evt = JSON.parse(t)
            if (
              evt.type === 'assistant' ||
              evt.type === 'result' ||
              evt.type === 'content_block_delta' ||
              (evt.type === 'message' && evt.role === 'assistant') ||
              (evt.type === 'message_start' && evt.message?.role === 'assistant')
            ) {
              if (evt.type === 'result' && evt.subtype === 'error') {
                const msg = typeof evt.error === 'string' && evt.error.trim() ? evt.error.trim() : 'Model error'
                done(false, msg)
              } else {
                try { proc.kill() } catch { /* ignore */ }
                done(true)
              }
              return
            }
            if (evt.type === 'error') {
              const msg = typeof evt.message === 'string' && evt.message.trim()
                ? evt.message.trim()
                : 'Model error'
              done(false, msg)
              return
            }
          } catch { /* not JSON */ }
        }
      })
      proc.on('exit', (code) => {
        if (code === 0) {
          done(true)
          return
        }
        const err = stderrBuffer.trim()
        done(false, err || `Exit ${code}`)
      })
      proc.on('error', (err) => done(false, err.message))
    })
  }

  const normalizedModelId = normalizeClaudeModelForCli(modelId)
  const primary = await runPingAttempt(normalizedModelId)
  if (primary.ok) return { ok: true, durationMs: Date.now() - start }

  if (normalizedModelId !== 'sonnet' && primary.error && isClaudeModelNotFoundError(primary.error)) {
    const fallback = await runPingAttempt('sonnet')
    if (fallback.ok) return { ok: true, durationMs: Date.now() - start }
    return {
      ok: false,
      durationMs: Date.now() - start,
      error: fallback.error
        ? `${primary.error}; fallback to sonnet failed: ${fallback.error}`
        : primary.error,
    }
  }

  return { ok: false, durationMs: Date.now() - start, error: primary.error }
}

export async function pingOpenRouterModel(modelId: string): Promise<{ ok: boolean; durationMs: number; error?: string }> {
  const start = Date.now()
  const apiKey = getProviderApiKey('openrouter')
  if (!apiKey) return { ok: false, durationMs: 0, error: 'No API key' }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://barnaby.build', 'X-Title': 'Barnaby' },
      body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: MODEL_PING_PROMPT }], max_tokens: 5 }),
      signal: AbortSignal.timeout(MODEL_PING_TIMEOUT_MS),
    })
    const durationMs = Date.now() - start
    if (res.ok) return { ok: true, durationMs }
    const body = await res.text().catch(() => '')
    return { ok: false, durationMs, error: `HTTP ${res.status}: ${body.slice(0, 100)}` }
  } catch (err) {
    return { ok: false, durationMs: Date.now() - start, error: errorMessage(err) }
  }
}

export async function pingModelById(provider: string, modelId: string, cwd?: string): Promise<{ ok: boolean; durationMs: number; error?: string }> {
  if (provider === 'gemini') return pingGeminiModel(modelId)
  if (provider === 'claude') return pingClaudeModel(modelId, cwd)
  if (provider === 'openrouter') return pingOpenRouterModel(modelId)
  // Codex: no lightweight ping available yet
  return { ok: true, durationMs: 0 }
}

export function readCodexModelsFromCache(): Array<{ id: string; displayName: string }> {
  try {
    const cachePath = path.join(os.homedir(), '.codex', 'models_cache.json')
    if (!fs.existsSync(cachePath)) return []
    const raw = fs.readFileSync(cachePath, 'utf8')
    const parsed = JSON.parse(raw) as {
      models?: Array<{ slug?: string; display_name?: string; visibility?: string }>
    }
    const list = Array.isArray(parsed?.models) ? parsed.models : []
    return dedupeModels(
      list
        .map((entry) => ({
          id: String(entry?.slug ?? '').trim(),
          displayName: String(entry?.display_name ?? '').trim(),
          visibility: String(entry?.visibility ?? '').trim(),
        }))
        .filter((entry) => entry.id.length > 0)
        .filter((entry) => !entry.visibility || entry.visibility === 'list')
        .map(({ id, displayName }) => ({ id, displayName: displayName || id })),
    )
  } catch {
    return []
  }
}

export async function queryCodexModelsViaExec(): Promise<{ id: string; displayName: string }[]> {
  return readCodexModelsFromCache()
}

export async function queryClaudeModelsViaExec(): Promise<{ id: string; displayName: string }[]> {
  const apiKey = getProviderApiKeyOrEnv('claude', ['ANTHROPIC_API_KEY'])
  if (!apiKey) return FALLBACK_CLAUDE_MODELS
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return FALLBACK_CLAUDE_MODELS
    const data = (await res.json()) as { data?: Array<{ id?: string; display_name?: string }> }
    const fromApi = Array.isArray(data?.data)
      ? data.data
        .map((entry) => ({
          id: String(entry?.id ?? '').trim(),
          displayName: String(entry?.display_name ?? '').trim(),
        }))
        .filter((entry) => entry.id.startsWith('claude-'))
        .map((entry) => ({ id: entry.id, displayName: entry.displayName || entry.id }))
      : []
    if (fromApi.length === 0) return FALLBACK_CLAUDE_MODELS
    return dedupeModels([...fromApi, ...FALLBACK_CLAUDE_MODELS.filter((m) => ['opus', 'sonnet', 'haiku'].includes(m.id))])
  } catch {
    return FALLBACK_CLAUDE_MODELS
  }
}

export async function fetchOpenRouterModels(): Promise<{ id: string; displayName: string }[]> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []
    const data = (await res.json()) as {
      data?: Array<{ id?: string; name?: string; pricing?: { prompt?: string; completion?: string } }>
    }
    const models = Array.isArray(data?.data) ? data.data : []
    const free = models
      .filter((m) => typeof m?.id === 'string')
      .map((m) => ({
        id: String(m.id),
        displayName: String(m.id),
        isFree:
          String(m?.id).includes(':free') ||
          (m?.pricing?.prompt === '0' && m?.pricing?.completion === '0'),
      }))
    const picked = free.filter((m) => m.isFree).slice(0, 24)
    if (picked.length > 0) return picked.map(({ id, displayName }) => ({ id, displayName }))
    return free.slice(0, 24).map(({ id, displayName }) => ({ id, displayName }))
  } catch {
    return []
  }
}

export async function getGeminiAvailableModels(): Promise<{ id: string; displayName: string }[]> {
  const apiKey = getProviderApiKeyOrEnv('gemini', ['GEMINI_API_KEY', 'GOOGLE_API_KEY'])
  if (apiKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, {
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) {
        const data = (await res.json()) as { models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }> }
        const fromApi = Array.isArray(data?.models)
          ? data.models
            .map((m) => {
              const name = String(m?.name ?? '').trim()
              const id = name.startsWith('models/') ? name.slice('models/'.length) : name
              return {
                id,
                displayName: String(m?.displayName ?? '').trim() || id,
                supportsGenerate: Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'),
              }
            })
            .filter((m) => m.id.startsWith('gemini-') && m.supportsGenerate)
            .map(({ id, displayName }) => ({ id, displayName }))
          : []
        if (fromApi.length > 0) return dedupeModels(fromApi)
      }
    } catch { /* fall through */ }
  }

  try {
    const { runCliCommand, CLI_MODELS_QUERY_TIMEOUT_MS } = await import('./cliUtils')
    const result = await runCliCommand('gemini', ['list', 'models'], CLI_MODELS_QUERY_TIMEOUT_MS)
    const out = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const matches = out.match(/\bgemini-[a-z0-9][a-z0-9.-]*/gi) ?? []
    const fromCli = dedupeModels(matches.map((id) => ({ id: id.toLowerCase(), displayName: id.toLowerCase() })))
    if (fromCli.length > 0) return fromCli
  } catch { /* fall through */ }

  return FALLBACK_GEMINI_MODELS
}

export async function getAvailableModels(): Promise<ModelsByProvider> {
  const [codex, claude, gemini, openrouter] = await Promise.all([
    queryCodexModelsViaExec().catch((err) => {
      console.error('[getAvailableModels] codex error:', err)
      return []
    }),
    queryClaudeModelsViaExec().catch((err) => {
      console.error('[getAvailableModels] claude error:', err)
      return []
    }),
    getGeminiAvailableModels().catch((err) => {
      console.error('[getAvailableModels] gemini error:', err)
      return []
    }),
    fetchOpenRouterModels().catch((err) => {
      console.error('[getAvailableModels] openrouter error:', err)
      return []
    }),
  ])
  return { codex, claude, gemini, openrouter }
}
