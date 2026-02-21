import fs from 'node:fs'
import path from 'node:path'

const IGNORED_DIRS = new Set([
  '.git',
  '.svn',
  '.hg',
  '.DS_Store',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.output',
  'target',
  'vendor',
  'bower_components',
])

const MAX_TREE_DEPTH = 4
const MAX_NODES = 300

export function generateWorkspaceTreeText(root: string): string {
  let output = 'Current Workspace Structure:\n'
  let nodeCount = 0
  let truncated = false

  function walk(currentPath: string, depth: number, prefix: string) {
    if (depth > MAX_TREE_DEPTH || truncated) return

    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true })
      
      // Sort directories first, then files
      entries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      const visibleEntries = entries.filter(e => {
        if (e.name.startsWith('.')) return false // Hidden files/dirs
        if (e.isDirectory() && IGNORED_DIRS.has(e.name)) return false
        return true
      })

      for (let i = 0; i < visibleEntries.length; i++) {
        const entry = visibleEntries[i]
        nodeCount++
        if (nodeCount > MAX_NODES) {
          if (!truncated) {
            truncated = true
            output += `${prefix}- ... (truncated)\n`
          }
          return
        }

        output += `${prefix}- ${entry.name}${entry.isDirectory() ? '/' : ''}\n`
        
        if (entry.isDirectory()) {
          walk(path.join(currentPath, entry.name), depth + 1, `${prefix}  `)
        }
      }
    } catch {
      // Ignore access errors
    }
  }

  walk(root, 0, '')
  
  if (truncated) {
    output += '\n(Note: File tree truncated for brevity)'
  }
  
  return output
}
