import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

import { generateWorkspaceTreeText } from './fileTree'

export const AGENT_MAX_TOOL_ROUNDS = 8
export const AGENT_MAX_TOOL_OUTPUT_CHARS = 14_000
const AGENT_MAX_FILE_BYTES = 350_000
const AGENT_MAX_SEARCH_RESULTS = 60
const AGENT_MAX_SEARCH_FILES = 1200
const AGENT_DEFAULT_SHELL_TIMEOUT_MS = 120_000
const AGENT_MAX_SHELL_TIMEOUT_MS = 300_000

export type ToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type AgentToolRunnerOptions = {
  cwd: string
  sandbox: string
  permissionMode: string
  allowedCommandPrefixes?: string[]
}

export class AgentToolRunner {
  private cwd: string
  private sandbox: string
  private permissionMode: string
  private allowedCommandPrefixes: string[]

  constructor(options: AgentToolRunnerOptions) {
    this.cwd = options.cwd
    this.sandbox = options.sandbox
    this.permissionMode = options.permissionMode
    this.allowedCommandPrefixes = Array.isArray(options.allowedCommandPrefixes)
      ? options.allowedCommandPrefixes.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : []
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        type: 'function',
        function: {
          name: 'list_workspace_tree',
          description: 'List the current workspace tree (truncated).',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {},
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_workspace',
          description: 'Search text in workspace files. Returns file:line snippets.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              query: { type: 'string', description: 'Text to search for.' },
              caseSensitive: { type: 'boolean' },
            },
            required: ['query'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'read_workspace_file',
          description: 'Read a text file from the workspace with optional line range.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              path: { type: 'string', description: 'Relative path from workspace root.' },
              startLine: { type: 'integer' },
              endLine: { type: 'integer' },
            },
            required: ['path'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'write_workspace_file',
          description: 'Write UTF-8 text to a workspace file path. Use this to apply requested code changes.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              path: { type: 'string', description: 'Relative path from workspace root.' },
              content: { type: 'string', description: 'Full file content to write.' },
            },
            required: ['path', 'content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'run_shell_command',
          description: 'Run a shell command in the workspace root (subject to permission mode and allowed command prefixes).',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              command: { type: 'string', description: 'Command line to execute.' },
              timeoutMs: { type: 'integer', description: 'Optional timeout in milliseconds.' },
            },
            required: ['command'],
          },
        },
      },
    ]
  }

  async executeTool(name: string, rawArgs: string | undefined): Promise<string> {
    let args: Record<string, unknown> = {}
    if (typeof rawArgs === 'string' && rawArgs.trim()) {
      try {
        args = JSON.parse(rawArgs) as Record<string, unknown>
      } catch {
        return 'Tool error: Invalid JSON arguments.'
      }
    }

    if (name === 'list_workspace_tree') {
      return this.limitOutput(generateWorkspaceTreeText(this.cwd))
    }

    if (name === 'search_workspace') {
      return this.limitOutput(this.searchWorkspace(args))
    }

    if (name === 'read_workspace_file') {
      return this.limitOutput(this.readWorkspaceFile(args))
    }

    if (name === 'write_workspace_file') {
      return this.limitOutput(this.writeWorkspaceFile(args))
    }

    if (name === 'run_shell_command') {
      const output = await this.runShellCommand(args)
      return this.limitOutput(output)
    }

    return `Tool error: Unknown tool "${name}".`
  }

  limitOutput(text: string): string {
    if (text.length <= AGENT_MAX_TOOL_OUTPUT_CHARS) return text
    return `${text.slice(0, AGENT_MAX_TOOL_OUTPUT_CHARS)}\n... [truncated]`
  }

  private resolveWorkspacePath(rawPath: unknown): { ok: true; absolute: string; relative: string } | { ok: false; error: string } {
    if (typeof rawPath !== 'string' || !rawPath.trim()) {
      return { ok: false, error: 'Path is required.' }
    }

    const normalizedRoot = path.resolve(this.cwd)
    const requested = rawPath.trim()
    const absolute = path.resolve(normalizedRoot, requested)
    const relative = path.relative(normalizedRoot, absolute)

    if (!relative || relative === '.') {
      return { ok: false, error: 'Path must point to a file inside the workspace.' }
    }
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return { ok: false, error: 'Path escapes workspace root.' }
    }
    return { ok: true, absolute, relative: relative.replace(/\\/g, '/') }
  }

  private readWorkspaceFile(args: Record<string, unknown>): string {
    const resolved = this.resolveWorkspacePath(args.path)
    if (!resolved.ok) return `Tool error: ${resolved.error}`

    let stat: fs.Stats
    try {
      stat = fs.statSync(resolved.absolute)
    } catch {
      return `Tool error: File not found: ${resolved.relative}`
    }
    if (!stat.isFile()) return `Tool error: Not a file: ${resolved.relative}`

    const bytes = fs.readFileSync(resolved.absolute)
    if (bytes.includes(0)) return `Tool error: File appears binary and cannot be read as text: ${resolved.relative}`

    const text = bytes.toString('utf8')
    if (text.length > AGENT_MAX_FILE_BYTES) {
      return `Tool error: File too large (${text.length} chars). Use search_workspace or narrower line range.`
    }

    const lines = text.split(/\r?\n/)
    const total = lines.length
    const startRaw = typeof args.startLine === 'number' ? Math.floor(args.startLine) : 1
    const endRaw = typeof args.endLine === 'number' ? Math.floor(args.endLine) : Math.min(total, startRaw + 220)
    const startLine = Math.min(Math.max(startRaw, 1), total)
    const endLine = Math.min(Math.max(endRaw, startLine), total)

    const numbered = lines
      .slice(startLine - 1, endLine)
      .map((line, i) => `${startLine + i}: ${line}`)
      .join('\n')
    return `File: ${resolved.relative}\nLines: ${startLine}-${endLine} of ${total}\n\n${numbered}`
  }

  private writeWorkspaceFile(args: Record<string, unknown>): string {
    if (this.sandbox === 'read-only') {
      return 'Tool error: Workspace is read-only (sandbox mode).'
    }
    if (this.permissionMode !== 'proceed-always') {
      return 'Tool error: Write denied in verify-first mode. Set permissions to Proceed always for autonomous edits.'
    }

    const resolved = this.resolveWorkspacePath(args.path)
    if (!resolved.ok) return `Tool error: ${resolved.error}`

    if (typeof args.content !== 'string') {
      return 'Tool error: content must be a string.'
    }

    const content = args.content
    if (content.length > AGENT_MAX_FILE_BYTES) {
      return `Tool error: Refusing to write large payload (${content.length} chars).`
    }

    try {
      const parentDir = path.dirname(resolved.absolute)
      if (!fs.existsSync(parentDir)) {
        return `Tool error: Parent directory does not exist: ${path.relative(this.cwd, parentDir).replace(/\\/g, '/')}`
      }

      fs.writeFileSync(resolved.absolute, content, 'utf8')
      const lineCount = content.length === 0 ? 0 : content.split(/\r?\n/).length
      return `Wrote file: ${resolved.relative} (${content.length} chars, ${lineCount} lines).`
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return `Tool error: Failed writing ${resolved.relative}: ${message}`
    }
  }

  private async runShellCommand(args: Record<string, unknown>): Promise<string> {
    if (this.sandbox === 'read-only') {
      return 'Tool error: Workspace is read-only (sandbox mode).'
    }
    if (this.permissionMode !== 'proceed-always') {
      return 'Tool error: Command execution denied in verify-first mode. Set permissions to Proceed always.'
    }

    const command = typeof args.command === 'string' ? args.command.trim() : ''
    if (!command) return 'Tool error: command is required.'

    if (this.allowedCommandPrefixes.length > 0) {
      const allowed = this.allowedCommandPrefixes.some((prefix) => command.startsWith(prefix))
      if (!allowed) {
        return `Tool error: Command not in allowlist. Allowed prefixes: ${this.allowedCommandPrefixes.join(', ')}`
      }
    }

    const timeoutRaw = typeof args.timeoutMs === 'number' ? Math.floor(args.timeoutMs) : AGENT_DEFAULT_SHELL_TIMEOUT_MS
    const timeoutMs = Math.max(500, Math.min(AGENT_MAX_SHELL_TIMEOUT_MS, timeoutRaw))

    return this.runShellCommandAsync(command, timeoutMs)
  }

  private async runShellCommandAsync(command: string, timeoutMs: number): Promise<string> {
    const shell = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh'
    const shellArgs = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command]

    try {
      const child = spawn(shell, shellArgs, {
        cwd: this.cwd,
        env: process.env,
        windowsHide: true,
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false

      if (child.stdout) {
        child.stdout.setEncoding('utf8')
        child.stdout.on('data', (chunk: string) => {
          stdout += chunk
        })
      }
      if (child.stderr) {
        child.stderr.setEncoding('utf8')
        child.stderr.on('data', (chunk: string) => {
          stderr += chunk
        })
      }

      const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
        child.on('exit', (code, signal) => resolve({ code, signal }))
      })

      let timeoutHandle: ReturnType<typeof setTimeout> | null = null
      const timeout = new Promise<{ timeout: true }>((resolve) => {
        timeoutHandle = setTimeout(() => {
          timedOut = true
          try {
            child.kill('SIGTERM')
          } catch {
            // ignore
          }
          resolve({ timeout: true })
        }, timeoutMs)
      })

      const result = await Promise.race([exit, timeout])
      if (timeoutHandle) clearTimeout(timeoutHandle)
      if ('timeout' in result) {
        return `Command timed out after ${timeoutMs}ms.\n\nstdout:\n${stdout || '(empty)'}\n\nstderr:\n${stderr || '(empty)'}`
      }
      const code = result.code ?? -1
      const signal = result.signal ?? ''
      const meta = `exit_code=${code}${signal ? ` signal=${signal}` : ''}${timedOut ? ' timeout=true' : ''}`
      return `${meta}\n\nstdout:\n${stdout || '(empty)'}\n\nstderr:\n${stderr || '(empty)'}`
    } catch (err) {
      return `Tool error: Failed to run command: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  private searchWorkspace(args: Record<string, unknown>): string {
    const query = typeof args.query === 'string' ? args.query.trim() : ''
    if (!query) return 'Tool error: query is required.'
    const caseSensitive = Boolean(args.caseSensitive)

    const root = path.resolve(this.cwd)
    const ignoredDirs = new Set([
      '.git',
      'node_modules',
      'dist',
      'dist-electron',
      'release',
      'build',
      '.barnaby',
      '.next',
      '.nuxt',
      '.output',
      'coverage',
    ])
    const ignoredFileExt = new Set([
      '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf',
      '.zip', '.gz', '.exe', '.dll', '.woff', '.woff2', '.ttf',
      '.mp4', '.mp3', '.icns', '.bin', '.map', '.lock',
    ])

    const stack: string[] = [root]
    const results: string[] = []
    let scannedFiles = 0
    let truncated = false

    const needle = caseSensitive ? query : query.toLowerCase()

    while (stack.length > 0 && results.length < AGENT_MAX_SEARCH_RESULTS) {
      const dir = stack.pop() as string
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        continue
      }

      for (const entry of entries) {
        const name = entry.name
        if (!name || name.startsWith('.')) continue
        const absolute = path.join(dir, name)

        if (entry.isDirectory()) {
          if (ignoredDirs.has(name)) continue
          stack.push(absolute)
          continue
        }
        if (!entry.isFile()) continue

        const ext = path.extname(name).toLowerCase()
        if (ignoredFileExt.has(ext)) continue

        scannedFiles++
        if (scannedFiles > AGENT_MAX_SEARCH_FILES) {
          truncated = true
          break
        }

        let content = ''
        try {
          const stat = fs.statSync(absolute)
          if (stat.size > AGENT_MAX_FILE_BYTES) continue
          const buffer = fs.readFileSync(absolute)
          if (buffer.includes(0)) continue
          content = buffer.toString('utf8')
        } catch {
          continue
        }

        const lines = content.split(/\r?\n/)
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          const haystack = caseSensitive ? line : line.toLowerCase()
          if (!haystack.includes(needle)) continue
          const relative = path.relative(root, absolute).replace(/\\/g, '/')
          const snippet = line.length > 220 ? line.slice(0, 220) + '...' : line
          results.push(`${relative}:${i + 1}: ${snippet}`)
          if (results.length >= AGENT_MAX_SEARCH_RESULTS) break
        }
      }

      if (truncated) break
    }

    if (results.length === 0) return `No matches for "${query}".`
    const summary = truncated
      ? `Results for "${query}" (truncated after scanning ${AGENT_MAX_SEARCH_FILES} files):`
      : `Results for "${query}":`
    return `${summary}\n${results.join('\n')}`
  }
}
