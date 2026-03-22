import { app, BrowserWindow, shell } from 'electron'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { appendRuntimeLog, errorMessage } from './logger'
import { getReleaseVersion } from './utils'
import { isDirectory } from './storageUtils'

let win: BrowserWindow | null = null
let splashWin: BrowserWindow | null = null
let startupRevealTimer: ReturnType<typeof setTimeout> | null = null
let mainWindowReadyToShow = false
let rendererStartupReady = false
let waitForRendererStartup = false
let mainWindowRevealed = false

export function getMainWindow() { return win }
export function setMainWindow(v: BrowserWindow | null) { win = v }

export function getSplashWindow() { return splashWin }
export function setSplashWindow(v: BrowserWindow | null) { splashWin = v }

export function setMainWindowReadyToShow(v: boolean) { mainWindowReadyToShow = v }
export function setRendererStartupReady(v: boolean) { rendererStartupReady = v }
export function setWaitForRendererStartup(v: boolean) { waitForRendererStartup = v }
export function isMainWindowRevealed() { return mainWindowRevealed }

export function getWindowWorkspaceLabel(workspaceRoot: string) {
  const trimmed = workspaceRoot.trim()
  if (!trimmed) return 'No workspace'
  const normalized = trimmed.replace(/[\\/]+$/, '')
  const baseName = path.basename(normalized)
  return baseName || normalized
}

export function getMainWindowTitle(workspaceRoot: string) {
  const version = getReleaseVersion()
  const titleSuffix = process.env.VITE_DEV_SERVER_URL ? `(DEV ${version})` : `(v${version})`
  return `Barnaby ${titleSuffix} - ${getWindowWorkspaceLabel(workspaceRoot)}`
}

export function clearStartupRevealTimer() {
  if (!startupRevealTimer) return
  clearTimeout(startupRevealTimer)
  startupRevealTimer = null
}

export function setStartupRevealTimer(timer: ReturnType<typeof setTimeout> | null) {
  startupRevealTimer = timer
}

export function closeSplashWindow() {
  if (!splashWin) return
  if (!splashWin.isDestroyed()) splashWin.close()
  splashWin = null
}

export function revealMainWindow() {
  if (!win || mainWindowRevealed) return
  mainWindowRevealed = true
  clearStartupRevealTimer()
  closeSplashWindow()
  win.maximize()
  win.show()
}

export function maybeRevealMainWindow() {
  if (!win) return
  if (mainWindowRevealed) return
  if (!mainWindowReadyToShow) return
  if (waitForRendererStartup && !rendererStartupReady) return
  revealMainWindow()
}

export function splashFallbackHtmlDataUrl(splashImagePath: string) {
  let splashImageUrl = ''
  try {
    if (fs.existsSync(splashImagePath)) {
      const splashImageBase64 = fs.readFileSync(splashImagePath).toString('base64')
      splashImageUrl = `data:image/png;base64,${splashImageBase64}`
    }
  } catch (err) {
    appendRuntimeLog('splash-image-base64-failed', { splashImagePath, error: errorMessage(err) }, 'warn')
  }

  const version = getReleaseVersion()
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Barnaby Splash</title>
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: #0b0b0b;
      overflow: hidden;
    }
    .root {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    img {
      max-width: 90%;
      max-height: 90%;
      object-fit: contain;
      user-select: none;
      -webkit-user-drag: none;
    }
    .version {
      position: fixed;
      bottom: 8px;
      right: 12px;
      font-size: 11px;
      color: white;
      font-family: system-ui, sans-serif;
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <div class="root">
    ${splashImageUrl ? `<img src="${splashImageUrl}" alt="Barnaby splash" />` : ''}
  </div>
  <div class="version">${String(version).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
</body>
</html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

export function createSplashWindow() {
  const publicRoot = process.env.VITE_PUBLIC
  if (!publicRoot) {
    appendRuntimeLog('splash-skipped', { reason: 'vite-public-missing' }, 'warn')
    return null
  }
  const splashImagePath = path.join(publicRoot, 'splash.png')
  const splashHtmlPath = path.join(publicRoot, 'splash.html')
  if (!fs.existsSync(splashImagePath)) {
    appendRuntimeLog('splash-skipped', { reason: 'splash-image-missing', splashImagePath }, 'warn')
    return null
  }
  const hasSplashHtml = fs.existsSync(splashHtmlPath)

  const splash = new BrowserWindow({
    width: 560,
    height: 360,
    center: true,
    show: true,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0b0b0b',
    autoHideMenuBar: true,
  })
  splash.setMenuBarVisibility(false)
  const injectSplashVersion = () => {
    splash.webContents
      .executeJavaScript(
        `(function(){var el=document.getElementById('version');if(el)el.textContent=${JSON.stringify(getReleaseVersion())};})()`,
      )
      .catch(() => { })
  }
  if (hasSplashHtml) {
    splash.webContents.once('did-finish-load', injectSplashVersion)
    void splash.loadFile(splashHtmlPath).catch((err) => {
      appendRuntimeLog('splash-loadfile-failed', { splashHtmlPath, error: errorMessage(err) }, 'warn')
      void splash.loadURL(splashFallbackHtmlDataUrl(splashImagePath)).catch(() => { })
    })
  } else {
    appendRuntimeLog('splash-html-missing-fallback', { splashHtmlPath }, 'warn')
    void splash.loadURL(splashFallbackHtmlDataUrl(splashImagePath)).catch((err) => {
      appendRuntimeLog('splash-fallback-loadurl-failed', { splashImagePath, error: errorMessage(err) }, 'warn')
    })
  }
  splash.on('closed', () => {
    if (splashWin === splash) splashWin = null
  })
  return splash
}

export function relaunchArgsForNewWorkspace(workspaceRoot: string): string[] {
  const cleaned = process.argv.filter((arg) => {
    const value = String(arg ?? '')
    if (!value) return false
    return !(value === '--workspace-root' || value.startsWith('--workspace-root='))
  })
  const baseArgs = process.defaultApp ? cleaned.slice(1) : cleaned.slice(1)
  return [...baseArgs, '--workspace-root', workspaceRoot]
}

export function openWorkspaceInNewBarnabyInstance(workspaceRoot: string): { ok: boolean; error?: string } {
  const resolvedRoot = path.resolve(workspaceRoot)
  if (!isDirectory(resolvedRoot)) return { ok: false, error: 'Workspace folder does not exist.' }
  const args = relaunchArgsForNewWorkspace(resolvedRoot)
  try {
    const child = spawn(process.execPath, args, {
      cwd: resolvedRoot,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

export function readStartupWorkspaceRoot(argv: string[]): string {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] ?? '')
    if (!arg) continue
    if (arg.startsWith('--workspace-root=')) {
      const raw = arg.slice('--workspace-root='.length).trim()
      return raw ? path.resolve(raw) : ''
    }
    if (arg === '--workspace-root') {
      const next = String(argv[i + 1] ?? '').trim()
      return next ? path.resolve(next) : ''
    }
  }
  return ''
}
