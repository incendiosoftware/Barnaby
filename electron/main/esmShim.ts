/**
 * Must be imported first. Defines __dirname/__filename on globalThis so any
 * bundled code that expects Node CJS globals works in ESM context.
 * (Top-level `var` in an ES module is module-scoped, not global.)
 */
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)
;(globalThis as typeof globalThis & { __filename: string; __dirname: string }).__filename = _filename
;(globalThis as typeof globalThis & { __filename: string; __dirname: string }).__dirname = _dirname
