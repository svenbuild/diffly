<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { File, getFiletypeFromFileName, type EditorState, type FileContents } from '@pierre/diffs'
  import type { Editor } from '@pierre/diffs/edit'
  import type { AppearanceSettings } from '../theme'
  import { buildPierreDiffUnsafeCss, resolvePierreDiffTheme } from '../theme/pierre'

  export let name: string
  export let contents: string
  export let renderRevision = 0
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let onChange: (contents: string, state: EditorState) => void = () => {}

  let host: HTMLDivElement | null = null
  let fileView: File | null = null
  let editor: Editor<undefined> | null = null
  let detachEditor: (() => void) | null = null
  let loading = true
  let error = ''
  let renderedKey = ''
  let historyRevision = 0
  let position = 'Ln 1, Col 1'

  $: canUndo = Boolean(editor?.canUndo) && historyRevision >= 0
  $: canRedo = Boolean(editor?.canRedo) && historyRevision >= 0

  onMount(() => {
    let cancelled = false
    void import('@pierre/diffs/edit').then(({ Editor }) => {
      if (cancelled || !host) return
      editor = new Editor({
        historyMaxEntries: 500,
        persistState: true,
        matchBrackets: true,
        autoSurround: 'default',
        enabledSelectionAction: true,
        clipboard: { readText: () => window.diffly.clipboard.readText() },
        onChange: (file) => {
          if (!editor) return
          const state = editor.getState()
          historyRevision += 1
          updatePosition(state)
          onChange(file.contents, state)
        },
      })
      render(true)
      editor.focus({ lineNumber: 'first-visible' })
      loading = false
    }).catch((reason) => {
      error = reason instanceof Error ? reason.message : 'Unable to load the conflict editor.'
      loading = false
    })
    return () => { cancelled = true }
  })

  onDestroy(() => {
    detachEditor?.()
    editor?.cleanUp()
    fileView?.cleanUp()
  })

  function render(force = false) {
    const key = `${renderRevision}:${resolvedThemeMode}:${JSON.stringify(appearanceSettings)}`
    if (!host || !editor || (!force && renderedKey === key)) return
    detachEditor?.()
    fileView?.cleanUp()
    fileView = new File({
      theme: resolvePierreDiffTheme(appearanceSettings),
      themeType: resolvedThemeMode,
      overflow: 'scroll',
      disableVirtualizationBuffers: false,
      unsafeCSS: buildPierreDiffUnsafeCss(appearanceSettings),
    })
    const file: FileContents = {
      name,
      contents,
      cacheKey: `conflict:${name}:${renderRevision}`,
      lang: getFiletypeFromFileName(name),
    }
    fileView.render({ file, containerWrapper: host })
    detachEditor = editor.edit(fileView)
    renderedKey = key
    updatePosition()
  }

  function updatePosition(state = editor?.getState()) {
    const selection = state?.selections?.[0]
    if (!selection) return
    const point = selection.direction === -1 ? selection.start : selection.end
    position = `Ln ${point.line + 1}, Col ${point.character + 1}`
  }

  function openFind(replace: boolean) {
    host?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: !navigator.platform.toLowerCase().includes('mac'),
      metaKey: navigator.platform.toLowerCase().includes('mac'),
      altKey: replace,
      bubbles: true,
    }))
  }

  function undo() { editor?.undo(); historyRevision += 1; updatePosition() }
  function redo() { editor?.redo(); historyRevision += 1; updatePosition() }

  $: renderRevision, appearanceSettings, resolvedThemeMode, render()
</script>

<section class="conflict-manual-editor" aria-label={`Editing conflict ${name}`}>
  <header>
    <button class="secondary" type="button" disabled={!canUndo} on:click={undo}>Undo</button>
    <button class="secondary" type="button" disabled={!canRedo} on:click={redo}>Redo</button>
    <button class="secondary" type="button" on:click={() => openFind(false)}>Find</button>
    <button class="secondary" type="button" on:click={() => openFind(true)}>Replace</button>
  </header>
  <div class="editor-host" bind:this={host}>
    {#if loading}<p>Loading editor…</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}
  </div>
  <footer><span>{position}</span><span>{getFiletypeFromFileName(name)}</span><span>{new TextEncoder().encode(contents).byteLength.toLocaleString()} bytes</span></footer>
</section>

<style>
  .conflict-manual-editor { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
  header, footer { display: flex; align-items: center; gap: 6px; padding: 6px 9px; border-bottom: 1px solid var(--border-color); background: var(--panel-surface); }
  footer { justify-content: flex-end; border-top: 1px solid var(--border-color); border-bottom: 0; color: var(--muted-text); font-size: 11px; }
  .editor-host { position: relative; min-height: 0; overflow: auto; }
  .editor-host > p { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted-text); }
  .editor-host > p.error { color: var(--diff-removed); }
</style>
