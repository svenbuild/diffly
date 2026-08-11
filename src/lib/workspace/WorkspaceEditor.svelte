<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { File, getFiletypeFromFileName, type EditorState, type FileContents } from '@pierre/diffs'
  import type { Editor } from '@pierre/diffs/edit'
  import type { AppearanceSettings } from '../theme'
  import { buildPierreDiffUnsafeCss, resolvePierreDiffTheme } from '../theme/pierre'
  import { workspaceDocumentController } from './document-controller'
  import type { WorkspaceDocumentState } from './document-store'
  import { diagnoseDocument, type DiagnosticMarker } from './diagnostics'

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
  let showExternalComparison = false
  let diagnosticMarkers: DiagnosticMarker[] = []
  let diagnosticTimer: number | null = null
  let diagnosticsPending = false
  let selectedMarker = -1

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
          clipboard: { readText: () => window.diffly.clipboard.readText() },
          onChange: (file) => handleEditorChange(file),
        })
        renderDocument(true)
        updateDiagnostics(state.contents)
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
    if (diagnosticTimer !== null) window.clearTimeout(diagnosticTimer)
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
    scheduleDiagnostics(file.contents)
    updateStatus(editorState)
  }

  function scheduleDiagnostics(contents: string) {
    diagnosticsPending = true
    editor?.setMarkers([])
    if (diagnosticTimer !== null) window.clearTimeout(diagnosticTimer)
    diagnosticTimer = window.setTimeout(() => {
      diagnosticTimer = null
      updateDiagnostics(contents)
    }, 250)
  }

  function updateDiagnostics(contents: string) {
    diagnosticMarkers = diagnoseDocument(state.document.name, contents)
    editor?.setMarkers(diagnosticMarkers)
    diagnosticsPending = false
    selectedMarker = diagnosticMarkers.length > 0 ? 0 : -1
  }

  function navigateMarker(direction: 1 | -1) {
    if (diagnosticMarkers.length === 0 || !editor) return
    selectedMarker = (selectedMarker + direction + diagnosticMarkers.length) % diagnosticMarkers.length
    const marker = diagnosticMarkers[selectedMarker]!
    editor.setState({ selections: [{ start: marker.start, end: marker.end, direction: 1 }] })
    editor.focus({ lineNumber: marker.start.line + 1, character: marker.start.character })
  }

  function selectMarker(index: number) {
    if (!editor || !diagnosticMarkers[index]) return
    selectedMarker = index
    const marker = diagnosticMarkers[index]!
    editor.setState({ selections: [{ start: marker.start, end: marker.end, direction: 1 }] })
    editor.focus({ lineNumber: marker.start.line + 1, character: marker.start.character })
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

  async function saveAs() {
    await workspaceDocumentController.saveAs(state.id)
  }

  async function overwriteExternal() {
    if (!window.confirm('Overwrite the externally changed file with the current draft?')) return
    const result = await workspaceDocumentController.overwrite(state.id)
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

  function indentationLabel(contents: string) {
    const lines = contents.split(/\r\n|\r|\n/).slice(0, 500)
    let tabs = 0
    const spaces: number[] = []
    for (const line of lines) {
      if (line.startsWith('\t')) tabs += 1
      else {
        const width = /^ +/.exec(line)?.[0].length ?? 0
        if (width > 0) spaces.push(width)
      }
    }
    if (tabs > spaces.length) return 'Tabs'
    const size = spaces.length > 0 ? spaces.reduce(gcd) : 2
    return `${Math.max(1, Math.min(size, 8))} spaces`
  }

  function gcd(left: number, right: number) {
    while (right) [left, right] = [right, left % right]
    return left
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
      <button class="secondary" type="button" disabled={state.saving} on:click={saveAs}>Save As…</button>
    </div>
  </header>

  {#if state.externalChanged}
    <div class="external-change-banner" role="alert">
      <strong>External version changed</strong>
      <button class="secondary" type="button" disabled={!state.externalDocument} on:click={() => showExternalComparison = !showExternalComparison}>Compare with draft</button>
      <button class="secondary" type="button" on:click={() => workspaceDocumentController.reloadExternal(state.id)}>Reload external</button>
      <button class="secondary" type="button" on:click={() => showExternalComparison = false}>Keep draft</button>
      <button class="secondary" type="button" on:click={saveAs}>Save draft as copy</button>
      <button type="button" disabled={!state.externalDocument} on:click={overwriteExternal}>Overwrite…</button>
    </div>
  {/if}

  {#if showExternalComparison && state.externalDocument}
    <div class="external-comparison">
      <section><strong>External</strong><pre>{state.externalDocument.contents}</pre></section>
      <section><strong>Draft</strong><pre>{state.contents}</pre></section>
    </div>
  {/if}

  <div class="workspace-editor-host" bind:this={host}>
    {#if loading}<div class="workspace-editor-message">Loading editor…</div>{/if}
    {#if loadError}<div class="workspace-editor-message error">{loadError}</div>{/if}
  </div>

  {#if diagnosticMarkers.length > 0}
    <details class="problems-panel">
      <summary>{diagnosticMarkers.length} problem(s)</summary>
      {#each diagnosticMarkers as marker, index}
        <button class:selected={selectedMarker === index} type="button" on:click={() => selectMarker(index)}>
          <strong>{marker.severity}</strong> Ln {marker.start.line + 1}, Col {marker.start.character + 1}: {marker.message}
        </button>
      {/each}
    </details>
  {/if}

  <footer class="workspace-editor-status">
    <span>{positionLabel}</span>
    <label class="status-select"><span class="sr-only">Encoding</span><select value={state.format.encoding} on:change={(event) => workspaceDocumentController.updateFormat(state.id, { encoding: (event.currentTarget as HTMLSelectElement).value as typeof state.format.encoding })}><option value="utf8">UTF-8</option><option value="utf8-bom">UTF-8 BOM</option><option value="utf16le">UTF-16 LE</option><option value="utf16be">UTF-16 BE</option></select></label>
    <label class="status-select"><span class="sr-only">Line endings</span><select value={state.format.lineEnding} on:change={(event) => workspaceDocumentController.updateFormat(state.id, { lineEnding: (event.currentTarget as HTMLSelectElement).value as typeof state.format.lineEnding })}><option value="lf">LF</option><option value="crlf">CRLF</option><option value="cr">CR</option></select></label>
    <span>{getFiletypeFromFileName(state.document.name)}</span>
    <span>{indentationLabel(state.contents)}</span>
    <span>{new TextEncoder().encode(state.contents).byteLength.toLocaleString()} bytes</span>
    <span>{diagnosticsPending ? 'Diagnostics…' : diagnosticMarkers.length ? `${diagnosticMarkers.length} problem(s)` : 'Syntax ready'}</span>
    {#if diagnosticMarkers.length}<button class="status-button" type="button" on:click={() => navigateMarker(-1)}>Previous problem</button><button class="status-button" type="button" on:click={() => navigateMarker(1)}>Next problem</button>{/if}
    <span>{state.saving ? 'Saving…' : state.dirty ? 'Unsaved' : 'Saved'}</span>
  </footer>
</section>

<style>
  .workspace-editor { display: grid; grid-template-rows: auto auto auto minmax(0, 1fr) auto; min-width: 0; min-height: 0; height: 100%; background: var(--editor-bg); }
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
  .status-button { min-height: 0; padding: 0; border: 0; background: transparent; color: var(--muted-text); font-size: 11px; }
  .status-select select { min-height: 20px; padding: 0 3px; border: 0; background: transparent; color: var(--muted-text); font-size: 11px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
  .problems-panel { max-height: 150px; overflow: auto; border-top: 1px solid var(--border-color); background: var(--panel-surface); }
  .problems-panel summary { padding: 5px 9px; }
  .problems-panel button { display: block; width: 100%; padding: 5px 9px; border: 0; border-radius: 0; background: transparent; text-align: left; }
  .problems-panel button.selected { background: var(--hover-surface); }
  .external-change-banner { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 7px 10px; border-bottom: 1px solid var(--diff-removed); background: color-mix(in srgb, var(--diff-removed) 8%, var(--panel-surface)); }
  .external-comparison { display: grid; grid-template-columns: 1fr 1fr; min-height: 120px; max-height: 35vh; border-bottom: 1px solid var(--border-color); overflow: auto; }
  .external-comparison section { min-width: 0; padding: 7px; }
  .external-comparison section + section { border-left: 1px solid var(--border-color); }
  .external-comparison pre { margin: 6px 0 0; white-space: pre-wrap; font-family: var(--font-mono); font-size: 11px; }
</style>
