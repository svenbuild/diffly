const { existsSync } = require('node:fs')
const path = require('node:path')
const { rcedit } = require('rcedit')

module.exports = async function setWindowsIcon(context) {
  if (context.electronPlatformName !== 'win32') {
    return
  }

  const iconPath = path.join(context.packager.projectDir, 'build', 'icons', 'icon.ico')
  const executablePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)

  if (!existsSync(iconPath) || !existsSync(executablePath)) {
    return
  }

  await rcedit(executablePath, {
    icon: iconPath,
  })
}
