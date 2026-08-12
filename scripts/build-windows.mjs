import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const builderCli = fileURLToPath(new URL('../node_modules/electron-builder/cli.js', import.meta.url))
const attempts = 3
const fallbackElectronMirror = 'https://npmmirror.com/mirrors/electron/'
const fallbackBuilderMirror = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
const configuredElectronMirror = process.env.ELECTRON_MIRROR
const configuredBuilderMirror = process.env.ELECTRON_BUILDER_BINARIES_MIRROR

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const useFallback = attempt > 1
  const exitCode = await runBuilder({
    electronMirror: configuredElectronMirror || (useFallback ? fallbackElectronMirror : undefined),
    builderMirror: configuredBuilderMirror || (useFallback ? fallbackBuilderMirror : undefined),
  })
  if (exitCode === 0) process.exit(0)
  if (attempt === attempts) process.exit(exitCode)

  const delayMs = 5_000 * (2 ** (attempt - 1))
  console.warn(
    `Windows packaging failed (attempt ${attempt}/${attempts}); retrying with download mirrors in ${delayMs / 1_000}s.`,
  )
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}

function runBuilder({ electronMirror, builderMirror }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [builderCli, '--win', 'nsis', '--publish', 'never'], {
      env: {
        ...process.env,
        ...(electronMirror ? { ELECTRON_MIRROR: electronMirror } : {}),
        ...(builderMirror ? { ELECTRON_BUILDER_BINARIES_MIRROR: builderMirror } : {}),
      },
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
}
