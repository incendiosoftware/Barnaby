import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { ToolDefinition } from './agentTools'

const MCP_CONFIG_FILENAME = 'mcp-servers.json'
const MCP_CONNECT_TIMEOUT_MS = 15_000

export type McpServerConfig = {
  command: string
  args?: string[]
  env?: Record<string, string>
  enabled?: boolean
}

export type McpServersConfig = {
  mcpServers: Record<string, McpServerConfig>
}

export type McpServerStatus = {
  name: string
  config: McpServerConfig
  connected: boolean
  error?: string
  toolCount: number
  tools: Array<{ name: string; description?: string }>
}

type McpServerInstance = {
  name: string
  config: McpServerConfig
  client: Client
  transport: StdioClientTransport
  tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>
  connected: boolean
  error?: string
}

export class McpServerManager extends EventEmitter {
  private instances = new Map<string, McpServerInstance>()
  private configPath: string

  constructor() {
    super()
    const storageDir = path.join(app.getPath('userData'), '.storage')
    this.configPath = path.join(storageDir, MCP_CONFIG_FILENAME)
  }

  getConfigPath(): string {
    return this.configPath
  }

  readConfig(): McpServersConfig {
    if (!fs.existsSync(this.configPath)) return { mcpServers: {} }
    try {
      const raw = fs.readFileSync(this.configPath, 'utf8')
      const parsed = JSON.parse(raw) as McpServersConfig
      if (!parsed || typeof parsed !== 'object' || !parsed.mcpServers) return { mcpServers: {} }
      return parsed
    } catch {
      return { mcpServers: {} }
    }
  }

  writeConfig(config: McpServersConfig): void {
    const dir = path.dirname(this.configPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8')
  }

  async startAll(): Promise<void> {
    const config = this.readConfig()
    const names = Object.keys(config.mcpServers)
    for (const name of names) {
      const serverConfig = config.mcpServers[name]
      if (serverConfig.enabled === false) continue
      await this.startServer(name, serverConfig)
    }
  }

  async startServer(name: string, config: McpServerConfig): Promise<void> {
    await this.stopServer(name)

    const instance: McpServerInstance = {
      name,
      config,
      client: null!,
      transport: null!,
      tools: [],
      connected: false,
    }

    try {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
      })

      const client = new Client({ name: `barnaby-${name}`, version: '1.0.0' })

      instance.transport = transport
      instance.client = client

      const connectPromise = client.connect(transport)
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Connection timed out after ${MCP_CONNECT_TIMEOUT_MS / 1000}s`)), MCP_CONNECT_TIMEOUT_MS),
      )
      await Promise.race([connectPromise, timeout])

      const toolsResult = await client.listTools()
      instance.tools = (toolsResult.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown> | undefined,
      }))
      instance.connected = true
      instance.error = undefined
    } catch (err) {
      instance.connected = false
      instance.error = err instanceof Error ? err.message : String(err)
    }

    this.instances.set(name, instance)
    this.emit('statusChanged')
  }

  async stopServer(name: string): Promise<void> {
    const instance = this.instances.get(name)
    if (!instance) return
    try {
      await instance.client?.close()
    } catch {
      // best effort
    }
    this.instances.delete(name)
    this.emit('statusChanged')
  }

  async stopAll(): Promise<void> {
    const names = [...this.instances.keys()]
    for (const name of names) {
      await this.stopServer(name)
    }
  }

  async restartServer(name: string): Promise<void> {
    const config = this.readConfig()
    const serverConfig = config.mcpServers[name]
    if (!serverConfig) return
    await this.startServer(name, serverConfig)
  }

  getStatuses(): McpServerStatus[] {
    const config = this.readConfig()
    const statuses: McpServerStatus[] = []

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      const instance = this.instances.get(name)
      statuses.push({
        name,
        config: serverConfig,
        connected: instance?.connected ?? false,
        error: instance?.error,
        toolCount: instance?.tools.length ?? 0,
        tools: instance?.tools.map((t) => ({ name: t.name, description: t.description })) ?? [],
      })
    }

    return statuses
  }

  getAggregatedToolDefinitions(): ToolDefinition[] {
    const defs: ToolDefinition[] = []
    for (const [serverName, instance] of this.instances) {
      if (!instance.connected) continue
      for (const tool of instance.tools) {
        defs.push({
          type: 'function',
          function: {
            name: `mcp__${serverName}__${tool.name}`,
            description: `[MCP: ${serverName}] ${tool.description ?? tool.name}`,
            parameters: tool.inputSchema ?? { type: 'object', properties: {} },
          },
        })
      }
    }
    return defs
  }

  async executeMcpTool(namespacedName: string, rawArgs: string | undefined): Promise<string> {
    const match = namespacedName.match(/^mcp__([^_]+(?:__[^_]+)*)__([^_]+(?:__[^_]+)*)$/)
    if (!match) return `MCP tool error: invalid tool name "${namespacedName}"`

    const parts = namespacedName.replace(/^mcp__/, '').split('__')
    if (parts.length < 2) return `MCP tool error: invalid tool name "${namespacedName}"`
    const toolName = parts[parts.length - 1]
    const serverName = parts.slice(0, -1).join('__')

    const instance = this.instances.get(serverName)
    if (!instance) return `MCP tool error: server "${serverName}" not found`
    if (!instance.connected) return `MCP tool error: server "${serverName}" is not connected`

    let args: Record<string, unknown> = {}
    if (typeof rawArgs === 'string' && rawArgs.trim()) {
      try {
        args = JSON.parse(rawArgs) as Record<string, unknown>
      } catch {
        return 'MCP tool error: invalid JSON arguments'
      }
    }

    try {
      const result = await instance.client.callTool({ name: toolName, arguments: args })
      if (result.isError) {
        const errContent = Array.isArray(result.content)
          ? result.content.map((c) => (c as { text?: string }).text ?? '').join('\n')
          : String(result.content)
        return `MCP tool error: ${errContent}`
      }
      if (Array.isArray(result.content)) {
        return result.content
          .map((c) => (c as { text?: string }).text ?? JSON.stringify(c))
          .join('\n')
      }
      return typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
    } catch (err) {
      return `MCP tool error: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  addServer(name: string, config: McpServerConfig): void {
    const current = this.readConfig()
    current.mcpServers[name] = config
    this.writeConfig(current)
  }

  updateServer(name: string, config: McpServerConfig): void {
    const current = this.readConfig()
    if (!current.mcpServers[name]) return
    current.mcpServers[name] = config
    this.writeConfig(current)
  }

  removeServer(name: string): void {
    const current = this.readConfig()
    delete current.mcpServers[name]
    this.writeConfig(current)
    this.stopServer(name).catch(() => {})
  }
}
