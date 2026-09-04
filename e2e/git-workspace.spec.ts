import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
let app: ElectronApplication
let page: Page
let root: string
let userData: string

test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'diffly-git-e2e-'))
  userData = await mkdtemp(join(tmpdir(), 'diffly-git-e2e-user-'))
  await git(['init'])
  await git(['config', 'user.name', 'Diffly Test'])
  await git(['config', 'user.email', 'diffly@example.test'])
})

test.afterEach(async () => {
  await page?.evaluate(() => window.diffly.workspaceLifecycle.respondToClose(true)).catch(() => undefined)
  await app?.close().catch(() => undefined)
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  await rm(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

test('stages a selected hunk and refreshes only the active review entry', async () => {
  const path = join(root, 'file.txt')
  const original = Array.from({ length: 24 }, (_, index) => `line ${index + 1}`)
  await writeFile(path, `${original.join('\n')}\n`)
  await git(['add', '--', 'file.txt'])
  await git(['commit', '-m', 'base'])
  const changed = [...original]
  changed[1] = 'changed near start'
  changed[20] = 'changed near end'
  await writeFile(path, `${changed.join('\n')}\n`)

  await launchGitWorkspace()
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await page.getByRole('tab', { name: 'Changes', exact: true }).click()
  const panel = page.getByRole('complementary', { name: 'Hunk review' })
  await expect(panel.getByText('2 hunks')).toBeVisible()
  await panel.getByRole('button', { name: 'Stage', exact: true }).first().click()

  await expect.poll(async () => (await git(['diff', '--cached'])).stdout).toContain('changed near start')
  expect((await git(['diff', '--cached'])).stdout).not.toContain('changed near end')
  expect((await git(['diff'])).stdout).toContain('changed near end')
})

test('resolves a merge conflict with Current and stages the result', async () => {
  const path = join(root, 'file.txt')
  await writeFile(path, 'base\n')
  await git(['add', '--', 'file.txt'])
  await git(['commit', '-m', 'base'])
  const mainBranch = (await git(['branch', '--show-current'])).stdout.trim()
  await git(['checkout', '-b', 'incoming'])
  await writeFile(path, 'incoming\n')
  await git(['commit', '-am', 'incoming'])
  await git(['checkout', mainBranch])
  await writeFile(path, 'current\n')
  await git(['commit', '-am', 'current'])
  await git(['merge', 'incoming'], true)
  const conflictContents = await readFile(path, 'utf8')
  const expectedEol = conflictContents.includes('\r\n') ? '\r\n' : '\n'

  await launchGitWorkspace()
  await page.getByRole('button', { name: 'Resolve', exact: true }).click()
  await expect(page.getByText('0 of 1 conflicts resolved')).toBeVisible()
  await page.getByRole('button', { name: 'Accept current change', exact: true }).click()
  const finish = page.getByRole('button', { name: 'Resolve & Stage', exact: true })
  await expect(finish).toBeEnabled()
  await finish.click()

  await expect.poll(async () => (await git(['ls-files', '--unmerged'])).stdout).toBe('')
  expect(await readFile(path, 'utf8')).toBe(`current${expectedEol}`)
})

async function launchGitWorkspace() {
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  app = await electron.launch({
    args: ['.'],
    env: {
      ...environment,
      DIFFLY_E2E_GIT: root,
      DIFFLY_USER_DATA_DIR: userData,
    },
  })
  page = await app.firstWindow()
  await page.waitForFunction(() => (window as unknown as { __difflyE2E?: unknown }).__difflyE2E)
  await page.waitForFunction(() => {
    const state = (window as unknown as { __difflyE2E: { getState(): { screen: string; loading: boolean; directoryEntries: number } } }).__difflyE2E.getState()
    return state.screen === 'compare' && !state.loading && state.directoryEntries > 0
  })
}

async function git(args: string[], allowFailure = false) {
  try {
    return await execFileAsync('git', args, { cwd: root, windowsHide: true })
  } catch (error) {
    if (allowFailure && error && typeof error === 'object' && 'stdout' in error) {
      return { stdout: String(error.stdout), stderr: 'stderr' in error ? String(error.stderr) : '' }
    }
    throw error
  }
}
