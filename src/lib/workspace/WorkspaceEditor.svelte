<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { File, getFiletypeFromFileName, type EditorState, type FileContents } from '@pierre/diffs'
  import type { Editor } from '@pierre/diffs/edit'
  import type { AppearanceSettings } from '../theme'
  import { buildPierreDiffUnsafeCss, resolvePierreDiffTheme } from '../theme/pierre'
  import { workspaceDocumentController } from './document-controller'
  import type { WorkspaceDocumentState } from './document-store'

  export let state: WorkspaceDocumentState
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let onSaved: () => Promise<void> | void = () => {}

  let host: HTMLDivElement | null = null
  let fileView: File | null = null
  let editor: Editor<undefined> | null = null
  let detachEditor: (() => void) | null = null
  let loading = true
  let loadError = ''
  let renderedCacheKey = ''
  let positionLabel = 'Ln 1, Col 1'
  let historyRevision = 0
  let handledFocusRevision = state.focusRevision

  $: canUndo = Boolean(editor?.canUndo) && historyRevision >= 0
  $: canRedo = Boolean(editor?.canRedo) && historyRevision >= 0

  onMount(() => {
    let cancelled = false
    void import('@pierre/diffs/edit')
      .then(({ Editor }) => {
        if (cancelled || !host) return
        editor = new Editor({
          historyMaxEntries: 500,
          persistState: true,
          matchBrackets: true,
          autoSurround: 'default',
          enabledSelectionAction: true,
          onChange: (file) => handleEditorChange(file),
        })
        renderDocument(true)
        editor.focus({ lineNumber: 'first-visible' })
        loading = false
      })
      .catch((error) => {
        loadError = error instanceof Error ? error.message : 'Unable to load the editor.'
        loading = false
      })
    return () => {
      cancelled = true
    }
  })

  onDestroy(() => {
    detachEditor?.()
    editor?.cleanUp()
    fileView?.cleanUp()
  })

  function renderDocument(force = false) {
    if (!host || !editor || (!force && renderedCacheKey === state.document.cacheKey)) return
    const file: FileContents = {
      name: state.document.name,
      contents: state.contents,
      cacheKey: state.document.cacheKey,
      lang: getFiletypeFromFileName(state.document.name),
    }
    detachEditor?.()
    fileView?.cleanUp()
    fileView = new File({
      theme: resolvePierreDiffTheme(appearanceSettings),
      themeType: resolvedThemeMode,
      overflow: 'scroll',
      disableVirtualizationBuffers: false,
      unsafeCSS: buildPierreDiffUnsafeCss(appearanceSettings),
    })
    fileView.render({ file, containerWrapper: host })
    detachEditor = editor.edit(fileView)
    if (state.selections.length > 0 || state.scrollTop > 0) {
      editor.setState({
        selections: state.selections,
        view: { scrollLeft: 0, scrollTop: state.scrollTop },
      })
    }
    renderedCacheKey = state.document.cacheKey
    updateStatus()
  }

  function handleEditorChange(file: FileContents) {
    if (!editor) return
    const editorState = editor.getState()
    workspaceDocumentController.updateContents(state.id, file.contents, {
      selections: normalizeSelections(editorState),
      scrollTop: editorState.view?.scrollTop ?? state.scrollTop,
    })
    historyRevision += 1
    updateStatus(editorState)
  }

  function normalizeSelections(editorState: EditorState) {
    return (editorState.selections ?? []).map((selection) => ({
      start: selection.start,
      end: selection.end,
      direction: selection.direction,
    }))
  }

  function updateStatus(editorState = editor?.getState()) {
    const selection = editorState?.selections?.[0]
    if (!selection) return
    const point = selection.direction === -1 ? selection.start : selection.end
    positionLabel = `Ln ${point.line + 1}, Col ${point.character + 1}`
  }

  function undo() {
    editor?.undo()
    historyRevision += 1
    updateStatus()
  }

  function redo() {
    editor?.redo()
    historyRevision += 1
    updateStatus()
  }

  async function save() {
    const result = await workspaceDocumentController.save(state.id)
    if (result?.ok) await onSaved()
  }

  function openFind(replace: boolean) {
    if (!host) return
    host.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: !navigator.platform.toLowerCase().includes('mac'),
      metaKey: navigator.platform.toLowerCase().includes('mac'),
      altKey: replace,
      bubbles: true,
    }))
  }

  function sourceLabel(kind: WorkspaceDocumentState['document']['target']['kind']) {
    switch (kind) {
      case 'local': return 'LOCAL'
      case 'gitWorktree': return 'WORKTREE'
      case 'gitIndex': return 'INDEX'
      case 'scratch': return 'SCRATCH'
    }
  }

  $: state.document.cacheKey, appearanceSettings, resolvedThemeMode, renderDocument()
  $: if (editor && state.focusRevision !== handledFocusRevision) {
    handledFocusRevision = state.focusRevision
    editor.setState({ selections: state.selections })
    const selection = state.selections[0]
    editor.focus(selection
      ? { lineNumber: selection.start.line + 1, character: selection.start.character }
      : undefined)
    updateStatus()
  }
</script>

<section class="workspace-editor" aria-label={`Editing ${state.document.displayPath}`}>
  <header class="workspace-editor-toolbar">
    <div class="workspace-editor-title">
      <strong>{state.document.displayPath}</strong>
      <span class="workspace-source-label">{sourceLabel(state.document.target.kind)}</span>
      {#if state.dirty}<span class="workspace-dirty" title="Unsaved changes">●</span>{/if}
      {#if state.externalChanged}<span class="workspace-external">External version changed</span>{/if}
      {#if state.error}<span class="workspace-error">{state.error}</span>{/if}
    </div>
    <div class="workspace-editor-actions">
      <button class="secondary" type="button" disabled={!canUndo} on:click={undo}>Undo</button>
      <button class="secondary" type="button" disabled={!canRedo} on:click={redo}>Redo</button>
      <button class="secondary" type="button" on:click={() => openFind(false)}>Find</button>
      <button class="secondary" type="button" on:click={() => openFind(true)}>Replace</button>
      <button type="button" disabled={!state.dirty || state.saving || state.document.readOnly} on:click={save}>
        {state.saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  </header>

  <div class="workspace-editor-host" bind:this={host}>
    {#if loading}<div class="workspace-editor-message">Loading editor…</div>{/if}
    {#if loadError}<div class="workspace-editor-message error">{loadError}</div>{/if}
  </div>

  <footer class="workspace-editor-status">
    <span>{positionLabel}</span>
    <span>{state.document.format.encoding.toUpperCase()}</span>
    <span>{state.document.format.lineEnding.toUpperCase()}</span>
    <span>{getFiletypeFromFileName(state.document.name)}</span>
    <span>{state.document.revision.size.toLocaleString()} bytes</span>
    <span>{state.saving ? 'Saving…' : state.dirty ? 'Unsaved' : 'Saved'}</span>
  </footer>
</section>

<style>
  .workspace-editor { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-width: 0; min-height: 0; height: 100%; background: var(--editor-bg); }
  .workspace-editor-toolbar, .workspace-editor-status { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-bottom: 1px solid var(--border-color); background: var(--panel-surface); }
  .workspace-editor-title { display: flex; align-items: center; min-width: 0; gap: 8px; flex: 1; }
  .workspace-editor-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .workspace-source-label { color: var(--muted-text); font-size: 10px; letter-spacing: .08em; }
  .workspace-dirty { color: var(--accent); font-size: 10px; }
  .workspace-external, .workspace-error { color: var(--diff-removed); font-size: 11px; }
  .workspace-editor-actions { display: flex; gap: 5px; }
  .workspace-editor-actions button { min-height: 27px; padding: 3px 9px; }
  .workspace-editor-host { min-height: 0; overflow: auto; position: relative; }
  .workspace-editor-host :global(> diffs-container) { min-height: 100%; }
  .workspace-editor-message { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted-text); }
  .workspace-editor-message.error { color: var(--diff-removed); }
  .workspace-editor-status { border-top: 1px solid var(--border-color); border-bottom: 0; justify-content: flex-end; color: var(--muted-text); font-size: 11px; }
</style>
