import { execSync } from 'node:child_process'

function run(cmd) {
  try {
    execSync(cmd, { stdio: 'pipe', windowsHide: true })
  } catch {
    // best effort cleanup only
  }
}

if (process.platform === 'win32') {
  // Free Vite default port if stale process is still attached.
  run(
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = netstat -ano | Select-String ':5173' | ForEach-Object { ($_ -split '\\s+')[-1] } | Sort-Object -Unique; foreach ($id in $p) { try { Stop-Process -Id ([int]$id) -Force -ErrorAction Stop } catch {} }"`,
  )

  // Kill stale Electron instances from this workspace.
  run(
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*AgentOrchestrator*\\\\node_modules\\\\electron\\\\dist\\\\electron.exe' } | ForEach-Object { try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch {} }"`,
  )
} else {
  // Unix-like fallback: free 5173 and terminate matching electron instances.
  run(`sh -lc "lsof -ti :5173 | xargs -r kill -9"`)
  run(`sh -lc "ps aux | grep '[e]lectron' | grep 'AgentOrchestrator' | awk '{print $2}' | xargs -r kill -9"`)
}

console.log('dev-clean completed')
