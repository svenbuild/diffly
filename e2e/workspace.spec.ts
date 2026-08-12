import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

let app: ElectronApplication
let page: Page
let root: string
let left: string
let right: string
const editorEndShortcut = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End'
const execFileAsync = promisify(execFile)

async function launchWorkspace() {
  const appEnvironment = { ...process.env }
  delete appEnvironment.ELECTRON_RUN_AS_NODE
  app = await electron.launch({
    args: ['.'],
    env: {
      ...appEnvironment,
      DIFFLY_E2E_LEFT: left,
      DIFFLY_E2E_RIGHT: right,
      DIFFLY_USER_DATA_DIR: join(root, 'user-data'),
    },
  })
  page = await app.firstWindow()
  await page.waitForFunction(() => (window as unknown as { __difflyE2E?: unknown }).__difflyE2E)
  await page.waitForFunction(() => {
    const state = (window as unknown as { __difflyE2E: { getState(): { screen: string; loading: boolean; directoryEntries: number } } }).__difflyE2E.getState()
    return state.screen === 'compare' && !state.loading && state.directoryEntries > 0
  })
}

async function terminateWorkspaceAbruptly() {
  const child = app.process()
  if (child.exitCode !== null) return
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  if (process.platform === 'win32') {
    await execFileAsync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
  } else {
    child.kill('SIGKILL')
  }
  await exited
}

test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'diffly-e2e-'))
  left = join(root, 'left')
  right = join(root, 'right')
  await import('node:fs/promises').then(({ mkdir }) => Promise.all([
    mkdir(left), mkdir(right),
  ]))
  await writeFile(join(left, 'app.ts'), 'export const message = "old"\n')
  await writeFile(join(right, 'app.ts'), 'export const message = "new"\n')
  await launchWorkspace()
})

test.afterEach(async () => {
  await page?.evaluate(() => window.diffly.workspaceLifecycle.respondToClose(true)).catch(() => undefined)
  await app?.close().catch(() => undefined)
  await rm(root, { recursive: true, force: true })
})

test('edits, undoes, redoes, and saves through the shared document workspace', async () => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const editor = page.getByRole('region', { name: /Editing/ })
  await expect(editor).toBeVisible()
  const editable = editor.locator('[contenteditable="true"]').first()
  await editable.click()
  await page.keyboard.press(editorEndShortcut)
  await page.keyboard.type('// e2e')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => readFile(join(right, 'app.ts'), 'utf8')).toContain('// e2e')
  await page.waitForFunction(() => {
    const state = (window as unknown as { __difflyE2E: { getState(): { activeDocumentDirty: boolean; activeDocumentSaving: boolean } } }).__difflyE2E.getState()
    return !state.activeDocumentDirty && !state.activeDocumentSaving
  })
  await expect(editor.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()

  await editable.click()
  await page.keyboard.press(editorEndShortcut)
  await page.keyboard.type('\n// diff edit')
  await editor.getByRole('button', { name: 'Diff', exact: true }).click()
  await expect(editor.locator('[contenteditable="true"]').first()).toBeVisible()
  await expect(editor.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => readFile(join(right, 'app.ts'), 'utf8')).toContain('// diff edit')
})

test('searches the entire comparison and navigates a virtualized result', async () => {
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  const panel = page.getByRole('complementary', { name: 'Search entire comparison' })
  await panel.getByPlaceholder('Search comparison').fill('message')
  await panel.getByRole('button', { name: 'Find', exact: true }).click()
  await expect(panel.getByText(/results/)).toBeVisible()
  await expect(panel.locator('.workspace-search-results button').first()).toContainText('app.ts')
})

test('previews and applies a revision-checked workspace replacement', async () => {
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  const panel = page.getByRole('complementary', { name: 'Search entire comparison' })
  await panel.getByPlaceholder('Search comparison').fill('new')
  await panel.getByRole('button', { name: 'Replace…' }).click()
  await panel.getByPlaceholder('Replace with').fill('updated')
  await panel.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(panel.getByText('1 replacements in 1 files')).toBeVisible()
  await panel.getByRole('button', { name: 'Replace in 1 files' }).click()
  await expect.poll(() => readFile(join(right, 'app.ts'), 'utf8')).toContain('updated')
  await expect.poll(() => readFile(join(left, 'app.ts'), 'utf8')).toContain('old')
})

test('creates, replies to, resolves, and reopens a persistent review thread', async () => {
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  const review = page.getByRole('region', { name: 'Review threads' })
  await review.getByPlaceholder('Add a multiline review comment…').fill('Please verify this change.')
  await review.getByRole('button', { name: 'Start thread' }).click()
  await expect(review.getByText('Please verify this change.')).toBeVisible()
  await review.getByPlaceholder('Reply…').fill('Verified.')
  await review.getByRole('button', { name: 'Reply', exact: true }).click()
  await expect(review.getByText('Verified.')).toBeVisible()
  await review.getByRole('button', { name: 'Resolve', exact: true }).click()
  await review.getByRole('combobox', { name: 'Filter review threads' }).selectOption('resolved')
  await review.getByRole('button', { name: 'Reopen', exact: true }).click()

  await page.evaluate(() => window.diffly.workspaceLifecycle.respondToClose(true)).catch(() => undefined)
  await app.close().catch(() => undefined)
  await launchWorkspace()
  const restored = page.getByRole('region', { name: 'Review threads' })
  await expect(restored.getByText('Please verify this change.')).toBeVisible()
  await expect(restored.getByText('Verified.')).toBeVisible()
})

test('guards window close while an editor draft is dirty', async () => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const editable = page.locator('[contenteditable="true"]').first()
  await editable.click()
  await page.keyboard.press(editorEndShortcut)
  await page.keyboard.type('// unsaved')

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  const dialog = page.getByRole('dialog', { name: 'Unsaved changes' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('region', { name: /Editing/ })).toBeVisible()

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  const closed = page.waitForEvent('close')
  await dialog.getByRole('button', { name: 'Discard All', exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click())
    .catch(() => undefined)
  await closed
})

test('recovers a debounced editor draft after an unclean shutdown', async () => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const editable = page.locator('[contenteditable="true"]').first()
  await editable.click()
  await page.keyboard.press(editorEndShortcut)
  await page.keyboard.type('// crash draft')

  const manifest = join(root, 'user-data', 'drafts', 'manifest.json')
  await expect.poll(async () => {
    try {
      return (JSON.parse(await readFile(manifest, 'utf8')) as { drafts?: unknown[] }).drafts?.length ?? 0
    } catch {
      return 0
    }
  }).toBe(1)

  await terminateWorkspaceAbruptly()
  await launchWorkspace()

  const recovery = page.getByRole('dialog', { name: /unsaved document.*recovered/i })
  await expect(recovery).toBeVisible()
  await recovery.getByRole('button', { name: 'Restore all', exact: true }).click()
  const restored = page.getByRole('region', { name: /Editing/ })
  await expect(restored).toBeVisible()
  await expect(restored.locator('[contenteditable="true"]').first()).toContainText('// crash draft')
})
