import { rmSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import pkg from './package.json'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  rmSync('dist-electron', { recursive: true, force: true })

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG

  return {
    base: './',
    build: {
      chunkSizeWarningLimit: 3000,
    },
    resolve: {
      alias: {
        '@': path.join(__dirname, 'src')
      },
    },
    plugins: [
      react(),
      electron({
        main: {
          // Shortcut of `build.lib.entry`
          entry: 'electron/main/index.ts',
          onstart(args) {
            if (process.env.VSCODE_DEBUG) {
              console.log(/* For `.vscode/.debug.script.mjs` */'[startup] Electron App')
            } else {
              // On Windows, vite-plugin-electron uses `taskkill` to terminate the previous Electron process.
              // In some environments this can fail (pid not found / operation not supported) and crash `vite`.
              // When that happens, clear the stale handle and retry so `npm run dev` stays alive.
              void (async () => {
                try {
                  await args.startup()
                } catch (err) {
                  const msg = String((err as any)?.message ?? err)
                  if (process.platform === 'win32' && msg.toLowerCase().includes('taskkill')) {
                    console.warn('[startup] Ignoring taskkill failure; waiting 2s then retrying Electron startup.')
                    ;(process as any).electronApp = undefined
                    await new Promise((r) => setTimeout(r, 2000))
                    try {
                      await args.startup()
                    } catch (err2) {
                      console.error('[startup] Electron startup failed after retry.', err2)
                    }
                    return
                  }
                  console.error('[startup] Electron startup failed.', err)
                }
              })()
            }
          },
          vite: {
            build: {
              sourcemap,
              minify: isBuild,
              outDir: 'dist-electron/main',
              rollupOptions: {
                external: Object.keys('dependencies' in pkg ? pkg.dependencies : {}),
              },
            },
          },
        },
        preload: {
          // Shortcut of `build.rollupOptions.input`.
          // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
          input: 'electron/preload/index.ts',
          vite: {
            build: {
              sourcemap: sourcemap ? 'inline' : undefined, // #332
              minify: isBuild,
              outDir: 'dist-electron/preload',
              rollupOptions: {
                external: Object.keys('dependencies' in pkg ? pkg.dependencies : {}),
              },
            },
          },
        },
        // Ployfill the Electron and Node.js API for Renderer process.
        // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
        // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
        renderer: {},
      }),
    ],
    server: (() => {
      if (process.env.VSCODE_DEBUG) {
        const url = new URL(pkg.debug.env.VITE_DEV_SERVER_URL)
        return { host: url.hostname, port: +url.port }
      }
      return { port: 5173 }
    })(),
    clearScreen: false,
  }
})
