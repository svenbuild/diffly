import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const installScript = fileURLToPath(new URL('../node_modules/electron/install.js', import.meta.url))
const attempts = 3

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const exitCode = await runInstaller()
  if (exitCode === 0) process.exit(0)
  if (attempt === attempts) process.exit(exitCode)

  const delayMs = 5_000 * (2 ** (attempt - 1))
  console.warn(`Electron installation failed (attempt ${attempt}/${attempts}); retrying in ${delayMs / 1_000}s.`)
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}

function runInstaller() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [installScript], {
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
}
