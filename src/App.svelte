<script lang="ts">
  import { onMount } from 'svelte'
  import EntryIcon from './lib/EntryIcon.svelte'

  import {
    choosePath,
    comparePaths,
    listDirectory,
    listRoots,
    loadSessionState,
    openCompareItem,
    pathInfo,
    saveSessionState,
  } from './lib/api'
  import type {
    CompareMode,
    DirectoryEntryResult,
    DirectoryListing,
    EntryStatus,
    ExplorerEntry,
    FileDiffResult,
    PersistedExplorerPane,
    PersistedSession,
    SideBySideRow,
    ThemeMode,
    UnifiedLine,
    ViewMode,
  } from './lib/types'

  const ROOT_GROUP = '__root__'
  const DIFF_CONTEXT_LINES = 3
  const SESSION_SAVE_DELAY_MS = 180

  interface EntryGroup {
    key: string
    label: string
    entries: DirectoryEntryResult[]
  }

  interface FolderSection {
    key: string
    label: string
    depth: number
    entries: DirectoryEntryResult[]
    totalCount: number
  }

  interface SideBySideRenderItem {
    type: 'hunk' | 'row'
    header?: string
    row?: SideBySideRow
  }

  interface UnifiedRenderItem {
    type: 'hunk' | 'row'
    header?: string
    row?: UnifiedLine
  }

  interface DiffTreeNode {
    key: string
    name: string
    type: 'directory' | 'file'
    children: DiffTreeNode[]
    entry: DirectoryEntryResult | null
    changedCount: number
  }

  interface VisibleDiffTreeNode {
    node: DiffTreeNode
    depth: number
  }

  interface ExplorerPaneState {
    title: string
    roots: ExplorerEntry[]
    currentPath: string
    pathInput: string
    currentListing: DirectoryListing | null
    listings: Record<string, DirectoryListing>
    history: string[]
    historyIndex: number
    selectedTargetPath: string
    selectedTargetKind: 'file' | 'directory' | null
    loading: boolean
    error: string
  }

  type Screen = 'setup' | 'compare'
  type Side = 'left' | 'right'

  let screen: Screen = 'setup'
  let mode: CompareMode = 'directory'
  let viewMode: ViewMode = 'sideBySide'
  let themeMode: ThemeMode = 'dark'
  let showFullFile = false
  let showInlineHighlights = true
  let leftPath = ''
  let rightPath = ''
  let ignoreWhitespace = false
  let ignoreCase = false
  let loading = false
  let detailLoading = false
  let pickerLoading = false
  let errorMessage = ''
  let directoryEntries: DirectoryEntryResult[] = []
  let entryGroups: EntryGroup[] = []
  let folderSections: FolderSection[] = []
  let collapsedGroups: Record<string, boolean> = {}
  let leftPaneScroll: HTMLDivElement | null = null
  let rightPaneScroll: HTMLDivElement | null = null
  let selectedRelativePath = ''
  let activeDiff: FileDiffResult | null = null
  let compareRevision = 0
  let syncingScroll = false
  let persistenceReady = false
  let saveSessionTimer: number | null = null
  let compareRefreshTimer: number | null = null
  let leftExplorer = createExplorerPane('Left')
  let rightExplorer = createExplorerPane('Right')

  const statusLabel = {
    modified: 'Modified',
    leftOnly: 'Left only',
    rightOnly: 'Right only',
    binary: 'Binary',
    tooLarge: 'Too large',
  }
  const statusOrder: EntryStatus[] = ['modified', 'leftOnly', 'rightOnly', 'binary', 'tooLarge']

  const getOptions = () => ({
    ignoreWhitespace,
    ignoreCase,
  })

  const toggleThemeMode = () => {
    themeMode = themeMode === 'dark' ? 'light' : 'dark'
  }

  const toggleViewMode = () => {
    viewMode = viewMode === 'sideBySide' ? 'unified' : 'sideBySide'
  }

  const toggleIgnoreWhitespace = () => {
    ignoreWhitespace = !ignoreWhitespace
    scheduleCompareRefresh()
  }

  const toggleIgnoreCase = () => {
    ignoreCase = !ignoreCase
    scheduleCompareRefresh()
  }

  onMount(() => {
    void initializePickers()

    return () => {
      if (saveSessionTimer !== null) {
        window.clearTimeout(saveSessionTimer)
      }

      if (compareRefreshTimer !== null) {
        window.clearTimeout(compareRefreshTimer)
      }
    }
  })

  function createExplorerPane(title: string): ExplorerPaneState {
    return {
      title,
      roots: [],
      currentPath: '',
      pathInput: '',
      currentListing: null,
      listings: {},
      history: [],
      historyIndex: -1,
      selectedTargetPath: '',
      selectedTargetKind: null,
      loading: false,
      error: '',
    }
  }

  function paneFor(side: Side) {
    return side === 'left' ? leftExplorer : rightExplorer
  }

  function setPane(side: Side, pane: ExplorerPaneState) {
    if (side === 'left') {
      leftExplorer = pane
    } else {
      rightExplorer = pane
    }
  }

  function updatePane(side: Side, updater: (pane: ExplorerPaneState) => ExplorerPaneState) {
    setPane(side, updater(paneFor(side)))
  }

  async function initializePickers() {
    pickerLoading = true

    try {
      const [roots, savedSession] = await Promise.all([
        listRoots(),
        loadSessionState().catch(() => null),
      ])

      applyPersistedSession(savedSession)

      leftExplorer = {
        ...createExplorerPane('Left'),
        roots,
      }

      rightExplorer = {
        ...createExplorerPane('Right'),
        roots,
      }

      if (roots.length > 0) {
        const leftRoot = await resolveInitialPanePath(savedSession?.leftPane ?? null, roots[0].path)
        const rightRoot = await resolveInitialPanePath(
          savedSession?.rightPane ?? null,
          roots[1]?.path ?? roots[0].path,
        )

        await Promise.all([
          openDirectory('left', leftRoot),
          openDirectory('right', rightRoot),
        ])

        await Promise.all([
          restorePaneSelection('left', savedSession?.leftPane ?? null),
          restorePaneSelection('right', savedSession?.rightPane ?? null),
        ])
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Unable to initialize the picker.'
    } finally {
      pickerLoading = false
      persistenceReady = true
    }
  }

  function applyPersistedSession(session: PersistedSession | null) {
    if (!session) {
      return
    }

    if (session.mode === 'file' || session.mode === 'directory') {
      mode = session.mode
    }

    if (session.viewMode === 'sideBySide' || session.viewMode === 'unified') {
      viewMode = session.viewMode
    }

    if (session.themeMode === 'dark' || session.themeMode === 'light') {
      themeMode = session.themeMode
    }

    ignoreWhitespace = session.ignoreWhitespace
    ignoreCase = session.ignoreCase
    showFullFile = session.showFullFile
    showInlineHighlights = session.showInlineHighlights ?? true
  }

  async function resolveInitialPanePath(
    pane: PersistedExplorerPane | null,
    fallbackPath: string,
  ) {
    if (pane?.currentPath) {
      const currentInfo = await pathInfo(pane.currentPath)

      if (currentInfo.exists && currentInfo.isDirectory) {
        return currentInfo.path
      }
    }

    if (pane?.selectedTargetPath) {
      const targetInfo = await pathInfo(pane.selectedTargetPath)

      if (targetInfo.exists && targetInfo.isDirectory) {
        return targetInfo.path
      }

      if (targetInfo.exists && targetInfo.isFile && targetInfo.parentPath) {
        return targetInfo.parentPath
      }
    }

    return fallbackPath
  }

  async function restorePaneSelection(side: Side, pane: PersistedExplorerPane | null) {
    if (!pane?.selectedTargetPath || !pane.selectedTargetKind) {
      return
    }

    const info = await pathInfo(pane.selectedTargetPath)

    if (!info.exists) {
      return
    }

    if (pane.selectedTargetKind === 'directory' && info.isDirectory) {
      selectTarget(side, info.path, 'directory')
      return
    }

    if (pane.selectedTargetKind === 'file' && info.isFile) {
      selectTarget(side, info.path, 'file')
    }
  }

  function setMode(nextMode: CompareMode) {
    if (mode === nextMode) {
      return
    }

    mode = nextMode
    leftExplorer = sanitizePaneForMode(leftExplorer, nextMode)
    rightExplorer = sanitizePaneForMode(rightExplorer, nextMode)
    directoryEntries = []
    entryGroups = []
    folderSections = []
    collapsedGroups = {}
    selectedRelativePath = ''
    activeDiff = null
    errorMessage = ''
  }

  function sanitizePaneForMode(pane: ExplorerPaneState, nextMode: CompareMode) {
    if (nextMode === 'file' && pane.selectedTargetKind !== 'file') {
      return {
        ...pane,
        selectedTargetPath: '',
        selectedTargetKind: null,
      }
    }

    if (nextMode === 'directory' && pane.selectedTargetKind !== 'directory') {
      return {
        ...pane,
        selectedTargetPath: '',
        selectedTargetKind: null,
      }
    }

    return pane
  }

  function goToSetup() {
    screen = 'setup'
    errorMessage = ''
  }

  function retitlePane(pane: ExplorerPaneState, title: string): ExplorerPaneState {
    return {
      ...pane,
      title,
    }
  }

  async function swapComparedSides() {
    if (loading || detailLoading || pickerLoading) {
      return
    }

    const nextLeftPane = retitlePane(rightExplorer, leftExplorer.title)
    const nextRightPane = retitlePane(leftExplorer, rightExplorer.title)

    leftExplorer = nextLeftPane
    rightExplorer = nextRightPane

    if (screen === 'compare') {
      await runCompare()
    }
  }

  async function browseSystem(side: Side) {
    const selected = await choosePath(mode === 'file' ? 'file' : 'directory')

    if (!selected) {
      return
    }

    const info = await pathInfo(selected)

    if (!info.exists) {
      return
    }

    if (info.isDirectory) {
      await openDirectory(side, info.path)
      selectTarget(side, info.path, 'directory')
      return
    }

    if (info.isFile) {
      if (info.parentPath) {
        await openDirectory(side, info.parentPath)
      }
      selectTarget(side, info.path, 'file')
    }
  }

  async function openDirectory(side: Side, path: string, historyMode: 'push' | 'keep' = 'push') {
    updatePane(side, (pane) => ({
      ...pane,
      loading: true,
      error: '',
    }))

    try {
      const pane = paneFor(side)
      const cached = pane.listings[path]
      const listing = cached ?? (await listDirectory(path))
      const historyState = buildNextHistoryState(pane, path, historyMode)

      updatePane(side, (current) => ({
        ...current,
        ...historyState,
        currentPath: path,
        pathInput: path,
        currentListing: listing,
        listings: {
          ...current.listings,
          [path]: listing,
        },
        loading: false,
      }))
    } catch (error) {
      updatePane(side, (pane) => ({
        ...pane,
        loading: false,
        error: error instanceof Error ? error.message : 'Unable to open the folder.',
      }))
    }
  }

  async function navigateTo(side: Side, path: string) {
    await openDirectory(side, path)
  }

  async function navigateHistory(side: Side, direction: -1 | 1) {
    const pane = paneFor(side)
    const nextIndex = pane.historyIndex + direction

    if (nextIndex < 0 || nextIndex >= pane.history.length) {
      return
    }

    await openDirectory(side, pane.history[nextIndex], 'keep')

    updatePane(side, (current) => ({
      ...current,
      historyIndex: nextIndex,
    }))
  }

  async function changeDrive(side: Side, path: string) {
    if (!path) {
      return
    }

    await openDirectory(side, path)
  }

  function updatePathInput(side: Side, value: string) {
    updatePane(side, (pane) => ({
      ...pane,
      pathInput: value,
    }))
  }

  async function submitPathInput(side: Side) {
    const pane = paneFor(side)
    const nextPath = pane.pathInput.trim()

    if (!nextPath) {
      updatePane(side, (current) => ({
        ...current,
        pathInput: current.currentPath,
      }))
      return
    }

    const info = await pathInfo(nextPath)

    if (!info.exists) {
      updatePane(side, (current) => ({
        ...current,
        error: 'The requested path does not exist.',
      }))
      return
    }

    if (info.isDirectory) {
      await openDirectory(side, info.path)
      if (mode === 'directory') {
        selectTarget(side, info.path, 'directory')
      }
      return
    }

    if (info.isFile && info.parentPath) {
      await openDirectory(side, info.parentPath)
      if (mode === 'file') {
        selectTarget(side, info.path, 'file')
      }
    }
  }

  function selectTarget(side: Side, path: string, kind: 'file' | 'directory') {
    updatePane(side, (pane) => ({
      ...pane,
      selectedTargetPath: path,
      selectedTargetKind: kind,
    }))
  }

  function useCurrentFolder(side: Side) {
    const pane = paneFor(side)

    if (pane.currentPath) {
      selectTarget(side, pane.currentPath, 'directory')
    }
  }

  function selectListEntry(side: Side, entry: ExplorerEntry) {
    if (mode === 'directory' && entry.kind !== 'file') {
      selectTarget(side, entry.path, 'directory')
      return
    }

    if (mode === 'file' && entry.kind === 'file') {
      selectTarget(side, entry.path, 'file')
    }
  }

  async function activateListEntry(side: Side, entry: ExplorerEntry) {
    if (entry.kind === 'directory' || entry.kind === 'drive') {
      await openDirectory(side, entry.path)
      return
    }

    if (mode === 'file') {
      selectTarget(side, entry.path, 'file')
    }
  }

  function canComparePane(pane: ExplorerPaneState) {
    return mode === 'file' ? pane.selectedTargetKind === 'file' : pane.selectedTargetKind === 'directory'
  }



  async function runCompare() {
    if (!canComparePane(leftExplorer) || !canComparePane(rightExplorer)) {
      errorMessage = 'Select valid targets on both sides first.'
      return
    }

    const nextLeftPath = leftExplorer.selectedTargetPath
    const nextRightPath = rightExplorer.selectedTargetPath
    const previousRelativePath = selectedRelativePath

    loading = true
    detailLoading = false
    errorMessage = ''
    leftPath = nextLeftPath
    rightPath = nextRightPath

    try {
      const response = await comparePaths(nextLeftPath, nextRightPath, mode, getOptions())
      compareRevision += 1
      screen = 'compare'

      if (response.kind === 'directory') {
        directoryEntries = response.entries
        entryGroups = buildGroups(directoryEntries)
        folderSections = buildFolderSections(entryGroups)
        collapsedGroups = createCollapsedState(folderSections)

        if (directoryEntries.length > 0) {
          const retainedEntry =
            directoryEntries.find((entry) => entry.relativePath === previousRelativePath) ??
            directoryEntries[0]
          await selectEntry(retainedEntry, compareRevision)
        } else {
          selectedRelativePath = ''
        }
      } else {
        selectedRelativePath = ''
        activeDiff = response.result
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Compare failed.'
    } finally {
      loading = false
    }
  }

  function scheduleCompareRefresh() {
    if (screen !== 'compare' || !canComparePane(leftExplorer) || !canComparePane(rightExplorer)) {
      return
    }

    if (compareRefreshTimer !== null) {
      window.clearTimeout(compareRefreshTimer)
    }

    compareRefreshTimer = window.setTimeout(() => {
      compareRefreshTimer = null

      if (!loading && !detailLoading) {
        void runCompare()
      }
    }, 120)
  }

  async function selectEntry(entry: DirectoryEntryResult, revision = compareRevision) {
    if (!leftPath || !rightPath) {
      return
    }

    selectedRelativePath = entry.relativePath
    detailLoading = true
    errorMessage = ''

    try {
      const result = await openCompareItem(
        leftPath,
        rightPath,
        entry.relativePath,
        getOptions(),
      )

      if (revision === compareRevision) {
        activeDiff = result
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Unable to open the file diff.'
    } finally {
      detailLoading = false
    }
  }

  function buildGroups(entries: DirectoryEntryResult[]) {
    const groups = new Map<string, DirectoryEntryResult[]>()

    for (const entry of entries) {
      const groupKey = getParentPath(entry.relativePath)

      if (!groups.has(groupKey)) {
        groups.set(groupKey, [])
      }

      groups.get(groupKey)?.push(entry)
    }

    return Array.from(groups.entries())
      .map(([key, groupedEntries]) => ({
        key,
        label: key === ROOT_GROUP ? 'Root' : key,
        entries: [...groupedEntries].sort((left, right) =>
          left.relativePath.localeCompare(right.relativePath),
        ),
      }))
      .sort((left, right) => left.label.localeCompare(right.label))
  }

  function buildFolderSections(groups: EntryGroup[]) {
    type Node = {
      key: string
      label: string
      entries: DirectoryEntryResult[]
      children: string[]
      totalCount: number
    }

    const nodes = new Map<string, Node>()

    const ensureNode = (key: string) => {
      if (!nodes.has(key)) {
        nodes.set(key, {
          key,
          label: key === ROOT_GROUP ? 'Root' : getFileName(key),
          entries: [],
          children: [],
          totalCount: 0,
        })
      }

      return nodes.get(key)!
    }

    ensureNode(ROOT_GROUP)

    for (const group of groups) {
      const parts = group.key === ROOT_GROUP ? [] : group.key.split('/')
      let currentKey = ROOT_GROUP

      for (const part of parts) {
        const nextKey = currentKey === ROOT_GROUP ? part : `${currentKey}/${part}`
        const currentNode = ensureNode(currentKey)
        ensureNode(nextKey)

        if (!currentNode.children.includes(nextKey)) {
          currentNode.children = [...currentNode.children, nextKey]
        }

        currentKey = nextKey
      }

      ensureNode(group.key).entries = group.entries
    }

    const computeCounts = (key: string) => {
      const node = ensureNode(key)
      let total = node.entries.length

      for (const childKey of node.children) {
        total += computeCounts(childKey)
      }

      node.totalCount = total
      return total
    }

    computeCounts(ROOT_GROUP)

    const sections: FolderSection[] = []

    const appendSections = (key: string, depth: number) => {
      const node = ensureNode(key)

      sections.push({
        key: node.key,
        label: node.label,
        depth,
        entries: node.entries,
        totalCount: node.totalCount,
      })

      const sortedChildren = [...node.children].sort((left, right) => left.localeCompare(right))

      for (const childKey of sortedChildren) {
        appendSections(childKey, depth + 1)
      }
    }

    appendSections(ROOT_GROUP, 0)

    return sections
  }

  function createCollapsedState(groups: FolderSection[]) {
    const nextState: Record<string, boolean> = {}

    for (const group of groups) {
      nextState[group.key] = false
    }

    return nextState
  }

  function getVisibleFolderSections(
    sections: FolderSection[],
    collapsedState: Record<string, boolean>,
  ) {
    return sections.filter((section) => {
      if (section.key === ROOT_GROUP) {
        return true
      }

      if (collapsedState[ROOT_GROUP]) {
        return false
      }

      const parts = section.key.split('/')
      let current = ''

      for (let index = 0; index < parts.length - 1; index += 1) {
        current = current ? `${current}/${parts[index]}` : parts[index]

        if (collapsedState[current]) {
          return false
        }
      }

      return true
    })
  }

  function getParentPath(relativePath: string) {
    const normalized = relativePath.replaceAll('\\', '/')
    const lastSlash = normalized.lastIndexOf('/')

    if (lastSlash === -1) {
      return ROOT_GROUP
    }

    return normalized.slice(0, lastSlash)
  }

  function getFileName(relativePath: string) {
    const normalized = relativePath.replaceAll('\\', '/')
    const lastSlash = normalized.lastIndexOf('/')

    if (lastSlash === -1) {
      return normalized
    }

    return normalized.slice(lastSlash + 1)
  }

  function toggleGroup(groupKey: string) {
    collapsedGroups = {
      ...collapsedGroups,
      [groupKey]: !collapsedGroups[groupKey],
    }
  }

  function syncPaneScroll(source: 'left' | 'right') {
    const sourcePane = source === 'left' ? leftPaneScroll : rightPaneScroll
    const targetPane = source === 'left' ? rightPaneScroll : leftPaneScroll

    if (!sourcePane || !targetPane || syncingScroll) {
      return
    }

    syncingScroll = true
    targetPane.scrollTop = sourcePane.scrollTop
    targetPane.scrollLeft = sourcePane.scrollLeft

    requestAnimationFrame(() => {
      syncingScroll = false
    })
  }

  function formatSize(size: number | null) {
    if (size === null) {
      return '-'
    }

    if (size < 1024) {
      return `${size} B`
    }

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  function formatModified(value: number | null) {
    if (value === null) {
      return '-'
    }

    return new Intl.DateTimeFormat('de-CH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(value)
  }

  function entryTypeLabel(entry: ExplorerEntry) {
    if (entry.kind === 'directory' || entry.kind === 'drive') {
      return 'Folder'
    }

    const extensionIndex = entry.name.lastIndexOf('.')

    if (extensionIndex === -1) {
      return 'File'
    }

    return `${entry.name.slice(extensionIndex + 1).toUpperCase()} file`
  }

  function buildSideBySideRenderItems(rows: SideBySideRow[]) {
    if (showFullFile) {
      return rows.map((row) => ({ type: 'row', row }) satisfies SideBySideRenderItem)
    }

    const ranges = buildHunkRanges(
      rows.map((row) => row.left?.change !== 'context' || row.right?.change !== 'context'),
    )

    return ranges.flatMap((range) => {
      const hunkRows = rows.slice(range.start, range.end + 1)

      return [
        {
          type: 'hunk',
          header: formatHunkHeader(
            hunkRows.map((row) => row.left?.lineNumber ?? null),
            hunkRows.map((row) => row.right?.lineNumber ?? null),
          ),
        } satisfies SideBySideRenderItem,
        ...hunkRows.map((row) => ({ type: 'row', row }) satisfies SideBySideRenderItem),
      ]
    })
  }

  function buildUnifiedRenderItems(rows: UnifiedLine[]) {
    if (showFullFile) {
      return rows.map((row) => ({ type: 'row', row }) satisfies UnifiedRenderItem)
    }

    const ranges = buildHunkRanges(rows.map((row) => row.change !== 'context'))

    return ranges.flatMap((range) => {
      const hunkRows = rows.slice(range.start, range.end + 1)

      return [
        {
          type: 'hunk',
          header: formatHunkHeader(
            hunkRows.map((row) => row.leftLineNumber),
            hunkRows.map((row) => row.rightLineNumber),
          ),
        } satisfies UnifiedRenderItem,
        ...hunkRows.map((row) => ({ type: 'row', row }) satisfies UnifiedRenderItem),
      ]
    })
  }

  function buildHunkRanges(changedRows: boolean[]) {
    const ranges: Array<{ start: number; end: number }> = []

    for (const [index, isChanged] of changedRows.entries()) {
      if (!isChanged) {
        continue
      }

      const nextStart = Math.max(0, index - DIFF_CONTEXT_LINES)
      const nextEnd = Math.min(changedRows.length - 1, index + DIFF_CONTEXT_LINES)
      const previous = ranges.at(-1)

      if (previous && nextStart <= previous.end + 1) {
        previous.end = Math.max(previous.end, nextEnd)
      } else {
        ranges.push({ start: nextStart, end: nextEnd })
      }
    }

    return ranges
  }

  function formatHunkHeader(
    leftLineNumbers: Array<number | null>,
    rightLineNumbers: Array<number | null>,
  ) {
    const leftRange = summarizeLineNumbers(leftLineNumbers)
    const rightRange = summarizeLineNumbers(rightLineNumbers)

    return `@@ -${leftRange.start},${leftRange.count} +${rightRange.start},${rightRange.count} @@`
  }

  function summarizeLineNumbers(lineNumbers: Array<number | null>) {
    const present = lineNumbers.filter((value): value is number => value !== null)

    if (present.length === 0) {
      return {
        start: 0,
        count: 0,
      }
    }

    return {
      start: present[0],
      count: present.length,
    }
  }

  function buildNextHistoryState(
    pane: ExplorerPaneState,
    path: string,
    historyMode: 'push' | 'keep',
  ) {
    if (historyMode === 'keep') {
      return {
        history: pane.history,
        historyIndex: pane.historyIndex,
      }
    }

    const currentPath = pane.history[pane.historyIndex]

    if (currentPath === path) {
      return {
        history: pane.history,
        historyIndex: pane.historyIndex,
      }
    }

    const nextHistory = pane.history.slice(0, pane.historyIndex + 1)
    nextHistory.push(path)

    return {
      history: nextHistory,
      historyIndex: nextHistory.length - 1,
    }
  }

  function canGoBack(pane: ExplorerPaneState) {
    return pane.historyIndex > 0
  }

  function canGoForward(pane: ExplorerPaneState) {
    return pane.historyIndex !== -1 && pane.historyIndex < pane.history.length - 1
  }

  function currentDrive(pane: ExplorerPaneState) {
    const normalized = pane.currentPath.toLowerCase()

    return pane.roots.find((root) => normalized.startsWith(root.path.toLowerCase()))?.path ?? ''
  }

  function buildPersistedPane(pane: ExplorerPaneState): PersistedExplorerPane {
    return {
      currentPath: pane.currentPath,
      history: pane.history,
      historyIndex: pane.historyIndex,
      selectedTargetPath: pane.selectedTargetPath,
      selectedTargetKind: pane.selectedTargetKind,
    }
  }

  function buildPersistedSession(): PersistedSession {
    return {
      mode,
      viewMode,
      themeMode,
      ignoreWhitespace,
      ignoreCase,
      showFullFile,
      showInlineHighlights,
      leftPane: buildPersistedPane(leftExplorer),
      rightPane: buildPersistedPane(rightExplorer),
    }
  }

  function scheduleSessionSave() {
    if (!persistenceReady) {
      return
    }

    if (saveSessionTimer !== null) {
      window.clearTimeout(saveSessionTimer)
    }

    const session = buildPersistedSession()

    saveSessionTimer = window.setTimeout(() => {
      void saveSessionState(session).catch(() => undefined)
      saveSessionTimer = null
    }, SESSION_SAVE_DELAY_MS)
  }

  function isCurrentFolderSelected(pane: ExplorerPaneState) {
    return pane.selectedTargetKind === 'directory' && pane.selectedTargetPath === pane.currentPath
  }

  function isTargetSelected(pane: ExplorerPaneState, entry: ExplorerEntry) {
    return pane.selectedTargetPath === entry.path
  }

  function normalizeSelectionPath(path: string) {
    return path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
  }

  $: compareSummary =
    mode === 'directory'
      ? `${directoryEntries.length} difference${directoryEntries.length === 1 ? '' : 's'}`
      : activeDiff?.summary ?? 'File compare'

  $: sideBySideRenderItems =
    activeDiff && showFullFile !== undefined
      ? buildSideBySideRenderItems(activeDiff.sideBySide)
      : []

  $: unifiedRenderItems =
    activeDiff && showFullFile !== undefined ? buildUnifiedRenderItems(activeDiff.unified) : []

  $: themeToggleLabel = themeMode === 'dark' ? 'Light mode' : 'Dark mode'

  $: if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = themeMode
  }

  $: if (persistenceReady) {
    mode
    viewMode
    themeMode
    ignoreWhitespace
    ignoreCase
    showFullFile
    showInlineHighlights
    leftExplorer.currentPath
    leftExplorer.selectedTargetPath
    leftExplorer.selectedTargetKind
    leftExplorer.history
    leftExplorer.historyIndex
    rightExplorer.currentPath
    rightExplorer.selectedTargetPath
    rightExplorer.selectedTargetKind
    rightExplorer.history
    rightExplorer.historyIndex
    scheduleSessionSave()
  }

  $: pickerCanCompare = canComparePane(leftExplorer) && canComparePane(rightExplorer)
  $: if (mode !== 'directory') {
    folderSections = []
  } else if (entryGroups.length > 0) {
    folderSections = buildFolderSections(entryGroups)
  }
  $: visibleFolderSections = getVisibleFolderSections(folderSections, collapsedGroups)
  $: pickerSides = [
    { side: 'left' as Side, pane: leftExplorer },
    { side: 'right' as Side, pane: rightExplorer },
  ]
  $: sameSelectionWarning =
    pickerCanCompare &&
    leftExplorer.selectedTargetKind === rightExplorer.selectedTargetKind &&
    leftExplorer.selectedTargetPath &&
    rightExplorer.selectedTargetPath &&
    normalizeSelectionPath(leftExplorer.selectedTargetPath) ===
      normalizeSelectionPath(rightExplorer.selectedTargetPath)
      ? `Both sides currently point to the same ${mode === 'directory' ? 'folder' : 'file'}. The compare will usually be empty.`
      : ''
  $: directoryStatusSummary = statusOrder
    .map((status) => ({
      status,
      label: statusLabel[status],
      count: directoryEntries.filter((entry) => entry.status === status).length,
    }))
    .filter((item) => item.count > 0)
</script>

<svelte:head>
  <title>Diffly</title>
</svelte:head>

{#if screen === 'setup'}
  <main class="screen setup-screen">
    <header class="app-bar">
      <div class="app-bar-main">
        <div class="app-identity">
          <h1>Diffly</h1>
          <span>{mode === 'directory' ? 'Directory workspace' : 'File workspace'}</span>
        </div>

        <div class="segmented-control">
          <button class:active={mode === 'file'} type="button" on:click={() => setMode('file')}>
            Files
          </button>
          <button
            class:active={mode === 'directory'}
            type="button"
            on:click={() => setMode('directory')}
          >
            Directories
          </button>
        </div>
      </div>

      <div class="app-bar-actions">
        <button
          class="secondary theme-toggle"
          aria-label={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} mode`}
          title={themeToggleLabel}
          type="button"
          on:click={toggleThemeMode}
        >
          {#if themeMode === 'dark'}
            <svg aria-hidden="true" class="theme-icon" viewBox="0 0 16 16">
              <path d="M8 3.2v-1.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="M8 14.5v-1.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="M12.1 8h1.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="M2.2 8h1.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="m11 5 1.2-1.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="m3.8 12.2 1.2-1.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="m11 11 1.2 1.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="m3.8 3.8 1.2 1.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <circle cx="8" cy="8" r="2.6" fill="none" stroke="currentColor" stroke-width="1.4" />
            </svg>
          {:else}
            <svg aria-hidden="true" class="theme-icon" viewBox="0 0 16 16">
              <path
                d="M10.9 11.9a4.9 4.9 0 0 1-5.8-6.7 5.2 5.2 0 1 0 5.8 6.7Z"
                fill="none"
                stroke="currentColor"
                stroke-linejoin="round"
                stroke-width="1.4"
              />
            </svg>
          {/if}
        </button>
        <button
          class="secondary"
          disabled={loading || detailLoading || pickerLoading}
          type="button"
          on:click={swapComparedSides}
        >
          Swap sides
        </button>
        <button class="primary" disabled={!pickerCanCompare || loading} type="button" on:click={runCompare}>
          {#if loading}
            Comparing...
          {:else}
            Compare
          {/if}
        </button>
      </div>
    </header>

    {#if errorMessage}
      <p class="error-banner">{errorMessage}</p>
    {/if}

    <section class="setup-body">
      <aside class="setup-sidebar">
        <section class="sidebar-panel">
          <h2>Selection</h2>
          <dl class="definition-list">
            <div>
              <dt>Mode</dt>
              <dd>{mode === 'directory' ? 'Compare folders' : 'Compare files'}</dd>
            </div>
            <div>
              <dt>Left</dt>
              <dd>{leftExplorer.selectedTargetPath || 'Nothing selected yet'}</dd>
            </div>
            <div>
              <dt>Right</dt>
              <dd>{rightExplorer.selectedTargetPath || 'Nothing selected yet'}</dd>
            </div>
          </dl>
        </section>

        <section class="sidebar-panel">
          <h2>Options</h2>
          <div class="stacked-actions">
            <button
              class:active={ignoreWhitespace}
              class="secondary"
              aria-pressed={ignoreWhitespace}
              type="button"
              on:click={toggleIgnoreWhitespace}
            >
              Ignore whitespace
            </button>
            <button
              class:active={ignoreCase}
              class="secondary"
              aria-pressed={ignoreCase}
              type="button"
              on:click={toggleIgnoreCase}
            >
              Ignore case
            </button>
          </div>
        </section>

        <section class="sidebar-panel">
          <h2>Workflow</h2>
          <p class="sidebar-note">
            {mode === 'directory'
              ? 'Open the folders you want, mark one target on each side, then run the compare.'
              : 'Open the parent folders, choose one file on each side, then run the compare.'}
          </p>
          {#if sameSelectionWarning}
            <div class="setup-warning">
              <strong>Heads up</strong>
              <span>{sameSelectionWarning}</span>
            </div>
          {/if}
        </section>
      </aside>

      <section class="picker-workspace">
        {#each pickerSides as item}
          <section class="picker-pane">
            <header class="picker-pane-header">
              <div class="picker-pane-title">
                <strong>{item.pane.title}</strong>
                <span>{item.pane.currentPath || 'No folder open'}</span>
              </div>
              <div class="target-summary">
                <span>{mode === 'directory' ? 'Folder target' : 'File target'}</span>
                <strong>{item.pane.selectedTargetPath || 'Nothing selected'}</strong>
              </div>
            </header>

            {#if item.pane.error}
              <p class="pane-error">{item.pane.error}</p>
            {/if}

            <div class="picker-nav-row">
              <div class="nav-buttons">
                <button
                  class="secondary icon-button"
                  aria-label="Back"
                  disabled={!canGoBack(item.pane)}
                  title="Back"
                  type="button"
                  on:click={() => navigateHistory(item.side, -1)}
                >
                  <svg aria-hidden="true" class="nav-icon" viewBox="0 0 16 16">
                    <path d="M9.5 3.5 5 8l4.5 4.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
                  </svg>
                </button>
                <button
                  class="secondary icon-button"
                  aria-label="Forward"
                  disabled={!canGoForward(item.pane)}
                  title="Forward"
                  type="button"
                  on:click={() => navigateHistory(item.side, 1)}
                >
                  <svg aria-hidden="true" class="nav-icon" viewBox="0 0 16 16">
                    <path d="M6.5 3.5 11 8l-4.5 4.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
                  </svg>
                </button>
                <button
                  class="secondary icon-button"
                  aria-label="Up"
                  disabled={!item.pane.currentListing?.parentPath}
                  title="Up"
                  type="button"
                  on:click={() =>
                    item.pane.currentListing?.parentPath &&
                    navigateTo(item.side, item.pane.currentListing.parentPath)}
                >
                  <svg aria-hidden="true" class="nav-icon" viewBox="0 0 16 16">
                    <path d="M8 12.5v-9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6" />
                    <path d="M4.5 7 8 3.5 11.5 7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
                  </svg>
                </button>
              </div>

              <select
                class="drive-select"
                value={currentDrive(item.pane)}
                on:change={(event) => changeDrive(item.side, event.currentTarget.value)}
              >
                {#each item.pane.roots as root}
                  <option value={root.path}>{root.name}</option>
                {/each}
              </select>

              <input
                class="path-input"
                placeholder="Enter a file or folder path"
                type="text"
                value={item.pane.pathInput}
                on:input={(event) => updatePathInput(item.side, event.currentTarget.value)}
                on:keydown={(event) => event.key === 'Enter' && submitPathInput(item.side)}
              />
            </div>

            <div class="picker-action-row">
              <button class="secondary" type="button" on:click={() => browseSystem(item.side)}>
                System dialog
              </button>

              {#if mode === 'directory'}
                <button
                  class:active={isCurrentFolderSelected(item.pane)}
                  class="secondary"
                  disabled={!item.pane.currentPath}
                  type="button"
                  on:click={() => useCurrentFolder(item.side)}
                >
                  Use current folder
                </button>
              {/if}
            </div>

            <section class="list-pane explorer-list-pane">
              <div class="list-pane-header">
                <div class="list-columns">
                  <span>Name</span>
                  <span>Type</span>
                  <span>Modified</span>
                  <span>Size</span>
                </div>
              </div>

              <div class="list-rows">
                {#if pickerLoading}
                  <div class="empty-state">Loading drives...</div>
                {:else if item.pane.loading}
                  <div class="empty-state">Loading folder...</div>
                {:else if item.pane.currentListing}
                  {#each item.pane.currentListing.directories as entry}
                    <button
                      class:selected={isTargetSelected(item.pane, entry)}
                      class="entry-row"
                      type="button"
                      on:click={() => selectListEntry(item.side, entry)}
                      on:dblclick={() => activateListEntry(item.side, entry)}
                    >
                      <span class="entry-name">
                        <EntryIcon kind={entry.kind} open={false} />
                        <span class="entry-text">{entry.name}</span>
                      </span>
                      <span class="entry-type">{entryTypeLabel(entry)}</span>
                      <span class="entry-date">{formatModified(entry.modifiedMs)}</span>
                      <span class="entry-meta">-</span>
                    </button>
                  {/each}

                  {#each item.pane.currentListing.files as entry}
                    <button
                      class:selected={isTargetSelected(item.pane, entry)}
                      class="entry-row"
                      type="button"
                      on:click={() => selectListEntry(item.side, entry)}
                      on:dblclick={() => activateListEntry(item.side, entry)}
                    >
                      <span class="entry-name">
                        <EntryIcon kind={entry.kind} />
                        <span class="entry-text">{entry.name}</span>
                      </span>
                      <span class="entry-type">{entryTypeLabel(entry)}</span>
                      <span class="entry-date">{formatModified(entry.modifiedMs)}</span>
                      <span class="entry-meta">{formatSize(entry.size)}</span>
                    </button>
                  {/each}

                  {#if item.pane.currentListing.directories.length === 0 && item.pane.currentListing.files.length === 0}
                    <div class="empty-state">Folder is empty.</div>
                  {/if}
                {:else}
                  <div class="empty-state">No folder open.</div>
                {/if}
              </div>
            </section>
          </section>
        {/each}
      </section>
    </section>
  </main>
{:else}
  <main class="screen compare-screen">
    <header class="app-bar compare-bar">
      <div class="app-bar-main">
        <button class="secondary" type="button" on:click={goToSetup}>Setup</button>
        <div class="compare-summary">
          <strong>{compareSummary}</strong>
          <span>{mode === 'directory' ? 'Directory compare' : 'File compare'}</span>
        </div>
      </div>

      <div class="app-bar-actions compare-actions">
        <button
          class="secondary theme-toggle"
          aria-label={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} mode`}
          title={themeToggleLabel}
          type="button"
          on:click={toggleThemeMode}
        >
          {#if themeMode === 'dark'}
            <svg aria-hidden="true" class="theme-icon" viewBox="0 0 16 16">
              <path d="M8 3.2v-1.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="M8 14.5v-1.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="M12.1 8h1.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="M2.2 8h1.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="m11 5 1.2-1.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="m3.8 12.2 1.2-1.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="m11 11 1.2 1.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="m3.8 3.8 1.2 1.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <circle cx="8" cy="8" r="2.6" fill="none" stroke="currentColor" stroke-width="1.4" />
            </svg>
          {:else}
            <svg aria-hidden="true" class="theme-icon" viewBox="0 0 16 16">
              <path
                d="M10.9 11.9a4.9 4.9 0 0 1-5.8-6.7 5.2 5.2 0 1 0 5.8 6.7Z"
                fill="none"
                stroke="currentColor"
                stroke-linejoin="round"
                stroke-width="1.4"
              />
            </svg>
          {/if}
        </button>
        <button class:active={viewMode === 'unified'} class="secondary" type="button" on:click={toggleViewMode}>
          {viewMode === 'sideBySide' ? 'Unified view' : 'Side by side'}
        </button>

        <div class="inline-actions">
          <button
            class:active={showFullFile}
            class="secondary"
            type="button"
            on:click={() => (showFullFile = !showFullFile)}
          >
            Full file
          </button>
          <button
            class:active={showInlineHighlights}
            class="secondary"
            type="button"
            on:click={() => (showInlineHighlights = !showInlineHighlights)}
          >
            Inline highlights
          </button>
          <button
            class:active={ignoreWhitespace}
            class="secondary"
            aria-pressed={ignoreWhitespace}
            type="button"
            on:click={toggleIgnoreWhitespace}
          >
            Ignore whitespace
          </button>
          <button
            class:active={ignoreCase}
            class="secondary"
            aria-pressed={ignoreCase}
            type="button"
            on:click={toggleIgnoreCase}
          >
            Ignore case
          </button>
        </div>

        <button
          class="secondary swap-button"
          aria-label="Switch left and right sides"
          disabled={loading || detailLoading || pickerLoading}
          title="Switch left and right sides"
          type="button"
          on:click={swapComparedSides}
        >
          <svg aria-hidden="true" class="swap-icon" viewBox="0 0 16 16">
            <path d="M2.5 5h8.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6" />
            <path d="m8.5 2 3 3-3 3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
            <path d="M13.5 11H5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6" />
            <path d="m7.5 8-3 3 3 3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
          </svg>
          <span>Swap sides</span>
        </button>

        <button class="primary" type="button" disabled={loading} on:click={runCompare}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </header>

    {#if errorMessage}
      <p class="error-banner">{errorMessage}</p>
    {/if}

    <section class:refreshing={loading} class="compare-context">
      <div class="context-card compact">
        <span>Left</span>
        <strong>{leftPath}</strong>
      </div>
      <div class="context-card compact">
        <span>Right</span>
        <strong>{rightPath}</strong>
      </div>
    </section>

    <section class:single-pane={mode === 'file'} class="compare-layout">
      {#if mode === 'directory'}
        <aside class:refreshing={loading} class="file-browser">
          <header class="browser-header">
            <div class="browser-title">
              <h2>Changed items</h2>
              <span>{directoryEntries.length} total</span>
            </div>

            {#if directoryStatusSummary.length > 0}
              <div class="status-summary">
                {#each directoryStatusSummary as item}
                  <span class={`status-chip ${item.status}`}>{item.label} {item.count}</span>
                {/each}
              </div>
            {/if}
          </header>

          {#if visibleFolderSections.length === 0}
            <div class="empty-state">No differing files found.</div>
          {:else}
            <div class="browser-list">
              {#each visibleFolderSections as group}
                <section class="file-group">
                  <button
                    class="group-toggle"
                    style={`padding-left: ${group.depth * 14 + 10}px`}
                    type="button"
                    on:click={() => toggleGroup(group.key)}
                  >
                    <span class="chevron">
                      <svg aria-hidden="true" class:collapsed={collapsedGroups[group.key]} class="chevron-icon" viewBox="0 0 16 16">
                        <path d="m5.25 3.75 4.5 4.25-4.5 4.25" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" />
                      </svg>
                    </span>
                    <span class="group-label">{group.label}</span>
                    <span class="group-count">{group.totalCount}</span>
                  </button>

                  {#if !collapsedGroups[group.key] && group.entries.length > 0}
                    <div class="file-list">
                      {#each group.entries as entry}
                        <button
                          class:selected={selectedRelativePath === entry.relativePath}
                          class="file-row"
                          type="button"
                          on:click={() => selectEntry(entry)}
                        >
                          <span class="file-row-top">
                            <EntryIcon kind="file" />
                            <span class="entry-text">{getFileName(entry.relativePath)}</span>
                          </span>
                          <span class="file-row-bottom">
                            <span class={`status-chip ${entry.status}`}>{statusLabel[entry.status]}</span>
                            <span>{formatSize(entry.leftSize)} / {formatSize(entry.rightSize)}</span>
                          </span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </section>
              {/each}
            </div>
          {/if}
        </aside>
      {/if}

      <section class:refreshing={loading} class="viewer">
        {#if activeDiff}
          {#if activeDiff.contentKind !== 'text'}
            <div class="message-card">{activeDiff.summary}</div>
          {:else if viewMode === 'sideBySide'}
            <div class="split-view">
              <section class="diff-pane">
                <div class="pane-header">
                  <span>Left</span>
                  <div class="pane-source">
                    <strong>{getFileName(activeDiff.leftLabel)}</strong>
                    <span class="pane-path">{activeDiff.leftLabel}</span>
                  </div>
                </div>
                <div
                  bind:this={leftPaneScroll}
                  class="pane-scroll"
                  on:scroll={() => syncPaneScroll('left')}
                >
                  <div class="pane-grid">
                    {#if sideBySideRenderItems.length === 0}
                      <div class="empty-inline-state">No changed lines.</div>
                    {/if}

                    {#each sideBySideRenderItems as item}
                      {#if item.type === 'hunk'}
                        <div class="hunk-row">{item.header}</div>
                      {:else if item.row}
                        <div class={`diff-row ${item.row.left?.change ?? 'context'}`}>
                          {#if item.row.left}
                            <span class="line-number">{item.row.left.lineNumber ?? ''}</span>
                            <span class="prefix">{item.row.left.prefix}</span>
                            <span class="line-text">
                              {#each item.row.left.segments as segment}
                                <span
                                  class:highlighted={showInlineHighlights && segment.highlighted}
                                  class="line-fragment"
                                >
                                  {segment.text || ' '}
                                </span>
                              {/each}
                            </span>
                          {/if}
                        </div>
                      {/if}
                    {/each}
                  </div>
                </div>
              </section>

              <section class="diff-pane">
                <div class="pane-header">
                  <span>Right</span>
                  <div class="pane-source">
                    <strong>{getFileName(activeDiff.rightLabel)}</strong>
                    <span class="pane-path">{activeDiff.rightLabel}</span>
                  </div>
                </div>
                <div
                  bind:this={rightPaneScroll}
                  class="pane-scroll"
                  on:scroll={() => syncPaneScroll('right')}
                >
                  <div class="pane-grid">
                    {#if sideBySideRenderItems.length === 0}
                      <div class="empty-inline-state">No changed lines.</div>
                    {/if}

                    {#each sideBySideRenderItems as item}
                      {#if item.type === 'hunk'}
                        <div class="hunk-row">{item.header}</div>
                      {:else if item.row}
                        <div class={`diff-row ${item.row.right?.change ?? 'context'}`}>
                          {#if item.row.right}
                            <span class="line-number">{item.row.right.lineNumber ?? ''}</span>
                            <span class="prefix">{item.row.right.prefix}</span>
                            <span class="line-text">
                              {#each item.row.right.segments as segment}
                                <span
                                  class:highlighted={showInlineHighlights && segment.highlighted}
                                  class="line-fragment"
                                >
                                  {segment.text || ' '}
                                </span>
                              {/each}
                            </span>
                          {/if}
                        </div>
                      {/if}
                    {/each}
                  </div>
                </div>
              </section>
            </div>
          {:else}
            <div class="viewer-header">
              <div class="viewer-source">
                <span>Left</span>
                <strong>{getFileName(activeDiff.leftLabel)}</strong>
                <span class="pane-path">{activeDiff.leftLabel}</span>
              </div>
              <div class="viewer-source">
                <span>Right</span>
                <strong>{getFileName(activeDiff.rightLabel)}</strong>
                <span class="pane-path">{activeDiff.rightLabel}</span>
              </div>
            </div>
            <div class="unified-grid">
              {#if unifiedRenderItems.length === 0}
                <div class="empty-inline-state">No changed lines.</div>
              {/if}

              {#each unifiedRenderItems as item}
                {#if item.type === 'hunk'}
                  <div class="hunk-row unified-hunk">{item.header}</div>
                {:else if item.row}
                  <div class={`unified-row ${item.row.change}`}>
                    <span class="line-number">{item.row.leftLineNumber ?? ''}</span>
                    <span class="line-number">{item.row.rightLineNumber ?? ''}</span>
                    <span class="prefix">{item.row.prefix}</span>
                    <span class="line-text">
                      {#each item.row.segments as segment}
                        <span
                          class:highlighted={showInlineHighlights && segment.highlighted}
                          class="line-fragment"
                        >
                          {segment.text || ' '}
                        </span>
                      {/each}
                    </span>
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
          {#if detailLoading}
            <div class="viewer-loading">Refreshing diff...</div>
          {/if}
        {:else if detailLoading}
          <div class="empty-state">Loading diff...</div>
        {:else}
          <div class="empty-state">Run a compare to see the result.</div>
        {/if}
      </section>
    </section>
  </main>
{/if}

