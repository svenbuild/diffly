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
let rendererErrors: string[] = []
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
  rendererErrors = []
  root = await mkdtemp(join(tmpdir(), 'diffly-e2e-'))
  left = join(root, 'left')
  right = join(root, 'right')
  await import('node:fs/promises').then(({ mkdir }) => Promise.all([
    mkdir(left), mkdir(right),
  ]))
  await writeFile(join(left, 'app.ts'), 'export const message = "old"\n')
  await writeFile(join(right, 'app.ts'), 'export const message = "new"\n')
  await launchWorkspace()
  page.on('pageerror', error => rendererErrors.push(error.stack ?? error.message))
})

test.afterEach(async () => {
  await page?.evaluate(() => window.diffly.workspaceLifecycle.respondToClose(true)).catch(() => undefined)
  await app?.close().catch(() => undefined)
  await rm(root, { recursive: true, force: true })
  expect(rendererErrors).toEqual([])
})

test('edits an inactive theme without selecting it and preserves both appearance drafts', async () => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  const selected = page.locator('.t3-theme-circle-button[aria-pressed="true"]')
  const before = await selected.evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')))
  const edit = page.getByRole('button', { name: 'Edit Absolutely', exact: true })
  await edit.click()
  const panel = page.getByRole('dialog', { name: 'Edit theme', exact: true })
  await expect(panel).toBeVisible()
  expect(await selected.evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')))).toEqual(before)
  await panel.getByRole('button', { name: 'Dark', exact: true }).click()
  await panel.getByRole('textbox', { name: 'Accent hex value', exact: true }).fill('#123456')
  await panel.getByRole('button', { name: 'Light', exact: true }).click()
  await panel.getByRole('textbox', { name: 'Accent hex value', exact: true }).fill('#abcdef')
  await panel.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect(panel.getByRole('textbox', { name: 'Accent hex value', exact: true })).toHaveValue('#123456')
  await panel.getByRole('button', { name: 'Save changes', exact: true }).click()
  expect(await selected.evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')))).toEqual(before)
  await edit.click()
  await panel.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect(panel.getByRole('textbox', { name: 'Accent hex value', exact: true })).toHaveValue('#123456')
  await panel.getByRole('button', { name: 'Light', exact: true }).click()
  await expect(panel.getByRole('textbox', { name: 'Accent hex value', exact: true })).toHaveValue('#abcdef')
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
})

test('creates a named theme without changing the current theme and restores it after reload', async () => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  await page.getByRole('button', { name: 'Create theme', exact: true }).click()
  const panel = page.getByRole('dialog', { name: 'Create theme', exact: true })
  await panel.getByPlaceholder('e.g. Aurora').fill('Audit theme')
  await panel.getByRole('button', { name: 'Dark', exact: true }).click()
  await panel.getByRole('textbox', { name: 'Accent hex value', exact: true }).fill('#13579b')
  await panel.getByRole('button', { name: 'Create theme', exact: true }).click()
  const useTheme = page.getByRole('button', { name: 'Use Audit theme for dark mode', exact: true })
  await expect(useTheme).toHaveAttribute('aria-pressed', 'false')
  await useTheme.click()
  await expect(useTheme).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => page.evaluate(() => window.diffly.loadSessionState())).toMatchObject({
    appearance: { customThemes: expect.arrayContaining([expect.objectContaining({ name: 'Audit theme' })]) },
  })
  await page.reload()
  await page.waitForFunction(() => {
    const harness = (window as unknown as { __difflyE2E?: { getState(): { screen: string; loading: boolean; directoryEntries: number } } }).__difflyE2E
    const state = harness?.getState()
    return state?.screen === 'compare' && !state.loading && state.directoryEntries > 0
  })
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Audit theme', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Edit theme', exact: true })
  await editor.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect(editor.getByRole('textbox', { name: 'Accent hex value', exact: true })).toHaveValue('#13579b')
})

test('compare settings render every section and keep the active comparison intact', async () => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  const navigation = page.getByRole('navigation', { name: 'Compare settings sections' })
  for (const section of ['Layout & context', 'Code rendering', 'Syntax & limits', 'Mouse & selection', 'Tree structure', 'Tree density', 'Tree search']) {
    await navigation.getByRole('button', { name: section, exact: true }).click()
    await expect(page.locator('.compare-settings-main .settings-row').first()).toBeVisible()
    await expect(page.locator('.settings-preview-host')).toBeVisible()
  }
  await expect(navigation.getByRole('button', { name: 'Tree mutations' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Close settings', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
})

test('theme inspector highlights app elements and cleans up on escape', async () => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Absolutely', exact: true }).click()
  const panel = page.getByRole('dialog', { name: 'Edit theme', exact: true })
  await panel.getByRole('button', { name: 'Inspect', exact: true }).click()
  const target = page.locator('.settings-section-link').first()
  await target.hover()
  await expect(page.locator('[data-theme-inspector-highlight]')).toBeVisible()
  await expect(page.locator('[data-theme-inspector-label]')).toHaveText(/Background|Surface|Text|Accent|Border/)
  await page.keyboard.press('Escape')
  await expect(page.locator('html')).not.toHaveClass(/theme-inspecting/)
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
})

test('overlay and input edits change only their corresponding UI surfaces', async () => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Diffly', exact: true }).click()
  const panel = page.getByRole('dialog', { name: 'Edit theme', exact: true })
  await panel.getByRole('switch', { name: 'Advanced', exact: true }).check()
  const surfaces = () => page.evaluate(() => {
    const bg = (selector: string) => getComputedStyle(document.querySelector(selector)!).backgroundColor
    return { overlay: bg('.t3-theme-editor-panel'), input: bg('.t3-editor-form-row input'), surface: bg('.t3-theme-card') }
  })
  const before = await surfaces()
  const heading = panel.locator('.t3-theme-editor-panel-heading strong')
  const previousTextColor = await heading.evaluate(element => getComputedStyle(element).color)
  await panel.getByRole('textbox', { name: 'Text hex value', exact: true }).fill('#d32a8f')
  await expect.poll(() => heading.evaluate(element => getComputedStyle(element).color)).not.toBe(previousTextColor)
  expect(await surfaces()).toEqual(before)
  await panel.getByRole('textbox', { name: 'Overlay hex value', exact: true }).fill('#13579b')
  await expect.poll(async () => (await surfaces()).overlay).not.toBe(before.overlay)
  const overlayChanged = await surfaces()
  expect(overlayChanged.input).toBe(before.input)
  expect(overlayChanged.surface).toBe(before.surface)
  await panel.getByRole('textbox', { name: 'Input hex value', exact: true }).fill('#2468ac')
  await expect.poll(async () => (await surfaces()).input).not.toBe(before.input)
  const inputChanged = await surfaces()
  expect(inputChanged.overlay).toBe(overlayChanged.overlay)
  expect(inputChanged.surface).toBe(before.surface)
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
})

test('resets built-in colors with cancel, live preview, and independent variants', async () => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  await page.getByRole('button', { name: 'Use dark mode', exact: true }).click()
  const edit = page.getByRole('button', { name: 'Edit Diffly', exact: true })
  await edit.click()
  const panel = page.getByRole('dialog', { name: 'Edit theme', exact: true })
  const accent = panel.getByRole('textbox', { name: 'Accent hex value', exact: true })
  const original = await accent.inputValue()
  await accent.fill('#123456')
  await panel.getByRole('button', { name: 'Light', exact: true }).click()
  await accent.fill('#abcdef')
  await panel.getByRole('button', { name: 'Save changes', exact: true }).click()
  await edit.click()
  await panel.getByRole('button', { name: 'Reset colors', exact: true }).click()
  await expect(accent).toHaveValue(original)
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase())).toBe(original.toLowerCase())
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
  await edit.click()
  await expect(accent).toHaveValue('#123456')
  await panel.getByRole('button', { name: 'Reset colors', exact: true }).click()
  await panel.getByRole('button', { name: 'Save changes', exact: true }).click()
  await edit.click()
  await expect(accent).toHaveValue(original)
  await panel.getByRole('button', { name: 'Light', exact: true }).click()
  await expect(accent).toHaveValue('#abcdef')
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect.poll(() => page.evaluate(async () => (await window.diffly.loadSessionState())?.appearance?.darkOverrides)).toEqual({})
})

for (const variant of ['light', 'dark'] as const) {
  test(`previews, saves, and restores all twelve ${variant} theme colors`, async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Appearance', exact: true }).click()
    await page.getByRole('button', { name: `Use ${variant} mode`, exact: true }).click()
    const originalAccent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent'))
    await page.getByRole('button', { name: 'Edit Diffly', exact: true }).click()
    const panel = page.getByRole('dialog', { name: 'Edit theme', exact: true })
    await panel.getByRole('switch', { name: 'Advanced', exact: true }).check()
    const fields = [
      ['Background', '--canvas', '#122334'], ['Surface', '--surface', '#233445'],
      ['Raised surface', '--surface-alt', '#344556'], ['Overlay', '--overlay-surface', '#455667'],
      ['Text', '--text', '#a1b2c3'], ['Muted text', '--muted', '#b2c3d4'],
      ['Border', '--border', '#566778'], ['Input', '--input-surface', '#677889'],
      ['Accent', '--accent', '#789abc'], ['Added changes', '--success', '#89abcd'],
      ['Removed changes', '--danger', '#9abcde'], ['Syntax accent', '--skill', '#abcdef'],
    ]
    for (const [label, variable, color] of fields) {
      await panel.getByRole('textbox', { name: `${label} hex value`, exact: true }).fill(color)
      await expect.poll(() => page.evaluate(variable => getComputedStyle(document.documentElement).getPropertyValue(variable).trim().toLowerCase(), variable)).toBe(color)
    }
    await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent'))).toBe(originalAccent)
    await page.getByRole('button', { name: 'Edit Diffly', exact: true }).click()
    await panel.getByRole('switch', { name: 'Advanced', exact: true }).check()
    for (const [label, , color] of fields) {
      await panel.getByRole('textbox', { name: `${label} hex value`, exact: true }).fill(color)
    }
    await panel.getByRole('button', { name: 'Save changes', exact: true }).click()
    await page.getByRole('button', { name: 'Edit Diffly', exact: true }).click()
    await panel.getByRole('switch', { name: 'Advanced', exact: true }).check()
    for (const [label, variable, color] of fields) {
      await expect(panel.getByRole('textbox', { name: `${label} hex value`, exact: true })).toHaveValue(new RegExp(`^${color}$`, 'i'))
      await expect.poll(() => page.evaluate(variable => getComputedStyle(document.documentElement).getPropertyValue(variable).trim().toLowerCase(), variable)).toBe(color)
    }
    await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('button', { name: 'Close settings', exact: true }).click()
    await expect.poll(() => page.evaluate(() => {
      function findKeyword(root: Document | ShadowRoot): string | null {
        for (const element of root.querySelectorAll('*')) {
          if (element.shadowRoot) {
            const found = findKeyword(element.shadowRoot)
            if (found) return found
          }
          if (element.tagName === 'SPAN' && element.textContent?.trim() === 'export') return getComputedStyle(element).color
        }
        return null
      }
      return findKeyword(document)
    })).toBe('rgb(171, 205, 239)')
  })
}

test('edits, undoes, redoes, and saves through the shared document workspace', async () => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const editor = page.getByRole('region', { name: /Editing/ })
  await expect(editor).toBeVisible()
  await expect(editor.getByRole('button', { name: 'Diff', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(editor.getByText('"old"', { exact: true })).toBeVisible()
  await expect(editor.getByText('"new"', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/edit-mode-split.png' })
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

test('keeps comparison tools optional and supports reset plus native editor shortcuts', async () => {
  await expect(page.getByRole('complementary', { name: 'Review workspace' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const editor = page.getByRole('region', { name: /Editing/ })
  const editable = editor.locator('[contenteditable="true"]').first()
  await editable.click()
  await page.keyboard.press(editorEndShortcut)
  await page.keyboard.type('// draft')
  await editor.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await editor.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  await editable.click()
  await page.keyboard.press('Control+Alt+f')
  await expect(page.getByRole('complementary', { name: 'Search entire comparison' })).toHaveCount(0)
  await expect(editor.getByPlaceholder('Search', { exact: true })).toBeVisible()
  await expect(editor.getByPlaceholder('Replace', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await editable.click()
  await page.keyboard.press('Control+s')
  await expect.poll(() => readFile(join(right, 'app.ts'), 'utf8')).toContain('// draft')
  await page.getByRole('button', { name: 'Switch to unified view', exact: true }).click()
  await expect(editor.locator('[contenteditable="true"]').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/edit-mode-unified.png' })
})

test('searches as you type without requiring an extra Find click', async () => {
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  const panel = page.getByRole('complementary', { name: 'Search entire comparison' })
  await panel.getByPlaceholder('Search comparison').fill('message')
  await expect(panel.locator('.workspace-search-results button').first()).toContainText('app.ts')
})

test('switches editable files without losing unsaved drafts or comparing the wrong side', async () => {
  await writeFile(join(left, 'second.ts'), 'export const second = "before"\n')
  await writeFile(join(right, 'second.ts'), 'export const second = "after"\n')
  await page.getByRole('button', { name: 'Reload compare', exact: true }).click()
  await page.getByRole('treeitem', { name: /second.ts/ }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  let editor = page.getByRole('region', { name: /Editing.*second.ts/ })
  await expect(editor.getByText('"before"', { exact: true })).toBeVisible()
  await editor.locator('[contenteditable="true"]').first().click()
  await page.keyboard.press(editorEndShortcut)
  await page.keyboard.type('// second draft')
  await page.getByRole('treeitem', { name: /app.ts/ }).click()
  editor = page.getByRole('region', { name: /Editing.*app.ts/ })
  await expect(editor.getByText('"old"', { exact: true })).toBeVisible()
  await page.getByRole('treeitem', { name: /second.ts/ }).click()
  editor = page.getByRole('region', { name: /Editing.*second.ts/ })
  await expect(editor.getByText('// second draft', { exact: true })).toBeVisible()
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => readFile(join(right, 'second.ts'), 'utf8')).toContain('// second draft')
  expect(await readFile(join(left, 'second.ts'), 'utf8')).toBe('export const second = "before"\n')
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
  await page.getByRole('button', { name: 'Comments', exact: true }).click()
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
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await page.getByRole('button', { name: 'Comments', exact: true }).click()
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

test('reviews inline with gutter comments, replies, and local hunk confirmation', async () => {
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Review workspace' })).toHaveCount(0)
  await page.locator('[data-column-number]').first().hover()
  await page.locator('[data-utility-button]').first().click()
  await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('Inline review\nSecond line')
  await page.getByRole('button', { name: 'Save comment', exact: true }).click()
  const thread = page.getByRole('region', { name: 'Review thread', exact: true })
  await expect(thread.getByText('Inline review', { exact: false })).toBeVisible()
  await thread.getByRole('textbox', { name: 'Reply', exact: true }).fill('Checked locally')
  await thread.getByRole('button', { name: 'Reply', exact: true }).click()
  await expect(thread.getByText('Checked locally')).toBeVisible()
  await thread.getByRole('button', { name: 'Resolve', exact: true }).click()
  await expect(thread.getByRole('button', { name: 'Reopen', exact: true })).toBeVisible()
  await thread.getByRole('button', { name: 'Reopen', exact: true }).click()
  await page.screenshot({ path: 'test-results/inline-review.png' })
  await page.getByRole('button', { name: 'Copy left → right', exact: true }).click()
  expect(await readFile(join(right, 'app.ts'), 'utf8')).toContain('new')
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect.poll(() => readFile(join(right, 'app.ts'), 'utf8')).toContain('old')
})
test('copies just one visible block when nearby changes share a patch hunk', async () => {
  await page.evaluate(() => window.diffly.workspaceLifecycle.respondToClose(true)).catch(() => undefined)
  await app.close().catch(() => undefined)
  await writeFile(join(left, 'app.ts'), 'context\nold first\nunchanged\nold second\ntail\n')
  await writeFile(join(right, 'app.ts'), 'context\nnew first\nunchanged\nnew second\ntail\n')
  await launchWorkspace()
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Accept left', exact: true })).toHaveCount(0)
  const changes = page.locator('.diffly-hunk-actions')
  await expect(changes).toHaveCount(2)
  await page.screenshot({ path: 'test-results/review-adjacent-blocks.png' })
  await changes.last().getByRole('button', { name: 'Copy left → right', exact: true }).click()
  await changes.last().getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect.poll(() => readFile(join(right, 'app.ts'), 'utf8'))
    .toBe('context\nnew first\nunchanged\nold second\ntail\n')
  await expect(changes).toHaveCount(1)
  await page.getByRole('button', { name: 'Undo last change', exact: true }).click()
  await expect.poll(() => readFile(join(right, 'app.ts'), 'utf8')).toContain('new second')
  await expect(changes).toHaveCount(2)
})
test('places actions on moved and deleted text rather than unchanged context', async () => {
  await page.evaluate(() => window.diffly.workspaceLifecycle.respondToClose(true)).catch(() => undefined)
  await app.close().catch(() => undefined)
  const section = (name: string) => ['# ' + name, '', ...Array.from({ length: 5 }, (_, i) => name + ' paragraph ' + i), ''].join('\n')
  await writeFile(join(left, 'app.ts'), section('Alpha') + section('Beta') + section('Gamma') + section('Delta'))
  await writeFile(join(right, 'app.ts'), section('Beta') + section('Alpha') + section('Delta'))
  await launchWorkspace()
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(page.locator('.diffly-hunk-actions').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete from left', exact: true }).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/review-reordered-blocks.png' })
})
