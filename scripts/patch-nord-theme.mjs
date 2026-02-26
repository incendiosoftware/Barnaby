import fs from 'fs'

const p = 'C:/Users/stuar/AppData/Roaming/Barnaby/.storage/app-state.json'
const d = JSON.parse(fs.readFileSync(p, 'utf8'))
const s = d.state
if (!s.themeOverrides) s.themeOverrides = {}
if (!s.themeOverrides['nord-light']) s.themeOverrides['nord-light'] = {}
Object.assign(s.themeOverrides['nord-light'], {
  accentSoft: '#f0f6ff',
  assistantBubbleBgLight: '#f0f0f0',
  thinkingProgress: '#082cdd',
})
fs.writeFileSync(p, JSON.stringify(d, null, 2))
console.log('nord-light overrides patched')
