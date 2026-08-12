<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { UnresolvedFile, type FileContents } from '@pierre/diffs'
  import type { AppearanceSettings } from '../theme'
  import { buildPierreDiffUnsafeCss, resolvePierreDiffTheme } from '../theme/pierre'
  import { conflictStore } from './conflict-store'
  import { workspaceConflictController } from './conflict-controller'
  import ConflictManualEditor from './ConflictManualEditor.svelte'

  export let sessionId: string
  export let entryId: string
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let onResolved: () => Promise<void> | void = () => {}

  let host: HTMLDivElement | null = null
  let unresolved: UnresolvedFile | null = null
  let manual = false
  let initialConflictCount = 0
  let renderedDraft = ''
  let inspectSide: 'base' | 'current' | 'incoming' = 'current'

  $: remaining = countMarkers($conflictStore.draft)
  $: solved = Math.max(0, initialConflictCount - remaining)
  $: canResolveContents = Boolean($conflictStore.document) && remaining === 0

  onMount(async () => {
    const document = await workspaceConflictController.open(sessionId, entryId)
    initialConflictCount = countMarkers(document.markerContents ?? '')
    renderUnresolved()
  })

  onDestroy(() => unresolved?.cleanUp())

  function renderUnresolved() {
    const document = $conflictStore.document
    if (!host || !document?.markerContents || manual || renderedDraft === $conflictStore.draft) return
    unresolved?.cleanUp()
    unresolved = new UnresolvedFile({
      theme: resolvePierreDiffTheme(appearanceSettings),
      themeType: resolvedThemeMode,
      overflow: 'scroll',
      mergeConflictActionsType: 'default',
      unsafeCSS: buildPierreDiffUnsafeCss(appearanceSettings),
      onMergeConflictResolve: (file) => {
        renderedDraft = file.contents
        workspaceConflictController.updateDraft(file.contents)
      },
    })
    const file: FileContents = {
      name: document.path,
      contents: $conflictStore.draft,
      cacheKey: `${document.revision.workingRevision?.sha256 ?? 'missing'}:${hashText($conflictStore.draft)}`,
    }
    unresolved.render({ file, containerWrapper: host })
    renderedDraft = $conflictStore.draft
  }

  function resolveAll(kind: 'current' | 'incoming' | 'both') {
    workspaceConflictController.replaceDraft(resolveAllMarkers($conflictStore.draft, kind))
    renderedDraft = ''
    renderUnresolved()
  }

  async function finish(side?: 'current' | 'incoming' | 'delete') {
    await workspaceConflictController.resolve(sessionId, entryId, side)
    await onResolved()
  }

  function toggleManual() {
    manual = !manual
    if (!manual) {
      renderedDraft = ''
      renderUnresolved()
    }
  }

  function resetDraft() {
    workspaceConflictController.resetDraft()
    renderedDraft = ''
    renderUnresolved()
  }

  function inspectedContents() {
    return $conflictStore.document?.[inspectSide]?.contents ?? 'This side has no text content.'
  }

  $: if (host && !manual) renderUnresolved()
</script>

<section class="merge-conflict-viewer">
  {#if $conflictStore.loading}
    <div class="conflict-state">Loading conflict…</div>
  {:else if $conflictStore.document}
    <header>
      <div>
        <strong>{$conflictStore.document.path}</strong>
        <span>{$conflictStore.document.conflictKind}</span>
        <span>{solved} of {initialConflictCount} conflicts resolved</span>
      </div>
      <div class="conflict-actions">
        <details class="conflict-versions">
          <summary>Inspect versions</summary>
          <div class="conflict-version-tabs">
            <button class:active={inspectSide === 'base'} type="button" on:click={() => inspectSide = 'base'}>Base</button>
            <button class:active={inspectSide === 'current'} type="button" on:click={() => inspectSide = 'current'}>Current</button>
            <button class:active={inspectSide === 'incoming'} type="button" on:click={() => inspectSide = 'incoming'}>Incoming</button>
          </div>
          <pre>{inspectedContents()}</pre>
        </details>
        {#if !$conflictStore.document.binary && !$conflictStore.document.submodule && ($conflictStore.document.conflictKind !== 'UU' && $conflictStore.document.conflictKind !== 'AA')}
          {#if $conflictStore.document.current}<button class="secondary" type="button" on:click={() => finish('current')}>Keep Current</button>{/if}
          {#if $conflictStore.document.incoming}<button class="secondary" type="button" on:click={() => finish('incoming')}>Keep Incoming</button>{/if}
          <button class="danger" type="button" on:click={() => finish('delete')}>Resolve as Delete</button>
        {/if}
        {#if !$conflictStore.document.binary && !$conflictStore.document.submodule}
          <button class="secondary" type="button" on:click={() => resolveAll('current')}>Resolve all with Current</button>
          <button class="secondary" type="button" on:click={() => resolveAll('incoming')}>Resolve all with Incoming</button>
          <button class="secondary" type="button" on:click={() => resolveAll('both')}>Resolve all with Both</button>
          <button class="secondary" type="button" on:click={toggleManual}>{manual ? 'Show blocks' : 'Edit manually'}</button>
          <button class="secondary" type="button" on:click={resetDraft}>Reset</button>
        {/if}
      </div>
    </header>

    {#if $conflictStore.document.binary || $conflictStore.document.submodule}
      <div class="binary-conflict-actions">
        {#if $conflictStore.document.current}<button type="button" on:click={() => finish('current')}>Use Current</button>{/if}
        {#if $conflictStore.document.incoming}<button type="button" on:click={() => finish('incoming')}>Use Incoming</button>{/if}
        <button class="danger" type="button" on:click={() => finish('delete')}>Delete</button>
      </div>
    {:else if manual || !$conflictStore.document.markerContents}
      <ConflictManualEditor
        name={$conflictStore.document.path}
        contents={$conflictStore.draft}
        renderRevision={$conflictStore.renderRevision}
        {appearanceSettings}
        {resolvedThemeMode}
        onChange={(contents) => workspaceConflictController.updateDraft(contents)}
      />
      {#if !$conflictStore.document.markerContents}
        <p class="conflict-notice">All conflict markers were removed. Review the file, then mark it resolved.</p>
      {/if}
    {:else}
      <div class="merge-conflict-host" bind:this={host}></div>
    {/if}

    {#if $conflictStore.error}<p class="conflict-error">{$conflictStore.error}</p>{/if}
    <footer>
      <button class="secondary" type="button" disabled={!$conflictStore.document.workingFile} on:click={() => workspaceConflictController.saveDraft()}>Save draft</button>
      <button type="button" disabled={!canResolveContents || $conflictStore.resolving} on:click={() => finish()}>
        {$conflictStore.resolving ? 'Resolving…' : 'Resolve & Stage'}
      </button>
    </footer>
  {:else}
    <div class="conflict-state error">{$conflictStore.error ?? 'Unable to open conflict.'}</div>
  {/if}
</section>

<script lang="ts" context="module">
  export function countMarkers(contents: string) {
    return (contents.match(/^<<<<<<< .+$/gm) ?? []).length
  }

  export function resolveAllMarkers(contents: string, resolution: 'current' | 'incoming' | 'both') {
    const lines = contents.split(/\r\n|\r|\n/)
    const result: string[] = []
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index]?.startsWith('<<<<<<< ')) {
        result.push(lines[index] ?? '')
        continue
      }
      const current: string[] = []
      const incoming: string[] = []
      index += 1
      while (index < lines.length && !lines[index]?.startsWith('||||||| ') && lines[index] !== '=======') {
        current.push(lines[index] ?? '')
        index += 1
      }
      if (lines[index]?.startsWith('||||||| ')) {
        while (index < lines.length && lines[index] !== '=======') index += 1
      }
      index += 1
      while (index < lines.length && !lines[index]?.startsWith('>>>>>>> ')) {
        incoming.push(lines[index] ?? '')
        index += 1
      }
      if (resolution === 'current' || resolution === 'both') result.push(...current)
      if (resolution === 'incoming' || resolution === 'both') result.push(...incoming)
    }
    return result.join(detectEol(contents))
  }

  function detectEol(contents: string) {
    return contents.includes('\r\n') ? '\r\n' : contents.includes('\r') ? '\r' : '\n'
  }

  function hashText(contents: string) {
    let hash = 2166136261
    for (let index = 0; index < contents.length; index += 1) {
      hash ^= contents.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(16)
  }
</script>

<style>
  .merge-conflict-viewer { min-width: 0; min-height: 0; height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; background: var(--editor-bg); }
  header, footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border-bottom: 1px solid var(--border-color); background: var(--panel-surface); }
  header > div, .conflict-actions, footer { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
  header span { color: var(--muted-text); font-size: 11px; }
  .merge-conflict-host { min-height: 0; overflow: auto; }
  footer { border-top: 1px solid var(--border-color); border-bottom: 0; justify-content: flex-end; }
  .conflict-state, .binary-conflict-actions { display: grid; place-items: center; gap: 8px; padding: 20px; }
  .conflict-versions { position: relative; }
  .conflict-versions > summary { cursor: pointer; color: var(--muted-text); font-size: 11px; }
  .conflict-versions[open] { z-index: 10; }
  .conflict-versions[open] > div, .conflict-versions[open] > pre { position: absolute; right: 0; width: min(560px, 70vw); margin: 0; padding: 8px; border: 1px solid var(--border-color); background: var(--panel-surface); }
  .conflict-versions[open] > div { top: 24px; display: flex; gap: 5px; border-bottom: 0; }
  .conflict-versions[open] > pre { top: 65px; max-height: 45vh; overflow: auto; white-space: pre-wrap; }
  .conflict-version-tabs button.active { color: var(--accent); }
  .binary-conflict-actions { display: flex; align-items: center; justify-content: center; }
  .conflict-notice, .conflict-error { position: absolute; bottom: 48px; margin: 0; padding: 7px 10px; background: var(--panel-surface); color: var(--muted-text); }
  .conflict-error, .conflict-state.error { color: var(--diff-removed); }
</style>
