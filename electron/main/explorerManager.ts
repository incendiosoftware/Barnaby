import path from 'node:path'
import fs from 'node:fs'
import { BrowserWindow, shell, dialog } from 'electron'
import { normalizeRelativePath, resolveWorkspacePath, toWorkspaceRelativePath } from './workspaceManager'
import type { WorkspaceTreeOptions, WorkspaceTreeNode } from './types'
import { MAX_EXPLORER_NODES, EXPLORER_ALWAYS_IGNORED_DIRECTORIES, MAX_FILE_PREVIEW_BYTES } from './constants'
import { getMainWindow } from './windowManager'

export function readWorkspaceTree(
  workspaceRoot: string,
  options: WorkspaceTreeOptions = {},
): { nodes: WorkspaceTreeNode[]; truncated: boolean } {
  const root = path.resolve(workspaceRoot)
  if (!fs.existsSync(root)) throw new Error('Workspace path does not exist.')
  if (!fs.statSync(root).isDirectory()) throw new Error('Workspace path is not a directory.')
  const includeHidden = Boolean(options.includeHidden)
  const includeNodeModules = Boolean(options.includeNodeModules)

  let seenNodes = 0
  let truncated = false

  function walk(relativeParent: string): WorkspaceTreeNode[] {
    if (truncated) return []

    const absoluteParent = relativeParent ? resolveWorkspacePath(root, relativeParent) : root
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(absoluteParent, { withFileTypes: true })
    } catch {
      return []
    }

    const sorted = entries
      .filter((entry) => {
        if (!includeHidden && entry.name.startsWith('.')) return false
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' && !includeNodeModules) return false
          return !EXPLORER_ALWAYS_IGNORED_DIRECTORIES.has(entry.name)
        }
        return entry.isFile()
      })
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
        return a.name.localeCompare(b.name)
      })

    const nodes: WorkspaceTreeNode[] = []
    for (const entry of sorted) {
      if (truncated) break
      seenNodes += 1
      if (seenNodes > MAX_EXPLORER_NODES) {
        truncated = true
        break
      }

      const childRelative = normalizeRelativePath(relativeParent ? `${relativeParent}/${entry.name}` : entry.name)
      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          relativePath: childRelative,
          type: 'directory',
          children: walk(childRelative),
        })
      } else {
        nodes.push({
          name: entry.name,
          relativePath: childRelative,
          type: 'file',
        })
      }
    }
    return nodes
  }

  return { nodes: walk(''), truncated }
}

export function readWorkspaceFile(workspaceRoot: string, relativePath: string) {
  if (!relativePath?.trim()) throw new Error('File path is required.')
  const absolutePath = resolveWorkspacePath(workspaceRoot, normalizeRelativePath(relativePath))
  if (!fs.existsSync(absolutePath)) throw new Error('File does not exist.')

  const stat = fs.statSync(absolutePath)
  if (!stat.isFile()) throw new Error('Path is not a file.')

  const bytesToRead = Math.min(stat.size, MAX_FILE_PREVIEW_BYTES)
  const buffer = Buffer.alloc(bytesToRead)
  const handle = fs.openSync(absolutePath, 'r')

  try {
    fs.readSync(handle, buffer, 0, bytesToRead, 0)
  } finally {
    fs.closeSync(handle)
  }

  const binary = buffer.includes(0)
  return {
    relativePath: normalizeRelativePath(relativePath),
    size: stat.size,
    truncated: stat.size > MAX_FILE_PREVIEW_BYTES,
    binary,
    content: binary ? '' : buffer.toString('utf8'),
  }
}

export function readWorkspaceTextFile(workspaceRoot: string, relativePath: string) {
  if (!relativePath?.trim()) throw new Error('File path is required.')
  const normalizedPath = normalizeRelativePath(relativePath)
  const absolutePath = resolveWorkspacePath(workspaceRoot, normalizedPath)
  if (!fs.existsSync(absolutePath)) throw new Error('File does not exist.')

  const stat = fs.statSync(absolutePath)
  if (!stat.isFile()) throw new Error('Path is not a file.')

  const buffer = fs.readFileSync(absolutePath)
  const binary = buffer.includes(0)
  return {
    relativePath: normalizedPath,
    size: stat.size,
    binary,
    content: binary ? '' : buffer.toString('utf8'),
  }
}

export function writeWorkspaceFile(workspaceRoot: string, relativePath: string, content: string) {
  if (!relativePath?.trim()) throw new Error('File path is required.')
  const normalizedPath = normalizeRelativePath(relativePath)
  const absolutePath = resolveWorkspacePath(workspaceRoot, normalizedPath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, content ?? '', 'utf8')
  const stat = fs.statSync(absolutePath)
  return {
    relativePath: normalizedPath,
    size: stat.size,
  }
}

export function openWorkspacePathInExplorer(workspaceRoot: string, relativePath: string) {
  if (!relativePath?.trim()) throw new Error('File path is required.')
  const normalizedPath = normalizeRelativePath(relativePath)
  const absolutePath = resolveWorkspacePath(workspaceRoot, normalizedPath)
  if (!fs.existsSync(absolutePath)) throw new Error('File does not exist.')

  shell.showItemInFolder(absolutePath)
  return {
    ok: true as const,
    path: absolutePath,
  }
}

export function deleteWorkspaceFile(workspaceRoot: string, relativePath: string) {
  if (!relativePath?.trim()) throw new Error('File path is required.')
  const normalizedPath = normalizeRelativePath(relativePath)
  const absolutePath = resolveWorkspacePath(workspaceRoot, normalizedPath)
  if (!fs.existsSync(absolutePath)) throw new Error('File does not exist.')
  const stat = fs.statSync(absolutePath)
  if (!stat.isFile()) throw new Error('Path is not a file.')

  fs.unlinkSync(absolutePath)
  return {
    ok: true as const,
    relativePath: normalizedPath,
  }
}

export async function pickWorkspaceSavePath(workspaceRoot: string, relativePath: string) {
  const root = path.resolve(workspaceRoot)
  if (!fs.existsSync(root)) throw new Error('Workspace path does not exist.')
  if (!fs.statSync(root).isDirectory()) throw new Error('Workspace path is not a directory.')

  const normalizedPath = normalizeRelativePath(relativePath || 'untitled.txt')
  const defaultPath = path.join(root, normalizedPath.split('/').filter(Boolean).join(path.sep))
  const win = getMainWindow()
  const parent = BrowserWindow.getFocusedWindow() ?? win ?? BrowserWindow.getAllWindows()[0] ?? undefined
  const result = await dialog.showSaveDialog(parent, {
    title: 'Save file as',
    defaultPath,
  })
  if (result.canceled || !result.filePath) return null
  const nextRelativePath = toWorkspaceRelativePath(root, result.filePath)
  if (!nextRelativePath) throw new Error('Save As path must be a file inside the workspace root.')
  return nextRelativePath
}

export async function pickWorkspaceOpenPath(workspaceRoot: string) {
  const root = path.resolve(workspaceRoot)
  if (!fs.existsSync(root)) throw new Error('Workspace path does not exist.')
  if (!fs.statSync(root).isDirectory()) throw new Error('Workspace path is not a directory.')

  const win = getMainWindow()
  const parent = BrowserWindow.getFocusedWindow() ?? win ?? BrowserWindow.getAllWindows()[0] ?? undefined
  const result = await dialog.showOpenDialog(parent, {
    title: 'Open file',
    defaultPath: root,
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const selectedPath = result.filePaths[0]
  return toWorkspaceRelativePath(root, selectedPath)
}
