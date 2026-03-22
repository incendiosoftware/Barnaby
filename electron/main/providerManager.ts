import { shell } from 'electron'
import path from 'node:path'
import { errorMessage } from './logger'
import { getProviderApiKey } from './providerSecrets'
import { isCliInstalled, runCliCommand, CLI_AUTH_CHECK_TIMEOUT_MS, execFileAsync } from './cliUtils'
import type { ProviderConfigForAuth, ProviderAuthStatus } from './types'

export async function getProviderAuthStatus(config: ProviderConfigForAuth): Promise<ProviderAuthStatus> {
  const providerType = config.type ?? (config.id === 'openrouter' ? 'api' : 'cli')
  if (providerType === 'api') {
    const apiKey = getProviderApiKey(config.id)
    const base = (config.apiBaseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
    if (!apiKey) {
      return {
        provider: config.id,
        installed: true,
        authenticated: false,
        detail: 'API key not configured. Add your key in Settings -> Connectivity.',
        checkedAt: Date.now(),
      }
    }
    try {
      const res = await fetch(`${base}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://barnaby.build',
          'X-Title': 'Barnaby',
        },
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        return {
          provider: config.id,
          installed: true,
          authenticated: true,
          detail: 'API key is valid.',
          checkedAt: Date.now(),
        }
      }
      const body = await res.text().catch(() => '')
      return {
        provider: config.id,
        installed: true,
        authenticated: false,
        detail: `API check failed (${res.status}). ${body.slice(0, 200)}`.trim(),
        checkedAt: Date.now(),
      }
    } catch (err) {
      return {
        provider: config.id,
        installed: true,
        authenticated: false,
        detail: errorMessage(err) || 'API check failed.',
        checkedAt: Date.now(),
      }
    }
  }

  const executable = config.cliPath ?? config.cliCommand ?? ''
  const authArgs = (config.authCheckCommand ?? '--version').trim().split(/\s+/).filter(Boolean)
  const isCodexStyle = config.id === 'codex'
  const isClaudeStyle = config.id === 'claude'

  if (config.id === 'gemini') {
    try {
      const geminiVersionResult = await runCliCommand(executable, ['--version'], CLI_AUTH_CHECK_TIMEOUT_MS)
      const success = Object.keys(geminiVersionResult).length > 0
      return {
        provider: config.id,
        installed: true,
        authenticated: success,
        detail: success ? 'Ready to use.' : 'Login required.',
        checkedAt: Date.now(),
      }
    } catch (geminiVersionErr) {
      const msg = errorMessage(geminiVersionErr)
      const isTimeout = /timed out/i.test(msg)
      const installed = isTimeout ? true : await isCliInstalled(executable)
      return {
        provider: config.id,
        installed,
        authenticated: false,
        detail: msg || 'Login required.',
        checkedAt: Date.now(),
      }
    }
  }

  try {
    const result = await runCliCommand(executable, authArgs)
    const out = `${result.stdout ?? ''}
${result.stderr ?? ''}`.trim()
    const normalized = out.toLowerCase()
    let authenticated: boolean
    let detail = ''
    if (isCodexStyle) {
      authenticated = normalized.includes('logged in') && !normalized.includes('not logged in')
      detail = out
    } else if (isClaudeStyle) {
      try {
        const parsed = JSON.parse(out)
        authenticated = Boolean(parsed.loggedIn)
        const email = parsed.email ? ` (${parsed.email})` : ''
        const sub = parsed.subscriptionType ? ` [${parsed.subscriptionType}]` : ''
        detail = authenticated ? `Logged in${email}${sub}` : 'Not logged in.'
      } catch {
        authenticated = false
        detail = out || 'Could not parse auth status.'
      }
    } else {
      authenticated = true
      detail = out
    }
    return {
      provider: config.id,
      installed: true,
      authenticated,
      detail: detail || (authenticated ? 'Logged in.' : 'Not logged in.'),
      checkedAt: Date.now(),
    }
  } catch (err) {
    const msg = errorMessage(err)
    const isTimeout = /timed out/i.test(msg)
    const installed = isTimeout ? true : await isCliInstalled(executable)
    return {
      provider: config.id,
      installed,
      authenticated: false,
      detail: msg || (installed ? 'Login required.' : `${config.id} CLI not found.`),
      checkedAt: Date.now(),
    }
  }
}

export async function launchProviderLogin(config: ProviderConfigForAuth): Promise<{ started: boolean; detail: string }> {
  const providerType = config.type ?? (config.id === 'openrouter' ? 'api' : 'cli')
  if (providerType === 'api') {
    const target = config.loginUrl || 'https://openrouter.ai/keys'
    await shell.openExternal(target)
    return { started: true, detail: `Opened ${config.id} key management page.` }
  }

  const command = config.loginCommand ?? config.cliCommand
  if (!command) {
    return { started: false, detail: `No login command configured for ${config.id}.` }
  }

  if (process.platform === 'win32') {
    await execFileAsync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'start', '', 'cmd', '/k', command], {
      windowsHide: true,
    })
    return {
      started: true,
      detail: `Opened terminal for ${config.id} login.`,
    }
  }

  await execFileAsync('sh', ['-lc', command], { windowsHide: true })
  return { started: true, detail: `Launched ${config.id} login.` }
}

export async function launchProviderUpgrade(config: ProviderConfigForAuth): Promise<{ started: boolean; detail: string }> {
  const pkg = config.upgradePackage
  const fallbackCommand = config.upgradeCommand

  const command =
    pkg
      ? process.platform === 'win32'
        ? `npm uninstall -g ${pkg} & npm install -g ${pkg}@latest`
        : `npm uninstall -g ${pkg}; npm install -g ${pkg}@latest`
      : fallbackCommand

  if (!command) {
    return { started: false, detail: `No upgrade command configured for ${config.id}.` }
  }

  if (process.platform === 'win32') {
    await execFileAsync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'start', '', 'cmd', '/k', command], {
      windowsHide: true,
    })
    return {
      started: true,
      detail: `Opened terminal to upgrade ${config.id} CLI. Run the command shown, then close the window.`,
    }
  }

  if (process.platform === 'darwin') {
    const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    await execFileAsync('osascript', [
      '-e',
      `tell application "Terminal" to do script "${escaped}"`,
    ])
    return {
      started: true,
      detail: `Opened Terminal to upgrade ${config.id} CLI. Close the window when done.`,
    }
  }

  await execFileAsync('sh', ['-lc', command], { windowsHide: true })
  return { started: true, detail: `Ran ${config.id} CLI upgrade. Re-check connectivity.` }
}

export function getProviderApiKeyOrEnv(providerId: string, envVars: string[]): string {
  const fromSecrets = getProviderApiKey(providerId)
  if (fromSecrets) return fromSecrets
  for (const envVar of envVars) {
    const v = (process.env[envVar] ?? '').trim()
    if (v) return v
  }
  return ''
}
