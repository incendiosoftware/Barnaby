import type { WorkspaceTreeNode } from '../types'

export function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function formatToolTrace(raw: string): string {
  const colonIdx = raw.indexOf(':')
  if (colonIdx < 0) return raw
  const tool = raw.slice(0, colonIdx).trim().toLowerCase()
  const detail = raw.slice(colonIdx + 1).trim()
  const shortPath = (p: string) => {
    const parts = p.replace(/\\/g, '/').split('/')
    return parts.length > 3 ? `.../${parts.slice(-3).join('/')}` : p
  }
  const shortCmd = (c: string) => {
    const clean = c.replace(/\s+/g, ' ').trim()
    return clean.length > 80 ? clean.slice(0, 77) + '...' : clean
  }
  if (/^(read_file|read|readfile|read_workspace_file|view_file)$/i.test(tool)) {
    return `Read ${shortPath(detail)}`
  }
  if (/^(write_file|write|writefile|write_workspace_file|create_file)$/i.test(tool)) {
    return `Write ${shortPath(detail)}`
  }
  if (/^(edit|edit_file|patch|str_replace_editor|apply_diff)$/i.test(tool)) {
    return `Edit ${shortPath(detail)}`
  }
  if (/^(bash|shell|run_command|run_shell_command|terminal|execute)$/i.test(tool)) {
    return `Ran ${shortCmd(detail)}`
  }
  if (/^(grep|rg|search|search_workspace|ripgrep|find_in_files)$/i.test(tool)) {
    return `Searched for "${detail.length > 60 ? detail.slice(0, 57) + '...' : detail}"`
  }
  if (/^(glob|find|list_dir|list_directory|list_workspace_tree|ls|tree)$/i.test(tool)) {
    return `Listed ${shortPath(detail) || 'directory'}`
  }
  if (/^(web_search|browser|fetch|curl)$/i.test(tool)) {
    return `Fetched ${detail.length > 60 ? detail.slice(0, 57) + '...' : detail}`
  }
  const cleanTool = raw
    .slice(0, colonIdx)
    .trim()
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
  return `${cleanTool}: ${detail.length > 70 ? detail.slice(0, 67) + '...' : detail}`
}

/**
 * Pre-process markdown to auto-link bare file paths so they become clickable.
 * Skips fenced code blocks and inline code spans.
 */
export function linkifyFilePathsInMarkdown(md: string): string {
  // Common source/doc file extensions worth linkifying
  const EXT = /\.(tsx?|jsx?|mjs|cjs|json|ya?ml|toml|md|mdx|css|scss|less|html?|vue|svelte|py|rs|go|java|kt|rb|sh|bat|ps1|sql|graphql|gql|proto|txt|cfg|ini|env|lock|log|xml|svg|png|jpg|jpeg|gif|ico|woff2?|ttf|eot)$/i
  // Match file-path-like tokens: must contain a `/` or `\` and end with a known extension
  // Also allow Windows absolute paths like C:\foo\bar.ts
  const PATH_RE = /(?:[a-zA-Z]:[\\/])?(?:[\w.@~-]+[\\/])+[\w.@~-]+\.\w+(?::\d+(?::\d+)?)?/g

  const lines = md.split('\n')
  let inFence = false
  const result: string[] = []

  for (const line of lines) {
    if (/^```/.test(line.trimStart())) {
      inFence = !inFence
      result.push(line)
      continue
    }
    if (inFence) {
      result.push(line)
      continue
    }
    // Process this line - replace file paths outside of backtick spans and existing markdown links
    result.push(linkifyPathsInLine(line, PATH_RE, EXT))
  }
  return result.join('\n')
}

function linkifyPathsInLine(line: string, pathRe: RegExp, extRe: RegExp): string {
  // Split the line into segments: backtick code spans, markdown links, and plain text
  // We only linkify within plain text segments
  const segments: { text: string; isProtected: boolean }[] = []
  let lastIndex = 0
  // Match inline code (`...`) and markdown links ([...](...))
  const protectedRe = /`[^`]+`|\[[^\]]*\]\([^)]*\)/g
  let m: RegExpExecArray | null
  while ((m = protectedRe.exec(line)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ text: line.slice(lastIndex, m.index), isProtected: false })
    }
    segments.push({ text: m[0], isProtected: true })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < line.length) {
    segments.push({ text: line.slice(lastIndex), isProtected: false })
  }

  return segments
    .map((seg) => {
      if (seg.isProtected) return seg.text
      return seg.text.replace(pathRe, (match) => {
        // Strip trailing line:col for extension check
        const pathOnly = match.replace(/:\d+(?::\d+)?$/, '')
        if (!extRe.test(pathOnly)) return match
        return `[${match}](${pathOnly})`
      })
    })
    .join('')
}

export function fileNameFromRelativePath(relativePath: string) {
  const parts = relativePath.split('/')
  return parts[parts.length - 1] || relativePath
}

export function toLocalFileUrl(filePath: string) {
  const normalized = String(filePath ?? '').replace(/\\/g, '/')
  if (!normalized) return ''
  if (/^file:\/\//i.test(normalized)) return normalized
  if (normalized.startsWith('//')) return `file:${encodeURI(normalized)}`
  if (/^[a-zA-Z]:\//.test(normalized)) return `file:///${encodeURI(normalized)}`
  if (normalized.startsWith('/')) return `file://${encodeURI(normalized)}`
  return encodeURI(normalized)
}

export function normalizeWorkspacePathForCompare(value: string) {
  return value.trim().replace(/\//g, '\\').toLowerCase()
}

export function decodeUriComponentSafe(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function stripLinkQueryAndHash(value: string) {
  const q = value.indexOf('?')
  const h = value.indexOf('#')
  const end = Math.min(q >= 0 ? q : Number.POSITIVE_INFINITY, h >= 0 ? h : Number.POSITIVE_INFINITY)
  return Number.isFinite(end) ? value.slice(0, end) : value
}

export function stripFileLineAndColumnSuffix(pathLike: string) {
  const m = pathLike.match(/^(.*?)(?::\d+)(?::\d+)?$/)
  return m?.[1] ? m[1] : pathLike
}

export function normalizeWorkspaceRelativePath(pathLike: string): string | null {
  const normalized = pathLike
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\.\/+/, '')
    .trim()
  if (!normalized || normalized.startsWith('/')) return null
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length === 0) return null
  if (segments.some((segment) => segment === '.' || segment === '..')) return null
  return segments.join('/')
}

export function toWorkspaceRelativePathIfInsideRoot(workspaceRoot: string, absolutePath: string): string | null {
  const root = workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!root) return null
  let target = absolutePath.replace(/\\/g, '/')
  if (/^\/[a-zA-Z]:\//.test(target)) target = target.slice(1)
  const rootCompare = root.toLowerCase()
  const targetCompare = target.toLowerCase()
  if (targetCompare === rootCompare) return null
  if (!targetCompare.startsWith(`${rootCompare}/`)) return null
  return normalizeWorkspaceRelativePath(target.slice(root.length + 1))
}

export function resolveWorkspaceRelativePathFromChatHref(workspaceRoot: string, href: string): string | null {
  const rawHref = String(href ?? '').trim()
  if (!workspaceRoot || !rawHref || rawHref.startsWith('#')) return null
  const withoutQueryOrHash = stripLinkQueryAndHash(rawHref)
  if (!withoutQueryOrHash) return null
  const decoded = decodeUriComponentSafe(stripFileLineAndColumnSuffix(withoutQueryOrHash)).replace(/\\/g, '/')
  if (!decoded) return null
  if (/^file:\/\//i.test(decoded)) {
    try {
      const parsed = new URL(decoded)
      let filePath = decodeUriComponentSafe(parsed.pathname || '')
      if (parsed.host) filePath = `//${parsed.host}${filePath}`
      return toWorkspaceRelativePathIfInsideRoot(workspaceRoot, filePath)
    } catch {
      return null
    }
  }
  const isWindowsAbsolute = /^[a-zA-Z]:\//.test(decoded)
  const hasUriScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(decoded)
  if (hasUriScheme && !isWindowsAbsolute) return null
  if (isWindowsAbsolute || decoded.startsWith('/')) {
    return toWorkspaceRelativePathIfInsideRoot(workspaceRoot, decoded)
  }
  return normalizeWorkspaceRelativePath(decoded)
}

export function collectDirectoryPaths(nodes: WorkspaceTreeNode[]): string[] {
  const paths: string[] = []
  const walk = (items: WorkspaceTreeNode[]) => {
    for (const item of items) {
      if (item.type !== 'directory') continue
      paths.push(item.relativePath)
      if (item.children?.length) walk(item.children)
    }
  }
  walk(nodes)
  return paths
}
