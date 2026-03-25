/**
 * Must be imported first. Defines CJS globals (__dirname, __filename, require)
 * on globalThis so bundled code that expects them works in ESM context.
 */
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)

const _g = globalThis as typeof globalThis & {
  __filename: string
  __dirname: string
  require: NodeRequire
}
_g.__filename = _filename
_g.__dirname = _dirname
_g.require = createRequire(import.meta.url)
