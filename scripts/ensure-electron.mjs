import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const installScript = fileURLToPath(new URL('../node_modules/electron/install.js', import.meta.url))
const attempts = 3
const fallbackMirror = 'https://npmmirror.com/mirrors/electron/'
const configuredMirror = process.env.ELECTRON_MIRROR

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const mirror = configuredMirror || (attempt > 1 ? fallbackMirror : undefined)
  const exitCode = await runInstaller(mirror)
  if (exitCode === 0) process.exit(0)
  if (attempt === attempts) process.exit(exitCode)

  const delayMs = 5_000 * (2 ** (attempt - 1))
  const nextSource = configuredMirror || fallbackMirror
  console.warn(
    `Electron installation failed (attempt ${attempt}/${attempts}); retrying from ${nextSource} in ${delayMs / 1_000}s.`,
  )
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}

function runInstaller(mirror) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [installScript], {
      env: mirror ? { ...process.env, ELECTRON_MIRROR: mirror } : process.env,
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
}
