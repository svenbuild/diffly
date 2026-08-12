<script lang="ts">
  import { mount, onDestroy, onMount, tick, unmount } from 'svelte'
  import { FileTree } from '@pierre/trees'
  import type {
    ContextMenuItem as FileTreeContextMenuItem,
    ContextMenuOpenContext as FileTreeContextMenuOpenContext,
    FileTreeDirectoryHandle,
    FileTreeDropContext,
    FileTreeDropResult,
    FileTreeDropTarget,
    FileTreeOptions,
    FileTreeRenameEvent,
    FileTreeRowDecoration,
    FileTreeRowDecorationContext,
  } from '@pierre/trees'
  import type { AppearanceSettings } from '../theme'
  import {
    compareSourceKind,
    listVisibleCompareActions,
    resolveEntryAbsolutePath,
    type CompareActionContext,
  } from '../actions/compare-actions'
  import { getShellPathApi } from '../api'
  import { isDiffableDirectoryEntry } from '../app/directory-state'
  import ContextMenu from '../components/ContextMenu.svelte'
  import {
    commitPlannedOperation,
    describePlannedOperationRejection,
    recordPlannedOperation,
    setPlannedOperationNotice,
    validatePlannedOperation,
    type PlannedOperationValidation,
  } from './file-operation-preview'
  import { buildPierreTreeUnsafeCss } from '../theme/pierre'
  import type { CompareTreeSettings, DiffSource, DirectoryEntryResult } from '../types'
  import { buildChangedDirectorySet, getEntryStatusBadge } from './diffStatusBadge'

  export let loading = false
  export let directoryEntries: DirectoryEntryResult[] = []
  export let entriesRevision = 0
  export let selectedRelativePath = ''
  export let treeSettings: CompareTreeSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let selectEntry: (entry: DirectoryEntryResult) => Promise<void>
  export let embedded = false
  /** Active diff source; null means the legacy local path compare flow. */
  export let contextMenuSource: DiffSource | null = null
  /** Off by default so preview/embedding hosts opt in explicitly. */
  export let contextMenuEnabled = false

  let host: HTMLDivElement | null = null
  let fileTree: FileTree | null = null
  let renderVersion = 0
  let renderedStructureKey = ''
  let renderedEntriesRevision = -1
  let currentStructureKey = ''
  let lastSyncedSelectionPath = ''
  let hostResizeObserver: ResizeObserver | null = null
  let observedHost: HTMLDivElement | null = null
  let hostViewportHeight = 0
  let entryByPath = new Map<string, DirectoryEntryResult>()
  let changedDirectories = new Set<string>()
  let nonDiffablePaths = new Set<string>()
  let unchangedPaths = new Set<string>()
  let treeRowMutationObserver: MutationObserver | null = null
  let observedTreeRoot: ShadowRoot | null = null

  $: visibleEntries = directoryEntries
  // Planned file operations are preview-only and only make sense where an
  // on-disk working copy exists; read-only sources keep drag & drop and
  // renaming off regardless of settings.
  $: fileOperationsRecordable = (() => {
    const kind = compareSourceKind(contextMenuSource)
    return kind === 'local' || kind === 'gitWorkingTree'
  })()
  $: currentStructureKey = JSON.stringify({
    treeSettings,
    appearanceSettings,
    resolvedThemeMode,
    fileOperationsRecordable,
  })

  function resolveDensity(settings: CompareTreeSettings) {
    return settings.density === 'custom'
      ? settings.customDensity
      : settings.density
  }

  function resolveInitialExpansion(settings: CompareTreeSettings) {
    return settings.initialExpansion === 'depth'
      ? settings.initialExpansionDepth
      : settings.initialExpansion
  }

  function buildTreePaths(entries: DirectoryEntryResult[]) {
    const paths = entries.map((entry) => entry.relativePath)
    return treeSettings.sortMode === 'path' ? paths.sort() : paths
  }

  // Render the full status badge set (M/A/D/R/C/T/?/U + local) through the
  // library's row-annotation lane. The built-in gitStatus lane only supports a
  // 6-status subset with fixed letters, so it is intentionally not used. Reads
  // live component state (entryByPath, changedDirectories), which is refreshed
  // before each render.
  function renderRowDecoration(
    context: FileTreeRowDecorationContext,
  ): FileTreeRowDecoration | null {
    const { path, kind } = context.item

    if (kind === 'directory') {
      return changedDirectories.has(path)
        ? {
            icon: { name: 'file-tree-icon-dot', width: 6, height: 6 },
            title: 'Contains changes',
          }
        : null
    }

    const entry = entryByPath.get(path)
    if (!entry) {
      return null
    }

    const badge = getEntryStatusBadge(entry)
    const openThreads = entry.reviewThreadCount?.open ?? 0
    if (openThreads > 0) {
      return {
        text: `${badge?.text ?? ''} ${openThreads}`.trim(),
        title: `${badge?.title ? `${badge.title}; ` : ''}${openThreads} open review thread${openThreads === 1 ? '' : 's'}`,
      }
    }
    return badge ? { text: badge.text, title: badge.title } : null
  }

  function markNonDiffableRows() {
    const root = fileTree?.getFileTreeContainer()?.shadowRoot
    if (!root) {
      return
    }

    root
      .querySelectorAll<HTMLElement>('[data-diffly-non-diffable="true"], [data-diffly-unchanged="true"]')
      .forEach((row) => {
        row.removeAttribute('data-diffly-non-diffable')
        row.removeAttribute('data-diffly-non-diffable-title')
        row.removeAttribute('data-diffly-unchanged')
      })

    root
      .querySelectorAll<HTMLElement>('button[data-type="item"][data-item-type="file"]')
      .forEach((row) => {
        const path = row.getAttribute('data-item-path')
        if (!path) {
          return
        }

        if (unchangedPaths.has(path)) {
          row.setAttribute('data-diffly-unchanged', 'true')
          row.setAttribute('data-diffly-non-diffable-title', 'No changes')
          return
        }

        if (nonDiffablePaths.has(path)) {
          row.setAttribute('data-diffly-non-diffable', 'true')
          row.setAttribute('data-diffly-non-diffable-title', 'No text diff is available')
        }
      })
  }

  function syncTreeRowMutationObserver() {
    const root = fileTree?.getFileTreeContainer()?.shadowRoot ?? null
    if (root === observedTreeRoot) {
      return
    }

    treeRowMutationObserver?.disconnect()
    observedTreeRoot = root

    if (!root) {
      return
    }

    treeRowMutationObserver = new MutationObserver(() => markNonDiffableRows())
    treeRowMutationObserver.observe(root, { childList: true, subtree: true })
    markNonDiffableRows()
  }

  let contextMenuInstance: Record<string, unknown> | null = null

  function destroyContextMenu() {
    if (contextMenuInstance) {
      const instance = contextMenuInstance
      contextMenuInstance = null
      void unmount(instance)
    }
  }

  function buildActionContext(item: FileTreeContextMenuItem): CompareActionContext {
    const entry = item.kind === 'file' ? entryByPath.get(item.path) ?? null : null
    const shellApi = getShellPathApi()
    const handle = fileTree?.getItem(item.path) ?? null
    // isDirectory() returns literal true/false per handle type, but TS cannot
    // narrow the union through a method call, hence the cast.
    const directoryHandle =
      handle && handle.isDirectory() ? (handle as FileTreeDirectoryHandle) : null
    const clipboard = typeof navigator === 'undefined' ? null : navigator.clipboard ?? null

    return {
      sourceKind: compareSourceKind(contextMenuSource),
      entryKind: item.kind,
      relativePath: item.path,
      entry,
      absolutePath: resolveEntryAbsolutePath(contextMenuSource, entry),
      directoryExpanded: directoryHandle ? directoryHandle.isExpanded() : null,
      copyText: clipboard ? (text: string) => clipboard.writeText(text) : null,
      openPath: shellApi ? shellApi.openPath : null,
      revealPath: shellApi ? shellApi.revealPath : null,
      toggleDirectoryExpanded: directoryHandle ? () => directoryHandle.toggle() : null,
    }
  }

  // Composition hook for the tree's built-in context menu: the library anchors
  // the returned element at the pointer and owns Escape/outside-click close
  // plus focus restore to the tree row.
  function renderTreeContextMenu(
    item: FileTreeContextMenuItem,
    menuContext: FileTreeContextMenuOpenContext,
  ): HTMLElement | null {
    destroyContextMenu()

    const actionContext = buildActionContext(item)
    const visibleActions = listVisibleCompareActions(actionContext)
    if (visibleActions.length === 0) {
      return null
    }

    const root = document.createElement('div')
    contextMenuInstance = mount(ContextMenu, {
      target: root,
      props: {
        items: visibleActions.map(({ action, enabled }) => ({
          id: action.id,
          label: action.label,
          danger: action.danger === true,
          enabled,
        })),
        onSelect: (id: string) => {
          const selected = visibleActions.find(({ action }) => action.id === id)
          menuContext.close()
          if (selected?.enabled) {
            void Promise.resolve(selected.action.run(actionContext)).catch((error) => {
              console.error('[diffly] context menu action failed', id, error)
            })
          }
        },
        onRequestClose: () => menuContext.close(),
      },
    })
    return root
  }

  // Occupancy answers against the live tree (existing entries with planned
  // moves already applied visually), so chained plans validate correctly.
  function isTreePathOccupied(path: string): boolean {
    return fileTree?.getItem(path) != null
  }

  function dropDestinationPath(draggedPath: string, target: FileTreeDropTarget): string {
    const separatorIndex = draggedPath.lastIndexOf('/')
    const name = separatorIndex === -1 ? draggedPath : draggedPath.slice(separatorIndex + 1)
    const directory = target.kind === 'directory' ? target.directoryPath ?? '' : ''
    return directory ? `${directory}/${name}` : name
  }

  function validateDropContext(context: FileTreeDropContext): PlannedOperationValidation {
    for (const draggedPath of context.draggedPaths) {
      const validation = validatePlannedOperation(
        {
          fromRelativePath: draggedPath,
          toRelativePath: dropDestinationPath(draggedPath, context.target),
        },
        isTreePathOccupied,
      )
      if (!validation.ok) {
        return validation
      }
    }
    return { ok: true }
  }

  // Drops are validated in canDrop before the library mutates the tree, so the
  // completion callback records the plan without re-checking occupancy (the
  // moved item already sits at its destination by then). No disk IO happens;
  // the visual move is the preview.
  function buildDragAndDropOptions(): FileTreeOptions['dragAndDrop'] {
    if (!fileOperationsRecordable || !treeSettings.dragAndDrop) {
      return false
    }

    return {
      canDrop: (context) => {
        const validation = validateDropContext(context)
        if (!validation.ok) {
          setPlannedOperationNotice(describePlannedOperationRejection(validation.reason))
          return false
        }
        return true
      },
      onDropComplete: (result: FileTreeDropResult) => {
        for (const draggedPath of result.draggedPaths) {
          commitPlannedOperation({
            fromRelativePath: draggedPath,
            toRelativePath: dropDestinationPath(draggedPath, result.target),
          })
        }
      },
      onDropError: (error: string) => setPlannedOperationNotice(error),
    }
  }

  // The library validates rename collisions/empty names itself (onError) and
  // applies the visual rename after onRename returns. Diffly-side validation
  // covers invalid Windows characters; a rejected rename is reverted visually
  // once the library has applied it.
  function buildRenamingOptions(): FileTreeOptions['renaming'] {
    if (!fileOperationsRecordable || !treeSettings.renaming) {
      return false
    }

    return {
      onRename: (event: FileTreeRenameEvent) => {
        const validation = recordPlannedOperation(
          {
            fromRelativePath: event.sourcePath,
            toRelativePath: event.destinationPath,
          },
          isTreePathOccupied,
        )
        if (!validation.ok) {
          queueMicrotask(() => fileTree?.move(event.destinationPath, event.sourcePath))
        }
      },
      onError: (error: string) => setPlannedOperationNotice(error),
    }
  }

  function buildOptions(paths: string[], selectedPath: string): FileTreeOptions {
    return {
      paths,
      density: resolveDensity(treeSettings),
      flattenEmptyDirectories: treeSettings.flattenEmptyDirectories,
      stickyFolders: treeSettings.stickyFolders,
      fileTreeSearchMode: treeSettings.searchMode,
      initialExpansion: resolveInitialExpansion(treeSettings),
      initialExpandedPaths: treeSettings.initialExpandedPaths,
      initialSelectedPaths: selectedPath ? [selectedPath] : [],
      search: treeSettings.search,
      searchFakeFocus: treeSettings.searchFakeFocus,
      searchBlurBehavior: treeSettings.searchBlurBehavior,
      initialSearchQuery: treeSettings.initialSearchQuery || null,
      initialVisibleRowCount: treeSettings.initialVisibleRowCount,
      itemHeight: treeSettings.itemHeight,
      overscan: treeSettings.overscan,
      dragAndDrop: buildDragAndDropOptions(),
      renaming: buildRenamingOptions(),
      // Built-in icon set (configurable). The colored "complete" set gives the
      // per-file-type colors; git status only recolours the name + shows the
      // A/M/D letter in the git lane, so the file-type icon colours stay intact.
      icons: { set: treeSettings.iconSet, colored: treeSettings.coloredIcons },
      unsafeCSS: buildPierreTreeUnsafeCss(appearanceSettings, resolvedThemeMode),
      renderRowDecoration,
      composition: contextMenuEnabled
        ? {
            contextMenu: {
              triggerMode: 'right-click',
              render: renderTreeContextMenu,
              onClose: destroyContextMenu,
            },
          }
        : undefined,
      onSelectionChange: (paths) => {
        const nextPath = paths[0]
        const entry = nextPath ? entryByPath.get(nextPath) : null
        if (entry && entry.relativePath !== selectedRelativePath) {
          void selectEntry(entry)
        }
      },
    }
  }

  function measureHostViewport() {
    if (!host) {
      return 0
    }

    const hostRect = host.getBoundingClientRect()
    const panelRect = host.parentElement?.getBoundingClientRect()
    const nextHeight = Math.floor(panelRect?.height || hostRect.height || 0)
    if (nextHeight > 0 && nextHeight !== hostViewportHeight) {
      hostViewportHeight = nextHeight
      host.style.height = `${nextHeight}px`
    }

    return nextHeight
  }

  function syncHostObserver() {
    if (!hostResizeObserver || host === observedHost) {
      return
    }

    if (observedHost) {
      hostResizeObserver.unobserve(observedHost)
    }

    observedHost = host
    if (observedHost) {
      hostResizeObserver.observe(observedHost)
      measureHostViewport()
    }
  }

  function resetRenderedKeys() {
    renderedStructureKey = ''
    renderedEntriesRevision = -1
    lastSyncedSelectionPath = ''
  }

  function selectCurrentPath(scrollToSelection = true) {
    if (!fileTree) {
      return
    }

    if (!selectedRelativePath) {
      for (const selectedPath of fileTree.getSelectedPaths()) {
        fileTree.getItem(selectedPath)?.deselect()
      }
      lastSyncedSelectionPath = ''
      return
    }

    const item = fileTree.getItem(selectedRelativePath)
    if (!item) {
      return
    }

    for (const selectedPath of fileTree.getSelectedPaths()) {
      if (selectedPath !== selectedRelativePath) {
        fileTree.getItem(selectedPath)?.deselect()
      }
    }

    if (!item.isSelected()) {
      item.select()
    }

    const shouldScroll = scrollToSelection && selectedRelativePath !== lastSyncedSelectionPath
    lastSyncedSelectionPath = selectedRelativePath
    fileTree.focusPath(selectedRelativePath)
    if (shouldScroll) {
      fileTree.scrollToPath(selectedRelativePath, { focus: false, offset: 'nearest' })
    }
  }

  async function syncTreeData() {
    if (!host) {
      return
    }

    const version = ++renderVersion
    await tick()

    if (!host || version !== renderVersion) {
      return
    }

    const measuredHeight = measureHostViewport()
    if (measuredHeight <= 0) {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      if (!host || version !== renderVersion) {
        return
      }
      measureHostViewport()
    }

    entryByPath = new Map(visibleEntries.map((entry) => [entry.relativePath, entry]))
    changedDirectories = buildChangedDirectorySet(visibleEntries)
    const nextNonDiffablePaths = new Set<string>()
    const nextUnchangedPaths = new Set<string>()
    for (const entry of visibleEntries) {
      if (entry.status === 'unchanged') {
        nextUnchangedPaths.add(entry.relativePath)
      } else if (entry.status === 'unsupported' || entry.binary) {
        nextNonDiffablePaths.add(entry.relativePath)
      }
    }
    nonDiffablePaths = nextNonDiffablePaths
    unchangedPaths = nextUnchangedPaths
    const paths = buildTreePaths(visibleEntries)
    const nextStructureKey = currentStructureKey
    const entriesChanged = entriesRevision !== renderedEntriesRevision

    if (!fileTree || nextStructureKey !== renderedStructureKey) {
      fileTree?.cleanUp()
      fileTree = new FileTree(buildOptions(paths, selectedRelativePath))
      fileTree.render({ containerWrapper: host })
      measureHostViewport()
      syncTreeRowMutationObserver()
      renderedStructureKey = nextStructureKey
      renderedEntriesRevision = entriesRevision
      lastSyncedSelectionPath = ''
      selectCurrentPath()
      markNonDiffableRows()
      return
    }

    if (entriesChanged) {
      fileTree.resetPaths(paths, { initialExpandedPaths: treeSettings.initialExpandedPaths })
      // Force a full re-render so row decorations pick up the latest entry data
      // even when the path set is unchanged (e.g. a status flips on staging).
      // renderRowDecoration reads live component state, so this re-evaluates
      // every visible badge. Re-rendering reconciles the existing DOM, so scroll
      // and expansion state are preserved.
      if (host) {
        fileTree.render({ containerWrapper: host })
      }
      syncTreeRowMutationObserver()
      markNonDiffableRows()
      renderedEntriesRevision = entriesRevision
    }

    selectCurrentPath(selectedRelativePath !== lastSyncedSelectionPath)
    markNonDiffableRows()
  }

  $: host, visibleEntries, entriesRevision, treeSettings, appearanceSettings, resolvedThemeMode, void syncTreeData()
  $: host, syncHostObserver()
  $: selectedRelativePath, selectCurrentPath()

  onMount(() => {
    hostResizeObserver = new ResizeObserver(() => {
      measureHostViewport()
    })
    syncHostObserver()
  })

  onDestroy(() => {
    destroyContextMenu()
    hostResizeObserver?.disconnect()
    hostResizeObserver = null
    treeRowMutationObserver?.disconnect()
    treeRowMutationObserver = null
    observedTreeRoot = null
    fileTree?.cleanUp()
    fileTree = null
    resetRenderedKeys()
  })
</script>

{#if embedded}
  <div class="directory-tree-host" bind:this={host}>
    {#if loading && directoryEntries.length === 0}
      <div class="directory-tree-state">
        <span class="refresh-spinner visible"></span>
        <p>Scanning folders...</p>
      </div>
    {/if}
  </div>
{:else}
  <aside class="directory-tree-panel">
    <div class="directory-tree-host" bind:this={host}>
      {#if loading && directoryEntries.length === 0}
        <div class="directory-tree-state">
          <span class="refresh-spinner visible"></span>
          <p>Scanning folders...</p>
        </div>
      {/if}
    </div>
  </aside>
{/if}
