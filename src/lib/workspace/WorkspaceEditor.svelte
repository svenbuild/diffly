<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { File, FileDiff, getFiletypeFromFileName, type FileContents } from '@pierre/diffs'
  import type { Editor } from '@pierre/diffs/edit'
  import { openDiffEntry } from '../api'
  import type { AppearanceSettings } from '../theme'
  import { buildPierreDiffUnsafeCss, resolvePierreDiffTheme } from '../theme/pierre'
  import { workspaceDocumentController } from './document-controller'
  import type { WorkspaceDocumentState } from './document-store'

  export let state: WorkspaceDocumentState
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let viewMode: 'sideBySide' | 'unified' = 'sideBySide'
  export let onSaved: () => Promise<void> | void = () => {}
  export let reviewSessionId = ''
  export let reviewEntryId = ''
  export let opening = false
  export let onSurfaceChange: (surface: 'diff' | 'file') => void = () => {}

  let host: HTMLDivElement
  let editor: Editor<undefined> | null = null
  let fileView: File | FileDiff | null = null
  let detach: (() => void) | null = null
  let surface: 'diff' | 'file' = 'diff'
  $: onSurfaceChange(surface)
  let baseline: FileContents | null = null
  let loading = true
  let error = ''
  let ready = false
  let generation = 0
  let readyFrame: number | null = null
  let requestedDocument = ''
  let renderedKey = ''
  let historyRevision = 0
  let handledFocusRevision = -1

  $: canUndo = ready && Boolean(editor?.canUndo) && historyRevision >= 0
  $: canRedo = ready && Boolean(editor?.canRedo) && historyRevision >= 0
  $: documentKey = `${state.id}:${reviewSessionId}:${reviewEntryId}`
  $: if (editor && requestedDocument !== documentKey) {
    requestedDocument = documentKey
    void loadComparison()
  }
  $: renderKey = `${documentKey}:${state.renderRevision}:${surface}:${viewMode}:${resolvedThemeMode}:${JSON.stringify(appearanceSettings)}`
  $: if (editor && baseline && !loading && renderKey !== renderedKey) renderDocument(renderKey)
  $: if (ready && editor && handledFocusRevision !== state.focusRevision) {
    handledFocusRevision = state.focusRevision
    editor.setState({ selections: state.selections })
    const selection = state.selections[0]
    if (selection) editor.focus({ lineNumber: selection.start.line + 1, character: selection.start.character })
  }

  onMount(() => {
    let cancelled = false
    void import('@pierre/diffs/edit').then(({ Editor }) => {
      if (cancelled) return
      editor = new Editor({
        persistState: true, historyMaxEntries: 500, matchBrackets: true,
        autoSurround: 'default', enabledSelectionAction: false,
        clipboard: { readText: () => window.diffly.clipboard.readText() },
        onChange: file => {
          if (!editor) return
          const current = editor.getState()
          workspaceDocumentController.updateContents(state.id, file.contents, {
            selections: current.selections, scrollTop: current.view?.scrollTop,
          })
          historyRevision += 1
        },
      })
    }).catch(cause => { error = message(cause); loading = false })
    return () => { cancelled = true }
  })

  onDestroy(() => {
    generation += 1
    if (readyFrame !== null) cancelAnimationFrame(readyFrame)
    detach?.()
    editor?.cleanUp()
    fileView?.cleanUp()
    editor = null
  })

  function message(cause: unknown) {
    return cause instanceof Error ? cause.message : String(cause)
  }

  async function loadComparison() {
    const request = ++generation
    loading = true
    ready = false
    error = ''
    baseline = null
    try {
      const diff = await openDiffEntry(reviewSessionId, reviewEntryId, { ignoreCase: false, ignoreWhitespace: false })
      if (request !== generation) return
      if (!diff.text) throw new Error('This comparison cannot be edited as text.')
      const editingLeft = state.document.target.kind === 'local' && state.document.target.side === 'left'
      baseline = {
        name: editingLeft ? diff.rightLabel : diff.leftLabel,
        contents: editingLeft ? diff.text.rightText : diff.text.leftText,
        cacheKey: `${state.id}:comparison:${request}`,
        lang: getFiletypeFromFileName(state.document.name),
      }
    } catch (cause) {
      if (request === generation) error = message(cause)
    } finally {
      if (request === generation) loading = false
    }
  }

  function renderDocument(key: string) {
    if (!host || !editor || !baseline) return
    if (readyFrame !== null) cancelAnimationFrame(readyFrame)
    ready = false
    detach?.()
    fileView?.cleanUp()
    const file: FileContents = {
      name: state.document.name, contents: state.contents,
      cacheKey: state.document.cacheKey, lang: getFiletypeFromFileName(state.document.name),
    }
    const options = {
      theme: resolvePierreDiffTheme(appearanceSettings), themeType: resolvedThemeMode,
      overflow: 'scroll' as const, unsafeCSS: buildPierreDiffUnsafeCss(appearanceSettings),
    }
    if (surface === 'diff') {
      fileView = new FileDiff({ ...options, diffStyle: viewMode === 'unified' ? 'unified' : 'split', expandUnchanged: true })
      fileView.render({ oldFile: baseline, newFile: file, containerWrapper: host })
    } else {
      fileView = new File(options)
      fileView.render({ file, containerWrapper: host })
    }
    detach = editor.edit(fileView)
    renderedKey = key
    const request = generation
    const started = performance.now()
    const restore = () => {
      readyFrame = null
      if (request !== generation || !editor || !host.isConnected) return
      if (!editor.getFile()) {
        if (performance.now() - started < 10000) readyFrame = requestAnimationFrame(restore)
        else error = 'The editor could not initialize. Try opening the file again.'
        return
      }
      editor.setState({ selections: state.selections, view: { scrollLeft: 0, scrollTop: state.scrollTop } })
      handledFocusRevision = state.focusRevision
      ready = true
      historyRevision += 1
      editor.focus({ lineNumber: 'first-visible' })
    }
    readyFrame = requestAnimationFrame(restore)
  }

  async function save() {
    if (!ready || opening || state.saving) return
    error = ''
    try {
      if (state.document.target.kind === 'scratch') await workspaceDocumentController.saveAs(state.id)
      else {
        const result = await workspaceDocumentController.save(state.id)
        if (result?.ok) await onSaved()
      }
    } catch (cause) { error = message(cause) }
  }

  function reset() {
    if (!editor || !ready || opening || state.saving) return
    const lines = editor.getText().split('\n')
    editor.applyEdits([{
      range: { start: { line: 0, character: 0 }, end: { line: lines.length - 1, character: lines.at(-1)!.length } },
      newText: state.document.contents,
    }])
  }

  async function reloadExternal() {
    if (state.dirty && !window.confirm('Discard your unsaved edits and reload the version on disk?')) return
    try { await workspaceDocumentController.reloadExternal(state.id) }
    catch (cause) { error = message(cause) }
  }

  function keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || !host?.offsetParent || opening) return
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 's') {
      event.preventDefault()
      event.stopPropagation()
      void save()
    }
  }
</script>

<svelte:window on:keydown={keydown} />
<section class="workspace-editor" aria-label={`Editing ${state.document.displayPath}`}>
  <header class="editor-toolbar">
    <div class="editor-view" role="group" aria-label="Editor view">
      <button class:active={surface === 'diff'} aria-pressed={surface === 'diff'} type="button" on:click={() => surface = 'diff'}>Diff</button>
      <button class:active={surface === 'file'} aria-pressed={surface === 'file'} type="button" on:click={() => surface = 'file'}>File</button>
    </div>
    <span class="editor-target">{state.document.target.kind === 'scratch' ? 'Draft copy · original is read-only' : state.document.target.kind === 'gitIndex' ? 'Editing index' : state.document.target.kind === 'local' && state.document.target.side === 'left' ? 'Editing left file' : 'Editing right file'}</span>
    <div class="editor-actions">
      <button type="button" disabled={!canUndo} title="Undo (Ctrl+Z)" on:click={() => { editor?.undo(); historyRevision += 1 }}>Undo</button>
      <button type="button" disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" on:click={() => { editor?.redo(); historyRevision += 1 }}>Redo</button>
      <button type="button" disabled={!ready || !state.dirty || state.saving} title="Restore saved contents (can be undone)" on:click={reset}>Reset</button>
      <button class="primary" type="button" disabled={!ready || !state.dirty || state.saving} title="Save (Ctrl+S)" on:click={save}>{state.saving ? 'Saving…' : state.document.target.kind === 'scratch' ? 'Save as…' : 'Save'}</button>
    </div>
  </header>
  {#if state.externalChanged}
    <div class="editor-notice" role="alert">
      <span>This file changed on disk. Your unsaved edits are preserved.</span>
      <button type="button" on:click={reloadExternal}>Reload from disk</button>
      <button type="button" on:click={() => workspaceDocumentController.saveAs(state.id)}>Save a copy…</button>
    </div>
  {/if}
  {#if error || state.error}<p class="editor-error" role="alert">{error || state.error}</p>{/if}
  <div class="workspace-editor-host" bind:this={host} aria-busy={loading}>
    {#if loading || opening}<div class="editor-loading">Opening editable diff…</div>{/if}
  </div>
  <footer class="editor-status">
    <span>{state.document.displayPath}</span>
    <span>{state.format.encoding.toUpperCase()} · {state.format.lineEnding.toUpperCase()}</span>
    <span>{state.dirty ? 'Unsaved changes' : 'Saved'}</span>
  </footer>
</section>

<style>
  .workspace-editor { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; background: var(--editor-bg); }
  .editor-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 7px 10px; border-bottom: 1px solid var(--border-subtle); background: var(--surface); }
  .editor-view, .editor-actions { display: flex; gap: 4px; align-items: center; }
  .editor-view button, .editor-actions button, .editor-notice button { min-height: 28px; padding: 3px 9px; font-size: 12px; }
  .editor-view button { border-color: transparent; background: transparent; color: var(--muted); }
  .editor-view button.active { background: var(--surface-alt); color: var(--text); }
  .editor-target { flex: 1; color: var(--muted); font-size: 12px; }
  .workspace-editor-host { flex: 1; min-height: 0; overflow: auto; position: relative; }
  .workspace-editor-host :global(> diffs-container) { min-height: 100%; }
  .editor-loading { position: absolute; inset: 0; display: grid; place-items: center; background: var(--editor-bg); color: var(--muted); }
  .editor-status { display: flex; align-items: center; gap: 12px; padding: 5px 10px; color: var(--muted); border-top: 1px solid var(--border-subtle); font-size: 11px; }
  .editor-status span:first-child { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .editor-error { margin: 0; padding: 8px 10px; color: var(--danger); }
  .editor-notice { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 10px; background: var(--surface-alt); }
  .editor-notice span { flex: 1; }
</style>
