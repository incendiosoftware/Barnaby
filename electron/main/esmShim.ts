/**
 * Must be imported first. Defines __dirname/__filename globally so any
 * bundled CJS code or dependencies that reference them work in ESM context.
 * Uses var so they become properties of the global object (same as CJS).
 */
import { fileURLToPath } from 'node:url'
import path from 'node:path'

var __filename = fileURLToPath(import.meta.url)
var __dirname = path.dirname(__filename)
