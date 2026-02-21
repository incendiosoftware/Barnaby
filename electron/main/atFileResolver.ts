import fs from 'node:fs'
import path from 'node:path'

const MAX_FILE_SIZE = 100 * 1024 // 100 KB cap per inlined file

/**
 * Scans a message for @filepath references (e.g. @src/App.tsx) and returns
 * a block of text containing the contents of each resolved file.
 * Unresolvable paths are silently skipped.
 */
export function resolveAtFileReferences(message: string, cwd: string): string {
  const pattern = /(?:^|\s)@([\w./-]+(?:\.[\w]+))/g
  const seen = new Set<string>()
  const sections: string[] = []
  let match: RegExpExecArray | null

  while ((match = pattern.exec(message)) !== null) {
    const ref = match[1]
    if (seen.has(ref)) continue
    seen.add(ref)

    const absolute = path.isAbsolute(ref) ? ref : path.resolve(cwd, ref)
    try {
      const stat = fs.statSync(absolute)
      if (!stat.isFile()) continue
      if (stat.size > MAX_FILE_SIZE) {
        sections.push(`--- ${ref} (truncated, ${Math.round(stat.size / 1024)} KB) ---\n${fs.readFileSync(absolute, 'utf8').slice(0, MAX_FILE_SIZE)}\n...`)
        continue
      }
      const content = fs.readFileSync(absolute, 'utf8')
      sections.push(`--- ${ref} ---\n${content}`)
    } catch {
      // File not found or unreadable -- skip silently
    }
  }

  return sections.length > 0 ? '\n\nReferenced file contents:\n\n' + sections.join('\n\n') : ''
}
