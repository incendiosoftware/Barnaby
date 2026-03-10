const fs = require('node:fs')
const path = require('node:path')

/**
 * Patch the packed app executable icon before artifacts (portable/nsis) are produced.
 * This avoids mutating the final portable SFX, which rcedit corrupts.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const { rcedit } = await import('rcedit')
  const exeName = `${context.packager.appInfo.productFilename}.exe`
  const exePath = path.join(context.appOutDir, exeName)
  const iconPath = path.join(context.packager.projectDir, 'build', 'icon.ico')

  if (!fs.existsSync(iconPath)) {
    console.warn('[afterPack] icon missing, skipping:', iconPath)
    return
  }
  if (!fs.existsSync(exePath)) {
    console.warn('[afterPack] app exe missing, skipping:', exePath)
    return
  }

  await rcedit(exePath, { icon: iconPath })
  console.log('[afterPack] Applied icon to', exePath)
}
