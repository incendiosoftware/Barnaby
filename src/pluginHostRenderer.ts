/**
 * Barnaby Plugin Host – renderer-side bridge.
 *
 * Listens for plugin-host IPC requests from the main process and dispatches
 * them to registered callbacks (wired up by App.tsx). Also provides event
 * forwarding so plugins receive panel lifecycle notifications.
 */

export type PluginPanelCreateOptions = {
  model?: string
  provider?: string
  workspace?: string
  interactionMode?: string
  permissionMode?: string
  sandbox?: string
}

export type PluginHostCallbacks = {
  createPanel: (options: PluginPanelCreateOptions) => Promise<string>
  closePanel: (panelId: string) => Promise<void>
  sendMessage: (panelId: string, message: string, attachments: string[]) => Promise<void>
  interruptPanel: (panelId: string) => Promise<void>
  listFiles: (options: { includeHidden?: boolean }) => Promise<{ nodes: any[]; truncated: boolean }>
}

let registeredCallbacks: PluginHostCallbacks | null = null
let ipcListenerCleanup: (() => void) | null = null

export function registerPluginHostCallbacks(callbacks: PluginHostCallbacks): () => void {
  registeredCallbacks = callbacks

  if (ipcListenerCleanup) return ipcListenerCleanup

  const api = (window as any).agentOrchestrator ?? (window as any).fireharness

  const handler = async (payload: { channel: string; responseChannel: string; args: unknown[] }) => {
    if (!registeredCallbacks) return

    const { channel, responseChannel, args } = payload

    try {
      let result: unknown

      switch (channel) {
        case 'plugin:createPanel':
          result = await registeredCallbacks.createPanel((args[0] ?? {}) as PluginPanelCreateOptions)
          break
        case 'plugin:closePanel':
          result = await registeredCallbacks.closePanel(args[0] as string)
          break
        case 'plugin:sendMessage':
          result = await registeredCallbacks.sendMessage(
            args[0] as string,
            args[1] as string,
            (args[2] ?? []) as string[],
          )
          break
        case 'plugin:interruptPanel':
          result = await registeredCallbacks.interruptPanel(args[0] as string)
          break
        case 'plugin:listFiles':
          result = await registeredCallbacks.listFiles((args[0] ?? {}) as { includeHidden?: boolean })
          break
        default:
          console.warn(`[pluginHostRenderer] Unknown plugin host channel: ${channel}`)
          return
      }

      api?.pluginHostRespond?.(responseChannel, { ok: true, data: result })
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      api?.pluginHostRespond?.(responseChannel, { ok: false, error: errMsg })
    }
  }

  const onPluginHostRequest = api?.onPluginHostRequest
  if (typeof onPluginHostRequest === 'function') {
    const cleanup = onPluginHostRequest(handler)
    const wrappedCleanup = typeof cleanup === 'function' ? cleanup : () => { registeredCallbacks = null }
    ipcListenerCleanup = wrappedCleanup
    return wrappedCleanup
  }

  console.warn('[pluginHostRenderer] No IPC bridge available for plugin host')
  const fallbackCleanup = () => { registeredCallbacks = null }
  ipcListenerCleanup = fallbackCleanup
  return fallbackCleanup
}

export function unregisterPluginHostCallbacks(): void {
  registeredCallbacks = null
  if (ipcListenerCleanup) {
    ipcListenerCleanup()
    ipcListenerCleanup = null
  }
}

export function isPluginHostActive(): boolean {
  return registeredCallbacks !== null
}
