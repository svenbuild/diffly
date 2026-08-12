import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const builderCli = fileURLToPath(new URL('../node_modules/electron-builder/cli.js', import.meta.url))
const attempts = 3

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const exitCode = await runBuilder()
  if (exitCode === 0) process.exit(0)
  if (attempt === attempts) process.exit(exitCode)

  const delayMs = 5_000 * (2 ** (attempt - 1))
  console.warn(
    `Windows packaging failed (attempt ${attempt}/${attempts}); retrying in ${delayMs / 1_000}s.`,
  )
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}

function runBuilder() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [builderCli, '--win', 'nsis', '--publish', 'never'], {
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
}
