<script lang="ts">
  import { convertFileSrc } from '@tauri-apps/api/core'
  import { onDestroy, tick } from 'svelte'
  import { formatSize } from './format'
  import { detectSyntaxLanguage, renderDiffFragments } from './syntax'
  import type { RenderedDiffFragment } from './syntax'
  import type {
    BinaryDiffPayload,
    BinaryFileMeta,
    DiffCell,
    FileDiffResult,
    ImageDiffPayload,
    SideBySideRow,
    UnifiedLine,
    ViewMode,
  } from './types'
  import type {
    DiffHeaderContext,
    DiffHunkRange,
    SideBySideRenderItem,
    UnifiedRenderItem,
  } from './ui-types'

  export let activeDiff: FileDiffResult | null
  export let loading: boolean
  export let detailLoading: boolean
  export let viewMode: ViewMode
  export let currentDiffHunk: number
  export let showFullFile: boolean
  export let showInlineHighlights: boolean
  export let wrapSideBySideLines: boolean
  export let showSyntaxHighlighting: boolean
  export let syncSideBySideScroll: boolean
  export let sideBySideRenderItems: SideBySideRenderItem[]
  export let unifiedRenderItems: UnifiedRenderItem[]
  export let sideBySideHunkRanges: DiffHunkRange[]
  export let unifiedHunkRanges: DiffHunkRange[]
  export let diffHeaderContext: DiffHeaderContext
  export let diffFontSize = '11px'
  export let diffRowLineHeight = '14px'
  export let diffRowHeight = '19px'
  export let syncPaneWheel: (event: WheelEvent, source: 'left' | 'right') => void
  export let syncPaneScroll: (source: 'left' | 'right') => void
  export let scrollDiffHunkIntoView: (targetIndex: number) => void
  export let scheduleScrollNavigationRefresh: () => void
  export let leftPaneScroll: HTMLDivElement | null = null
  export let rightPaneScroll: HTMLDivElement | null = null
  export let unifiedScroll: HTMLDivElement | null = null
  let leftPaneScrollShell: HTMLDivElement | null = null
  let rightPaneScrollShell: HTMLDivElement | null = null
  let unifiedScrollShell: HTMLDivElement | null = null
  let leftPaneHorizontalScroll: HTMLDivElement | null = null
  let rightPaneHorizontalScroll: HTMLDivElement | null = null
  let unifiedHorizontalScroll: HTMLDivElement | null = null
  let leftPaneBottomScrollbar: HTMLDivElement | null = null
  let rightPaneBottomScrollbar: HTMLDivElement | null = null
  let unifiedBottomScrollbar: HTMLDivElement | null = null
  let leftPaneGrid: HTMLDivElement | null = null
  let rightPaneGrid: HTMLDivElement | null = null
  let unifiedContentGrid: HTMLDivElement | null = null
  let leftScrollMarkers: ScrollMarker[] = []
  let rightScrollMarkers: ScrollMarker[] = []
  let unifiedScrollMarkers: ScrollMarker[] = []
  let syntaxLanguage: ReturnType<typeof detectSyntaxLanguage> = null
  let sideBySideContentWidth = 0
  let unifiedContentWidth = 0
  let leftPaneTrailingSpace = 0
  let rightPaneTrailingSpace = 0
  let pinSplitBottomScrollbar = false
  let pinUnifiedBottomScrollbar = false
  let rowHeightPx = 19
  let lineNumberColumnWidth = 'calc(1ch + 18px)'
  let prefixColumnWidth = 'calc(1ch + 8px)'
  let scrollMarkerRefreshQueued = false
  let scrollMarkerObserver: ResizeObserver | null = null
  let splitHorizontalScrollSyncLocked = false
  let unifiedHorizontalScrollSyncLocked = false
  let imageDiff: ImageDiffPayload | null = null
  let binaryDiff: BinaryDiffPayload | null = null
  let leftImageError = false
  let rightImageError = false
  let leftImageRetried = false
  let rightImageRetried = false
  let imageBg: 'checker' | 'white' | 'black' = 'checker'
  let virtualizeSideBySide = false
  let virtualizeUnified = false
  let leftVirtualRange: VirtualRange = { start: 0, end: 0, topPadding: 0, bottomPadding: 0 }
  let rightVirtualRange: VirtualRange = { start: 0, end: 0, topPadding: 0, bottomPadding: 0 }
  let unifiedVirtualRange: VirtualRange = { start: 0, end: 0, topPadding: 0, bottomPadding: 0 }
  let leftVisibleSideBySideItems: SideBySideRenderItem[] = []
  let rightVisibleSideBySideItems: SideBySideRenderItem[] = []
  let visibleUnifiedItems: UnifiedRenderItem[] = []
  let sideBySideVirtualAnchors: VirtualHunkAnchor[] = []
  let unifiedVirtualAnchors: VirtualHunkAnchor[] = []
  let leftVirtualScrollTop = 0
  let rightVirtualScrollTop = 0
  let unifiedVirtualScrollTop = 0
  let leftVirtualViewportHeight = 0
  let rightVirtualViewportHeight = 0
  let unifiedVirtualViewportHeight = 0
  const emptyBinaryMeta: BinaryFileMeta = {
    exists: false,
    path: '',
    size: null,
    sha256: null,
    format: null,
    identicalToOtherSide: false,
  }
  const diffCellFragmentCache = new WeakMap<DiffCell, CachedFragments>()
  const unifiedLineFragmentCache = new WeakMap<UnifiedLine, CachedFragments>()

  interface CachedFragments {
    fragments: RenderedDiffFragment[]
    syntaxKey: string
  }

  interface ScrollMarker {
    hunkIndex: number
    top: number
    height: number
    kind: 'insert' | 'delete' | 'mixed'
  }

  interface VirtualRange {
    start: number
    end: number
    topPadding: number
    bottomPadding: number
  }

  interface VirtualHunkAnchor {
    hunkIndex: number
    top: number
    height: number
    kind: ScrollMarker['kind']
  }

  const FULL_FILE_VIRTUALIZATION_MIN_ROWS = 200
  const FULL_FILE_VIRTUALIZATION_BASE_OVERSCAN = 40
  const LARGE_FULL_FILE_FRAGMENT_SIMPLIFICATION_ROWS = 600
  const HUGE_FILE_THRESHOLD = 3000

  const emptyVirtualRange: VirtualRange = {
    start: 0,
    end: 0,
    topPadding: 0,
    bottomPadding: 0,
  }

  const emptyVirtualAnchors: VirtualHunkAnchor[] = []
  const plainRenderedFragments = (text: string) =>
    [
      {
        text,
        highlighted: false,
        className: null,
      },
    ] satisfies RenderedDiffFragment[]

  $: rowHeightPx = Math.max(1, Number.parseFloat(diffRowHeight) || 19)

  $: virtualizeSideBySide =
    activeDiff?.contentKind === 'text' &&
    viewMode === 'sideBySide' &&
    showFullFile &&
    !wrapSideBySideLines &&
    activeDiff.sideBySide.length > FULL_FILE_VIRTUALIZATION_MIN_ROWS

  $: virtualizeUnified =
    activeDiff?.contentKind === 'text' &&
    viewMode === 'unified' &&
    showFullFile &&
    activeDiff.unified.length > FULL_FILE_VIRTUALIZATION_MIN_ROWS

  $: leftVirtualRange = virtualizeSideBySide
    ? buildVirtualRange(
        activeDiff?.contentKind === 'text' ? activeDiff.sideBySide.length : 0,
        leftVirtualScrollTop,
        leftVirtualViewportHeight,
        rowHeightPx,
      )
    : emptyVirtualRange

  $: rightVirtualRange = virtualizeSideBySide
    ? buildVirtualRange(
        activeDiff?.contentKind === 'text' ? activeDiff.sideBySide.length : 0,
        rightVirtualScrollTop,
        rightVirtualViewportHeight,
        rowHeightPx,
      )
    : emptyVirtualRange

  $: unifiedVirtualRange = virtualizeUnified
    ? buildVirtualRange(
        activeDiff?.contentKind === 'text' ? activeDiff.unified.length : 0,
        unifiedVirtualScrollTop,
        unifiedVirtualViewportHeight,
        rowHeightPx,
      )
    : emptyVirtualRange

  $: leftVisibleSideBySideItems = virtualizeSideBySide
    ? buildVisibleFullFileSideBySideItems(
        activeDiff?.contentKind === 'text' ? activeDiff.sideBySide : [],
        sideBySideHunkRanges,
        leftVirtualRange.start,
        leftVirtualRange.end,
      )
    : sideBySideRenderItems

  $: rightVisibleSideBySideItems = virtualizeSideBySide
    ? buildVisibleFullFileSideBySideItems(
        activeDiff?.contentKind === 'text' ? activeDiff.sideBySide : [],
        sideBySideHunkRanges,
        rightVirtualRange.start,
        rightVirtualRange.end,
      )
    : sideBySideRenderItems

  $: visibleUnifiedItems = virtualizeUnified
    ? buildVisibleFullFileUnifiedItems(
        activeDiff?.contentKind === 'text' ? activeDiff.unified : [],
        unifiedHunkRanges,
        unifiedVirtualRange.start,
        unifiedVirtualRange.end,
      )
    : unifiedRenderItems

  $: sideBySideVirtualAnchors =
    virtualizeSideBySide && activeDiff?.contentKind === 'text'
      ? buildSideBySideVirtualAnchors(activeDiff.sideBySide, sideBySideHunkRanges, rowHeightPx)
      : emptyVirtualAnchors

  $: unifiedVirtualAnchors =
    virtualizeUnified && activeDiff?.contentKind === 'text'
      ? buildUnifiedVirtualAnchors(activeDiff.unified, unifiedHunkRanges, rowHeightPx)
      : emptyVirtualAnchors

  $: simplifyVirtualizedContextFragments =
    activeDiff?.contentKind === 'text' && showFullFile && (virtualizeSideBySide || virtualizeUnified)

  $: simplifyLargeFullFileFragments =
    activeDiff?.contentKind === 'text' &&
    showFullFile &&
    ((virtualizeSideBySide &&
      activeDiff.sideBySide.length >= LARGE_FULL_FILE_FRAGMENT_SIMPLIFICATION_ROWS) ||
      (virtualizeUnified && activeDiff.unified.length >= LARGE_FULL_FILE_FRAGMENT_SIMPLIFICATION_ROWS))

  $: simplifyHugeFileFragments =
    activeDiff?.contentKind === 'text' &&
    showFullFile &&
    ((virtualizeSideBySide && activeDiff.sideBySide.length >= HUGE_FILE_THRESHOLD) ||
      (virtualizeUnified && activeDiff.unified.length >= HUGE_FILE_THRESHOLD))

  $: syntaxLanguage = activeDiff ? detectSyntaxLanguage(activeDiff.rightLabel) : null

  $: {
    const maxLineNumber = activeDiff
      ? activeDiff.sideBySide.reduce((maxValue, row) => {
          const leftLineNumber = row.left?.lineNumber ?? 0
          const rightLineNumber = row.right?.lineNumber ?? 0
          return Math.max(maxValue, leftLineNumber, rightLineNumber)
        }, 0)
      : 0
    const digitCount = Math.max(1, String(maxLineNumber).length)

    lineNumberColumnWidth = `calc(${digitCount}ch + 18px)`
    prefixColumnWidth = 'calc(1ch + 6px)'
  }

  $: if (activeDiff?.contentKind === 'text' && viewMode === 'sideBySide') {
    sideBySideRenderItems
    wrapSideBySideLines
    void updateSideBySideContentMetrics()
  }

  $: if (activeDiff?.contentKind === 'text' && viewMode === 'unified') {
    unifiedRenderItems
    void updateUnifiedContentWidth()
  }

  $: if (activeDiff?.contentKind === 'text') {
    viewMode
    wrapSideBySideLines
    diffFontSize
    diffRowLineHeight
    diffRowHeight
    sideBySideRenderItems
    unifiedRenderItems
    scheduleScrollMarkerRefresh()
  } else {
    leftScrollMarkers = []
    rightScrollMarkers = []
    unifiedScrollMarkers = []
  }

  $: imageDiff = activeDiff?.contentKind === 'image' ? activeDiff.image ?? null : null
  $: if (activeDiff) { leftImageError = false; rightImageError = false; leftImageRetried = false; rightImageRetried = false }

  $: binaryDiff = activeDiff?.contentKind === 'binary' ? activeDiff.binary ?? null : null

  $: {
    leftPaneScroll
    rightPaneScroll
    unifiedScroll
    leftPaneGrid
    rightPaneGrid
    unifiedContentGrid
    syncScrollMarkerObserver()
  }

  $: {
    leftPaneScroll
    rightPaneScroll
    unifiedScroll
    sideBySideRenderItems
    unifiedRenderItems
    virtualizeSideBySide
    virtualizeUnified
    void tick().then(() => {
      syncVirtualViewportState()
    })
  }

  function getFragmentModeKey(change: 'context' | 'delete' | 'insert') {
    if (simplifyHugeFileFragments) {
      return 'plain-huge-file'
    }

    if (simplifyLargeFullFileFragments) {
      return 'plain-large-file'
    }

    if (simplifyVirtualizedContextFragments && change === 'context') {
      return 'plain-context-file'
    }

    if (!showInlineHighlights && !showSyntaxHighlighting) {
      return 'plain-static'
    }

    return showSyntaxHighlighting && syntaxLanguage ? syntaxLanguage : ''
  }

  function getCachedDiffCellFragments(cell: DiffCell) {
    const syntaxKey = getFragmentModeKey(cell.change)
    const cached = diffCellFragmentCache.get(cell)

    if (cached && cached.syntaxKey === syntaxKey) {
      return cached.fragments
    }

    const fragments = syntaxKey.startsWith('plain-')
      ? plainRenderedFragments(cell.text)
      : renderDiffFragments(cell.text, cell.segments, syntaxKey ? syntaxLanguage : null)

    diffCellFragmentCache.set(cell, { fragments, syntaxKey })
    return fragments
  }

  function getCachedUnifiedLineFragments(line: UnifiedLine) {
    const syntaxKey = getFragmentModeKey(line.change)
    const cached = unifiedLineFragmentCache.get(line)

    if (cached && cached.syntaxKey === syntaxKey) {
      return cached.fragments
    }

    const fragments = syntaxKey.startsWith('plain-')
      ? plainRenderedFragments(line.text)
      : renderDiffFragments(line.text, line.segments, syntaxKey ? syntaxLanguage : null)

    unifiedLineFragmentCache.set(line, { fragments, syntaxKey })
    return fragments
  }

  function formatBinarySizeValue(size: number | null) {
    return formatSize(size)
  }

  function formatBinaryHashShort(hash: string | null) {
    if (!hash) {
      return '-'
    }

    if (hash.length <= 16) {
      return hash
    }

    return `${hash.slice(0, 8)}...${hash.slice(-8)}`
  }

  function formatBinaryFormatLabel(format: string | null, exists: boolean) {
    if (!exists) {
      return 'Missing'
    }

    return format || 'Unknown'
  }

  function formatBinaryOffset(offset: number) {
    return offset.toString(16).toUpperCase().padStart(8, '0')
  }

  function resolveImageSource(assetUrl: string | null, meta: BinaryFileMeta) {
    // Prefer convertFileSrc — adapts to dev/prod runtime automatically
    if (meta.exists && meta.path) {
      return convertFileSrc(meta.path)
    }

    if (assetUrl) {
      return assetUrl
    }

    return null
  }

  function resolveImageFallbackSource(assetUrl: string | null, meta: BinaryFileMeta) {
    // Fallback: try the Rust-provided asset:// URL if convertFileSrc failed
    if (assetUrl) {
      return assetUrl
    }

    return null
  }

  // --- Binary hex helpers (derive from raw bytes, no pre-built rows) ---

  const HEX_LOOKUP: string[] = []
  for (let i = 0; i < 256; i++) {
    HEX_LOOKUP.push(i.toString(16).toUpperCase().padStart(2, '0'))
  }

  function byteToHex(b: number): string {
    return HEX_LOOKUP[b]
  }

  function byteToAscii(b: number): string {
    return b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'
  }

  function isBinaryRowChangedFromBytes(
    leftBytes: number[],
    rightBytes: number[],
    rowOffset: number,
    bytesPerRow: number,
  ): boolean {
    for (let i = 0; i < bytesPerRow; i++) {
      const idx = rowOffset + i
      const l = idx < leftBytes.length ? leftBytes[idx] : -1
      const r = idx < rightBytes.length ? rightBytes[idx] : -1
      if (l !== r) return true
    }
    return false
  }

  // Binary hex virtualization state
  let binaryHexScroll: HTMLDivElement | null = null
  let binaryVirtualStart = 0
  let binaryVirtualEnd = 0
  const BINARY_ROW_HEIGHT = 19
  const BINARY_OVERSCAN = 20

  function computeBinaryTotalRows(diff: BinaryDiffPayload): number {
    const total = Math.max(diff.leftBytes.length, diff.rightBytes.length)
    return Math.ceil(total / diff.bytesPerRow)
  }

  function updateBinaryVirtualRange() {
    if (!binaryHexScroll || !binaryDiff) return
    const totalRows = computeBinaryTotalRows(binaryDiff)
    const scrollTop = binaryHexScroll.scrollTop
    const viewportHeight = binaryHexScroll.clientHeight || 800
    const start = Math.max(0, Math.floor(scrollTop / BINARY_ROW_HEIGHT) - BINARY_OVERSCAN)
    const visibleCount = Math.ceil(viewportHeight / BINARY_ROW_HEIGHT)
    const end = Math.min(totalRows, start + visibleCount + BINARY_OVERSCAN * 2)
    binaryVirtualStart = start
    binaryVirtualEnd = end
  }

  function onBinaryHexScroll() {
    updateBinaryVirtualRange()
  }

  // Initialize virtual range immediately from data (no DOM needed for first render)
  $: if (binaryDiff) {
    const totalRows = computeBinaryTotalRows(binaryDiff)
    binaryVirtualStart = 0
    binaryVirtualEnd = Math.min(totalRows, 100)
  }

  // Refine to actual viewport once scroll container is mounted
  $: if (binaryDiff && binaryHexScroll) {
    requestAnimationFrame(() => updateBinaryVirtualRange())
  }

  function getBinarySummaryChips(
    kind: 'image' | 'binary',
    leftMeta: BinaryFileMeta | null | undefined,
    rightMeta: BinaryFileMeta | null | undefined,
    diff: BinaryDiffPayload | null = null,
  ) {
    const resolvedLeftMeta = leftMeta ?? emptyBinaryMeta
    const resolvedRightMeta = rightMeta ?? emptyBinaryMeta
    const chips = [
      `Left ${formatBinaryFormatLabel(resolvedLeftMeta.format, resolvedLeftMeta.exists)}`,
      `Right ${formatBinaryFormatLabel(resolvedRightMeta.format, resolvedRightMeta.exists)}`,
    ]

    if (kind === 'binary' && diff) {
      chips.push(`${diff.changedRowCount ?? 0} changed rows`)

      if (diff.truncated) {
        chips.push('Truncated')
      }
    }

    if (
      resolvedLeftMeta.exists &&
      resolvedRightMeta.exists &&
      resolvedLeftMeta.identicalToOtherSide &&
      resolvedRightMeta.identicalToOtherSide
    ) {
      chips.push(kind === 'image' ? 'Hashes match' : 'Byte-identical')
    } else if (resolvedLeftMeta.exists && resolvedRightMeta.exists) {
      chips.push(kind === 'image' ? 'Hashes differ' : 'Byte differences present')
    }

    return chips
  }

  function findIntersectingHunkIndex(hunks: DiffHunkRange[], rowIndex: number) {
    let low = 0
    let high = hunks.length - 1

    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      const hunk = hunks[middle]

      if (rowIndex < hunk.start) {
        high = middle - 1
        continue
      }

      if (rowIndex > hunk.end) {
        low = middle + 1
        continue
      }

      return middle
    }

    return low
  }

  function buildVisibleFullFileSideBySideItems(
    rows: SideBySideRow[],
    hunks: DiffHunkRange[],
    start: number,
    end: number,
  ) {
    const items: SideBySideRenderItem[] = []
    let hunkIndex = findIntersectingHunkIndex(hunks, start)

    for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
      const row = rows[rowIndex]

      while (hunkIndex < hunks.length && hunks[hunkIndex].end < rowIndex) {
        hunkIndex += 1
      }

      const activeHunk = hunks[hunkIndex]
      const rowHunkIndex =
        activeHunk && activeHunk.start <= rowIndex && activeHunk.end >= rowIndex
          ? hunkIndex
          : undefined

      items.push({
        type: 'row',
        row,
        hunkIndex: rowHunkIndex,
        isAnchor: rowHunkIndex !== undefined && activeHunk?.start === rowIndex,
      })
    }

    return items
  }

  function buildVisibleFullFileUnifiedItems(
    rows: UnifiedLine[],
    hunks: DiffHunkRange[],
    start: number,
    end: number,
  ) {
    const items: UnifiedRenderItem[] = []
    let hunkIndex = findIntersectingHunkIndex(hunks, start)

    for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
      const row = rows[rowIndex]

      while (hunkIndex < hunks.length && hunks[hunkIndex].end < rowIndex) {
        hunkIndex += 1
      }

      const activeHunk = hunks[hunkIndex]
      const rowHunkIndex =
        activeHunk && activeHunk.start <= rowIndex && activeHunk.end >= rowIndex
          ? hunkIndex
          : undefined

      items.push({
        type: 'row',
        row,
        hunkIndex: rowHunkIndex,
        isAnchor: rowHunkIndex !== undefined && activeHunk?.start === rowIndex,
      })
    }

    return items
  }

  function getEffectiveOverscan(itemCount: number): number {
    if (itemCount > 5000) return 12
    if (itemCount > HUGE_FILE_THRESHOLD) return 20
    if (itemCount > 1000) return 30
    return FULL_FILE_VIRTUALIZATION_BASE_OVERSCAN
  }

  function buildVirtualRange(
    itemCount: number,
    scrollTop: number,
    viewportHeight: number,
    rowHeight: number,
  ): VirtualRange {
    if (itemCount === 0) {
      return emptyVirtualRange
    }

    const overscan = getEffectiveOverscan(itemCount)
    const snappedRow = Math.floor(scrollTop / rowHeight)
    const visibleRows = Math.max(1, Math.ceil(viewportHeight / rowHeight))
    const start = Math.max(0, snappedRow - overscan)
    const end = Math.min(itemCount, snappedRow + visibleRows + overscan)

    return {
      start,
      end,
      topPadding: start * rowHeight,
      bottomPadding: Math.max(0, (itemCount - end) * rowHeight),
    }
  }

  function buildSideBySideVirtualAnchors(
    rows: FileDiffResult['sideBySide'],
    hunks: DiffHunkRange[],
    rowHeight: number,
  ): VirtualHunkAnchor[] {
    return hunks.map((hunk, hunkIndex) => ({
      hunkIndex,
      top: hunk.start * rowHeight,
      height: Math.max(rowHeight, (hunk.end - hunk.start + 1) * rowHeight),
      kind: classifySideBySideHunk(rows, hunk),
    }))
  }

  function buildUnifiedVirtualAnchors(
    rows: FileDiffResult['unified'],
    hunks: DiffHunkRange[],
    rowHeight: number,
  ): VirtualHunkAnchor[] {
    return hunks.map((hunk, hunkIndex) => ({
      hunkIndex,
      top: hunk.start * rowHeight,
      height: Math.max(rowHeight, (hunk.end - hunk.start + 1) * rowHeight),
      kind: classifyUnifiedHunk(rows, hunk),
    }))
  }

  function classifySideBySideHunk(rows: FileDiffResult['sideBySide'], hunk: DiffHunkRange) {
    let sawInsert = false
    let sawDelete = false

    for (let index = hunk.start; index <= hunk.end; index += 1) {
      const row = rows[index]

      if (!row) {
        continue
      }

      if (row.left?.change === 'delete' || row.right?.change === 'delete') {
        sawDelete = true
      }

      if (row.left?.change === 'insert' || row.right?.change === 'insert') {
        sawInsert = true
      }

      if (sawInsert && sawDelete) {
        return 'mixed' satisfies ScrollMarker['kind']
      }
    }

    if (sawInsert) {
      return 'insert' satisfies ScrollMarker['kind']
    }

    if (sawDelete) {
      return 'delete' satisfies ScrollMarker['kind']
    }

    return 'mixed' satisfies ScrollMarker['kind']
  }

  function classifyUnifiedHunk(rows: FileDiffResult['unified'], hunk: DiffHunkRange) {
    let sawInsert = false
    let sawDelete = false

    for (let index = hunk.start; index <= hunk.end; index += 1) {
      const row = rows[index]

      if (!row) {
        continue
      }

      if (row.change === 'delete') {
        sawDelete = true
      }

      if (row.change === 'insert') {
        sawInsert = true
      }

      if (sawInsert && sawDelete) {
        return 'mixed' satisfies ScrollMarker['kind']
      }
    }

    if (sawInsert) {
      return 'insert' satisfies ScrollMarker['kind']
    }

    if (sawDelete) {
      return 'delete' satisfies ScrollMarker['kind']
    }

    return 'mixed' satisfies ScrollMarker['kind']
  }

  let virtualSyncRafId: number | null = null

  function syncVirtualViewportState() {
    leftVirtualScrollTop = leftPaneScroll?.scrollTop ?? 0
    rightVirtualScrollTop = rightPaneScroll?.scrollTop ?? 0
    unifiedVirtualScrollTop = unifiedScroll?.scrollTop ?? 0
    leftVirtualViewportHeight = leftPaneScroll?.clientHeight ?? 0
    rightVirtualViewportHeight = rightPaneScroll?.clientHeight ?? 0
    unifiedVirtualViewportHeight = unifiedScroll?.clientHeight ?? 0
  }

  function throttledVirtualViewportSync() {
    if (virtualSyncRafId !== null) {
      return
    }

    virtualSyncRafId = requestAnimationFrame(() => {
      virtualSyncRafId = null
      syncVirtualViewportState()
    })
  }

  async function updateSideBySideContentMetrics() {
    await tick()

    if (!leftPaneScroll || !rightPaneScroll || !leftPaneGrid || !rightPaneGrid) {
      sideBySideContentWidth = 0
      leftPaneTrailingSpace = 0
      rightPaneTrailingSpace = 0
      pinSplitBottomScrollbar = false
      return
    }

    if (wrapSideBySideLines) {
      sideBySideContentWidth = 0
    } else {
      sideBySideContentWidth = Math.max(
        leftPaneGrid.scrollWidth,
        rightPaneGrid.scrollWidth,
        leftPaneScroll.clientWidth,
        rightPaneScroll.clientWidth,
      )
    }

    const bottomScrollbarFootprint = getBottomScrollbarFootprint(
      leftPaneBottomScrollbar,
      rightPaneBottomScrollbar,
    )
    const leftContentHeight = getRenderedContentHeight(leftPaneGrid) - leftPaneTrailingSpace
    const rightContentHeight = getRenderedContentHeight(rightPaneGrid) - rightPaneTrailingSpace
    const leftViewportHeight = getViewportHeight(leftPaneScroll)
    const rightViewportHeight = getViewportHeight(rightPaneScroll)
    const leftMaxScrollTop = Math.max(0, leftContentHeight - leftViewportHeight)
    const rightMaxScrollTop = Math.max(0, rightContentHeight - rightViewportHeight)
    const sharedMaxScrollTop = Math.max(leftMaxScrollTop, rightMaxScrollTop)
    const leftShellHeight = getViewportHeight(leftPaneScrollShell)
    const rightShellHeight = getViewportHeight(rightPaneScrollShell)
    const leftNeedsPinnedScrollbar = pinSplitBottomScrollbar
      ? leftContentHeight + bottomScrollbarFootprint - leftShellHeight > 0.25
      : leftPaneScroll.scrollHeight - leftPaneScroll.clientHeight > 0.25
    const rightNeedsPinnedScrollbar = pinSplitBottomScrollbar
      ? rightContentHeight + bottomScrollbarFootprint - rightShellHeight > 0.25
      : rightPaneScroll.scrollHeight - rightPaneScroll.clientHeight > 0.25

    leftPaneTrailingSpace = Math.max(0, sharedMaxScrollTop - leftMaxScrollTop)
    rightPaneTrailingSpace = Math.max(0, sharedMaxScrollTop - rightMaxScrollTop)
    pinSplitBottomScrollbar = leftNeedsPinnedScrollbar || rightNeedsPinnedScrollbar
  }

  async function updateUnifiedContentWidth() {
    await tick()

    if (!unifiedScroll || !unifiedContentGrid) {
      unifiedContentWidth = 0
      pinUnifiedBottomScrollbar = false
      return
    }

    unifiedContentWidth = Math.max(unifiedContentGrid.scrollWidth, unifiedScroll.clientWidth)
    const bottomScrollbarFootprint = getBottomScrollbarFootprint(unifiedBottomScrollbar)
    const unifiedContentHeight = getRenderedContentHeight(unifiedContentGrid)
    const unifiedShellHeight = getViewportHeight(unifiedScrollShell)

    pinUnifiedBottomScrollbar = pinUnifiedBottomScrollbar
      ? unifiedContentHeight + bottomScrollbarFootprint - unifiedShellHeight > 0.25
      : unifiedScroll.scrollHeight - unifiedScroll.clientHeight > 0.25
  }

  function scheduleScrollMarkerRefresh() {
    if (scrollMarkerRefreshQueued) {
      return
    }

    scrollMarkerRefreshQueued = true

    void tick().then(() => {
      scrollMarkerRefreshQueued = false
      updateScrollMarkers()
    })
  }

  function updateScrollMarkers() {
    leftScrollMarkers = []
    rightScrollMarkers = buildScrollMarkers(rightPaneScroll, rightPaneGrid, rightPaneTrailingSpace)
    unifiedScrollMarkers = buildScrollMarkers(unifiedScroll, unifiedContentGrid)
  }

  function syncSplitHorizontalScroll(nextScrollLeft: number) {
    if (splitHorizontalScrollSyncLocked) {
      return
    }

    splitHorizontalScrollSyncLocked = true
    setHorizontalScrollLeft(leftPaneHorizontalScroll, nextScrollLeft)
    setHorizontalScrollLeft(rightPaneHorizontalScroll, nextScrollLeft)
    setHorizontalScrollLeft(leftPaneBottomScrollbar, nextScrollLeft)
    setHorizontalScrollLeft(rightPaneBottomScrollbar, nextScrollLeft)
    splitHorizontalScrollSyncLocked = false
  }

  function syncUnifiedHorizontalScroll(nextScrollLeft: number) {
    if (unifiedHorizontalScrollSyncLocked) {
      return
    }

    unifiedHorizontalScrollSyncLocked = true
    setHorizontalScrollLeft(unifiedHorizontalScroll, nextScrollLeft)
    setHorizontalScrollLeft(unifiedBottomScrollbar, nextScrollLeft)
    unifiedHorizontalScrollSyncLocked = false
  }

  function setHorizontalScrollLeft(element: HTMLDivElement | null, nextScrollLeft: number) {
    if (!element || Math.abs(element.scrollLeft - nextScrollLeft) < 0.5) {
      return
    }

    element.scrollLeft = nextScrollLeft
  }

  function getBottomScrollbarFootprint(...elements: Array<HTMLDivElement | null>) {
    const measured = elements.reduce((maxValue, element) => {
      if (!element) {
        return maxValue
      }

      return Math.max(maxValue, element.offsetHeight)
    }, 0)

    return measured || 12
  }

  function getRenderedContentHeight(element: HTMLDivElement | null, trailingSpace = 0) {
    if (!element) {
      return 0
    }

    return element.getBoundingClientRect().height + trailingSpace
  }

  function getViewportHeight(element: HTMLDivElement | null) {
    if (!element) {
      return 0
    }

    return element.getBoundingClientRect().height
  }

  function buildScrollMarkers(
    scrollContainer: HTMLDivElement | null,
    contentRoot: HTMLDivElement | null,
    trailingSpace = 0,
  ) {
    if (!scrollContainer || !contentRoot) {
      return []
    }

    const scrollHeight = Math.max(0, contentRoot.scrollHeight - trailingSpace)

    if (scrollHeight <= 0) {
      return []
    }

    const nodes = Array.from(contentRoot.querySelectorAll<HTMLElement>('[data-diff-index]'))

    if (nodes.length === 0) {
      return []
    }

    const markerRanges = new Map<number, { top: number; bottom: number; kinds: Set<ScrollMarker['kind']> }>()

    for (const node of nodes) {
      const rawIndex = Number(node.dataset.diffIndex)

      if (!Number.isFinite(rawIndex)) {
        continue
      }

      const hunkIndex = rawIndex
      const top = node.offsetTop
      const bottom = top + node.offsetHeight
      const kind = getScrollMarkerKind(node)
      const currentRange = markerRanges.get(hunkIndex)

      if (currentRange) {
        currentRange.top = Math.min(currentRange.top, top)
        currentRange.bottom = Math.max(currentRange.bottom, bottom)
        currentRange.kinds.add(kind)
        continue
      }

      markerRanges.set(hunkIndex, { top, bottom, kinds: new Set([kind]) })
    }

    return [...markerRanges.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([hunkIndex, range]) => ({
        hunkIndex,
        top: range.top / scrollHeight,
        height: Math.max((range.bottom - range.top) / scrollHeight, 0.004),
        kind: range.kinds.size === 1 ? [...range.kinds][0] : 'mixed',
      }))
  }

  function getScrollMarkerKind(node: HTMLElement): ScrollMarker['kind'] {
    if (node.classList.contains('insert')) {
      return 'insert'
    }

    if (node.classList.contains('delete')) {
      return 'delete'
    }

    return 'mixed'
  }

  function isChangedSideBySideRow(item: SideBySideRenderItem) {
    if (!item.row) {
      return false
    }

    return item.row.left?.change !== 'context' || item.row.right?.change !== 'context'
  }

  function isChangedUnifiedRow(item: UnifiedRenderItem) {
    return item.row?.change !== 'context'
  }

  function syncScrollMarkerObserver() {
    if (typeof ResizeObserver === 'undefined') {
      return
    }

    if (!scrollMarkerObserver) {
      scrollMarkerObserver = new ResizeObserver(() => {
        scheduleScrollMarkerRefresh()
      })
    }

    scrollMarkerObserver.disconnect()

    if (leftPaneScroll) {
      scrollMarkerObserver.observe(leftPaneScroll)
    }

    if (rightPaneScroll) {
      scrollMarkerObserver.observe(rightPaneScroll)
    }

    if (unifiedScroll) {
      scrollMarkerObserver.observe(unifiedScroll)
    }

    if (leftPaneGrid) {
      scrollMarkerObserver.observe(leftPaneGrid)
    }

    if (rightPaneGrid) {
      scrollMarkerObserver.observe(rightPaneGrid)
    }

    if (unifiedContentGrid) {
      scrollMarkerObserver.observe(unifiedContentGrid)
    }
  }

  onDestroy(() => {
    scrollMarkerObserver?.disconnect()

    if (virtualSyncRafId !== null) {
      cancelAnimationFrame(virtualSyncRafId)
      virtualSyncRafId = null
    }
  })

  $: if (activeDiff?.contentKind === 'text' && viewMode === 'sideBySide') {
    sideBySideContentWidth
    void tick().then(() => {
      const nextScrollLeft =
        rightPaneBottomScrollbar?.scrollLeft ??
        rightPaneHorizontalScroll?.scrollLeft ??
        leftPaneBottomScrollbar?.scrollLeft ??
        leftPaneHorizontalScroll?.scrollLeft ??
        0

      syncSplitHorizontalScroll(nextScrollLeft)
    })
  }

  $: if (activeDiff?.contentKind === 'text' && viewMode === 'unified') {
    unifiedContentWidth
    void tick().then(() => {
      const nextScrollLeft =
        unifiedBottomScrollbar?.scrollLeft ?? unifiedHorizontalScroll?.scrollLeft ?? 0

      syncUnifiedHorizontalScroll(nextScrollLeft)
    })
  }
</script>

<svelte:window
  on:resize={() => {
    syncVirtualViewportState()
    void updateSideBySideContentMetrics()
    void updateUnifiedContentWidth()
    scheduleScrollMarkerRefresh()
  }}
/>

<section
  class:refreshing={loading}
  class="viewer"
  style:--diff-font-size={diffFontSize}
  style:--diff-row-line-height={diffRowLineHeight}
  style:--diff-row-height={diffRowHeight}
  style:--diff-line-number-width={lineNumberColumnWidth}
  style:--diff-prefix-width={prefixColumnWidth}
>
  {#if activeDiff}
    <div class="viewer-root-row">
      <div class="viewer-root" title={diffHeaderContext.leftRootFullPath}>
        <span class="viewer-root-label">Left root:</span>
        <span class="viewer-root-path">
          <span class="viewer-root-path-compact">{diffHeaderContext.leftRootLabel}</span>
          <span class="viewer-root-path-full">{diffHeaderContext.leftRootFullPath}</span>
        </span>
      </div>

      <div class="viewer-root" title={diffHeaderContext.rightRootFullPath}>
        <span class="viewer-root-label">Right root:</span>
        <span class="viewer-root-path">
          <span class="viewer-root-path-compact">{diffHeaderContext.rightRootLabel}</span>
          <span class="viewer-root-path-full">{diffHeaderContext.rightRootFullPath}</span>
        </span>
      </div>
    </div>

    {#if activeDiff.contentKind === 'text'}
      {#if simplifyHugeFileFragments}
        <div class="context-card compact large-file-rendering-note">
          {#if showSyntaxHighlighting}
            <strong>Large file — maximum performance mode</strong>
            <span>Syntax highlighting is temporarily simplified to keep scrolling responsive.</span>
          {:else}
            <strong>Large file — maximum performance mode</strong>
            <span>Syntax highlighting and inline highlights disabled for responsive scrolling.</span>
          {/if}
        </div>
      {:else if simplifyLargeFullFileFragments}
        <div class="context-card compact large-file-rendering-note">
          {#if showSyntaxHighlighting}
            <strong>Large file optimization active</strong>
            <span>Full-file view is simplifying syntax and inline highlights to keep scrolling responsive.</span>
          {:else}
            <strong>Large file optimization active</strong>
            <span>Full-file view is simplifying syntax and inline highlights to keep scrolling responsive.</span>
          {/if}
        </div>
      {/if}

      {#if viewMode === 'sideBySide'}
      <div
        class:sync-disabled={!syncSideBySideScroll}
        class:wrapped-lines={wrapSideBySideLines}
        class="split-view"
      >
        <section class="diff-pane left-diff-pane">
          <div class="pane-header" title={diffHeaderContext.leftAbsolutePath}>
            <span class="pane-header-side">Left</span>
            <span aria-hidden="true" class="pane-header-separator">&middot;</span>
            <strong class="pane-header-label">{diffHeaderContext.leftPaneLabel}</strong>
          </div>
          <div bind:this={leftPaneScrollShell} class="pane-scroll-shell pinned-bottom-scrollbar">
            <div
              bind:this={leftPaneScroll}
              class="pane-vertical-scroll pane-vertical-scroll-left"
              on:wheel={(event) => syncPaneWheel(event, 'left')}
              on:scroll={() => {
                throttledVirtualViewportSync()
                syncPaneScroll('left')
              }}
            >
              <div
                bind:this={leftPaneHorizontalScroll}
                class="pane-scroll pane-scroll-left"
                on:scroll={() => syncSplitHorizontalScroll(leftPaneHorizontalScroll?.scrollLeft ?? 0)}
              >
                <div
                  bind:this={leftPaneGrid}
                  class="pane-grid"
                  data-pane-content-root="true"
                  style:min-width={!wrapSideBySideLines && sideBySideContentWidth ? `${sideBySideContentWidth}px` : undefined}
                  style:padding-bottom={leftPaneTrailingSpace ? `${leftPaneTrailingSpace}px` : undefined}
                  style:position={virtualizeSideBySide ? 'relative' : undefined}
                >
                {#if (!virtualizeSideBySide && sideBySideRenderItems.length === 0) || (virtualizeSideBySide && activeDiff.sideBySide.length === 0)}
                  <div class="empty-inline-state">No changed lines.</div>
                {/if}

                {#if virtualizeSideBySide}
                  {#each sideBySideVirtualAnchors as anchor}
                    <div
                      aria-hidden="true"
                      class={`virtual-hunk-anchor ${anchor.kind}`}
                      data-diff-anchor="true"
                      data-diff-index={anchor.hunkIndex}
                      style:top={`${anchor.top}px`}
                      style:height={`${anchor.height}px`}
                    ></div>
                  {/each}

                  {#if leftVirtualRange.topPadding > 0}
                    <div aria-hidden="true" class="virtual-spacer" style:height={`${leftVirtualRange.topPadding}px`}></div>
                  {/if}
                {/if}

                {#each leftVisibleSideBySideItems as item, visibleIndex (virtualizeSideBySide ? leftVirtualRange.start + visibleIndex : visibleIndex)}
                  {#if item.type === 'hunk'}
                    <div
                      class:current-diff-target={item.hunkIndex === currentDiffHunk}
                      class="collapsed-row"
                    >
                      <span class="collapsed-chip">{item.header}</span>
                    </div>
                  {:else if item.row}
                    <div
                      class:current-diff-target={item.isAnchor && item.hunkIndex === currentDiffHunk}
                      class:gap-row={!item.row.left}
                      class={`diff-row ${item.row.left?.change ?? item.row.right?.change ?? 'context'}`}
                      data-diff-anchor={virtualizeSideBySide ? undefined : item.isAnchor ? 'true' : undefined}
                      data-diff-index={virtualizeSideBySide ? undefined : isChangedSideBySideRow(item) ? item.hunkIndex : undefined}
                    >
                      {#if item.row.left}
                        <span class="line-number">{item.row.left.lineNumber ?? ''}</span>
                        <span class="prefix">{item.row.left.prefix}</span>
                        <span class="line-text">
                          {#each getCachedDiffCellFragments(item.row.left) as fragment}
                            <span
                              class:highlighted={showInlineHighlights && fragment.highlighted}
                              class={`line-fragment ${fragment.className ?? ''}`}
                            >
                              {fragment.text || ' '}
                            </span>
                          {/each}
                        </span>
                      {:else}
                        <span class="line-number"></span>
                        <span class="prefix"></span>
                        <span class="line-text">{'\u00a0'}</span>
                      {/if}
                    </div>
                  {/if}
                {/each}

                {#if virtualizeSideBySide && leftVirtualRange.bottomPadding > 0}
                  <div aria-hidden="true" class="virtual-spacer" style:height={`${leftVirtualRange.bottomPadding}px`}></div>
                {/if}
                </div>
              </div>
            </div>
            <div
              bind:this={leftPaneBottomScrollbar}
              aria-hidden="true"
              class="pane-bottom-scrollbar pinned-bottom-scrollbar"
              on:scroll={() => syncSplitHorizontalScroll(leftPaneBottomScrollbar?.scrollLeft ?? 0)}
            >
              <div
                class="pane-bottom-scrollbar-track"
                style:width={!wrapSideBySideLines && sideBySideContentWidth ? `${sideBySideContentWidth}px` : '100%'}
              ></div>
            </div>
          </div>
        </section>

        <section class="diff-pane right-diff-pane">
          <div class="pane-header" title={diffHeaderContext.rightAbsolutePath}>
            <span class="pane-header-side">Right</span>
            <span aria-hidden="true" class="pane-header-separator">&middot;</span>
            <strong class="pane-header-label">{diffHeaderContext.rightPaneLabel}</strong>
          </div>
          <div bind:this={rightPaneScrollShell} class="pane-scroll-shell pinned-bottom-scrollbar">
            <div
              bind:this={rightPaneScroll}
              class="pane-vertical-scroll pane-vertical-scroll-right"
              on:wheel={(event) => syncPaneWheel(event, 'right')}
              on:scroll={() => {
                throttledVirtualViewportSync()
                syncPaneScroll('right')
              }}
            >
              <div
                bind:this={rightPaneHorizontalScroll}
                class="pane-scroll pane-scroll-right"
                on:scroll={() => syncSplitHorizontalScroll(rightPaneHorizontalScroll?.scrollLeft ?? 0)}
              >
                <div
                  bind:this={rightPaneGrid}
                  class="pane-grid"
                  data-pane-content-root="true"
                  style:min-width={!wrapSideBySideLines && sideBySideContentWidth ? `${sideBySideContentWidth}px` : undefined}
                  style:padding-bottom={rightPaneTrailingSpace ? `${rightPaneTrailingSpace}px` : undefined}
                  style:position={virtualizeSideBySide ? 'relative' : undefined}
                >
                {#if (!virtualizeSideBySide && sideBySideRenderItems.length === 0) || (virtualizeSideBySide && activeDiff.sideBySide.length === 0)}
                  <div class="empty-inline-state">No changed lines.</div>
                {/if}

                {#if virtualizeSideBySide}
                  {#each sideBySideVirtualAnchors as anchor}
                    <div
                      aria-hidden="true"
                      class={`virtual-hunk-anchor ${anchor.kind}`}
                      data-diff-anchor="true"
                      data-diff-index={anchor.hunkIndex}
                      style:top={`${anchor.top}px`}
                      style:height={`${anchor.height}px`}
                    ></div>
                  {/each}

                  {#if rightVirtualRange.topPadding > 0}
                    <div aria-hidden="true" class="virtual-spacer" style:height={`${rightVirtualRange.topPadding}px`}></div>
                  {/if}
                {/if}

                {#each rightVisibleSideBySideItems as item, visibleIndex (virtualizeSideBySide ? rightVirtualRange.start + visibleIndex : visibleIndex)}
                  {#if item.type === 'hunk'}
                    <div
                      class:current-diff-target={item.hunkIndex === currentDiffHunk}
                      class="collapsed-row"
                    >
                      <span class="collapsed-chip">{item.header}</span>
                    </div>
                  {:else if item.row}
                    <div
                      class:current-diff-target={item.isAnchor && item.hunkIndex === currentDiffHunk}
                      class:gap-row={!item.row.right}
                      class={`diff-row ${item.row.right?.change ?? item.row.left?.change ?? 'context'}`}
                      data-diff-anchor={virtualizeSideBySide ? undefined : item.isAnchor ? 'true' : undefined}
                      data-diff-index={virtualizeSideBySide ? undefined : isChangedSideBySideRow(item) ? item.hunkIndex : undefined}
                    >
                      {#if item.row.right}
                        <span class="line-number">{item.row.right.lineNumber ?? ''}</span>
                        <span class="prefix">{item.row.right.prefix}</span>
                        <span class="line-text">
                          {#each getCachedDiffCellFragments(item.row.right) as fragment}
                            <span
                              class:highlighted={showInlineHighlights && fragment.highlighted}
                              class={`line-fragment ${fragment.className ?? ''}`}
                            >
                              {fragment.text || ' '}
                            </span>
                          {/each}
                        </span>
                      {:else}
                        <span class="line-number"></span>
                        <span class="prefix"></span>
                        <span class="line-text">{'\u00a0'}</span>
                      {/if}
                    </div>
                  {/if}
                {/each}

                {#if virtualizeSideBySide && rightVirtualRange.bottomPadding > 0}
                  <div aria-hidden="true" class="virtual-spacer" style:height={`${rightVirtualRange.bottomPadding}px`}></div>
                {/if}
                </div>
              </div>
            </div>
            <div
              bind:this={rightPaneBottomScrollbar}
              aria-hidden="true"
              class="pane-bottom-scrollbar pinned-bottom-scrollbar"
              on:scroll={() => syncSplitHorizontalScroll(rightPaneBottomScrollbar?.scrollLeft ?? 0)}
            >
              <div
                class="pane-bottom-scrollbar-track"
                style:width={!wrapSideBySideLines && sideBySideContentWidth ? `${sideBySideContentWidth}px` : '100%'}
              ></div>
            </div>
            <div class="scroll-marker-overlay split-scroll-marker-overlay">
              <div class="scroll-marker-rail">
                {#each rightScrollMarkers as marker}
                  <button
                    aria-label={`Jump to change ${marker.hunkIndex + 1}`}
                    class:active={marker.hunkIndex === currentDiffHunk}
                    class={`scroll-marker ${marker.kind}`}
                    style:top={`${marker.top * 100}%`}
                    style:height={`${marker.height * 100}%`}
                    type="button"
                    on:click={() => scrollDiffHunkIntoView(marker.hunkIndex)}
                  ></button>
                {/each}
              </div>
            </div>
          </div>
        </section>
      </div>
      {:else}
      <div bind:this={unifiedScrollShell} class="unified-grid-shell pinned-bottom-scrollbar">
        <div
          bind:this={unifiedScroll}
          class="pane-vertical-scroll unified-vertical-scroll"
          on:scroll={() => {
            throttledVirtualViewportSync()
            scheduleScrollNavigationRefresh()
          }}
        >
          <div
            bind:this={unifiedHorizontalScroll}
            class="unified-grid"
            on:scroll={() => syncUnifiedHorizontalScroll(unifiedHorizontalScroll?.scrollLeft ?? 0)}
          >
            <div
              bind:this={unifiedContentGrid}
              class="unified-content-grid"
              data-pane-content-root="true"
              style:min-width={unifiedContentWidth ? `${unifiedContentWidth}px` : undefined}
              style:position={virtualizeUnified ? 'relative' : undefined}
            >
            {#if (!virtualizeUnified && unifiedRenderItems.length === 0) || (virtualizeUnified && activeDiff.unified.length === 0)}
              <div class="empty-inline-state">No changed lines.</div>
            {/if}

            {#if virtualizeUnified}
              {#each unifiedVirtualAnchors as anchor}
                <div
                  aria-hidden="true"
                  class={`virtual-hunk-anchor ${anchor.kind}`}
                  data-diff-anchor="true"
                  data-diff-index={anchor.hunkIndex}
                  style:top={`${anchor.top}px`}
                  style:height={`${anchor.height}px`}
                ></div>
              {/each}

              {#if unifiedVirtualRange.topPadding > 0}
                <div aria-hidden="true" class="virtual-spacer" style:height={`${unifiedVirtualRange.topPadding}px`}></div>
              {/if}
            {/if}

            {#each visibleUnifiedItems as item, visibleIndex (virtualizeUnified ? unifiedVirtualRange.start + visibleIndex : visibleIndex)}
              {#if item.type === 'hunk'}
                <div
                  class:current-diff-target={item.hunkIndex === currentDiffHunk}
                  class="collapsed-row unified-collapsed-row"
                >
                  <span class="collapsed-chip">{item.header}</span>
                </div>
              {:else if item.row}
                <div
                  class:current-diff-target={item.isAnchor && item.hunkIndex === currentDiffHunk}
                  class={`unified-row ${item.row.change}`}
                  data-diff-anchor={virtualizeUnified ? undefined : item.isAnchor ? 'true' : undefined}
                  data-diff-index={virtualizeUnified ? undefined : isChangedUnifiedRow(item) ? item.hunkIndex : undefined}
                >
                  <span class="line-number">{item.row.leftLineNumber ?? ''}</span>
                  <span class="line-number">{item.row.rightLineNumber ?? ''}</span>
                  <span class="prefix">{item.row.prefix}</span>
                  <span class="line-text">
                    {#each getCachedUnifiedLineFragments(item.row) as fragment}
                      <span
                        class:highlighted={showInlineHighlights && fragment.highlighted}
                        class={`line-fragment ${fragment.className ?? ''}`}
                      >
                        {fragment.text || ' '}
                      </span>
                    {/each}
                  </span>
                </div>
              {/if}
            {/each}

            {#if virtualizeUnified && unifiedVirtualRange.bottomPadding > 0}
              <div aria-hidden="true" class="virtual-spacer" style:height={`${unifiedVirtualRange.bottomPadding}px`}></div>
            {/if}
            </div>
          </div>
          <div class="scroll-marker-overlay">
            <div class="scroll-marker-rail">
              {#each unifiedScrollMarkers as marker}
                <button
                  aria-label={`Jump to change ${marker.hunkIndex + 1}`}
                  class:active={marker.hunkIndex === currentDiffHunk}
                  class={`scroll-marker ${marker.kind}`}
                  style:top={`${marker.top * 100}%`}
                  style:height={`${marker.height * 100}%`}
                  type="button"
                  on:click={() => scrollDiffHunkIntoView(marker.hunkIndex)}
                ></button>
              {/each}
            </div>
          </div>
        </div>
        <div
          bind:this={unifiedBottomScrollbar}
          aria-hidden="true"
          class="pane-bottom-scrollbar pinned-bottom-scrollbar"
          on:scroll={() => syncUnifiedHorizontalScroll(unifiedBottomScrollbar?.scrollLeft ?? 0)}
        >
          <div
            class="pane-bottom-scrollbar-track"
            style:width={unifiedContentWidth ? `${unifiedContentWidth}px` : '100%'}
          ></div>
        </div>
      </div>
      {/if}
    {:else if activeDiff.contentKind === 'image'}
      <div class="image-diff-view">
        <div class="image-diff-panels">
          <section class="image-diff-pane">
            <header class="image-diff-pane-header">
              <div class="image-diff-pane-title">
                <span class="image-diff-side">Left</span>
                <strong class="image-diff-filename" title={diffHeaderContext.leftAbsolutePath}>{diffHeaderContext.leftPaneLabel}</strong>
              </div>
              {#if imageDiff}
                <div class="image-diff-pane-meta">
                  <span class="image-diff-meta-tag">{formatBinaryFormatLabel(imageDiff.leftMeta.format, imageDiff.leftMeta.exists)}</span>
                  <span class="image-diff-meta-tag">{formatBinarySizeValue(imageDiff.leftMeta.size)}</span>
                </div>
              {/if}
            </header>
            <div class="image-diff-body" class:image-bg-checker={imageBg === 'checker'} class:image-bg-white={imageBg === 'white'} class:image-bg-black={imageBg === 'black'}>
              {#if leftImageError}
                <div class="image-diff-error-state">
                  <svg aria-hidden="true" class="image-diff-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
                    <path d="m21 15-5-5L5 21" />
                    <line x1="4" y1="4" x2="20" y2="20" stroke="var(--danger)" stroke-width="2" />
                  </svg>
                  <span>Could not load image</span>
                  <span class="image-diff-error-path">{imageDiff?.leftMeta.path ?? ''}</span>
                </div>
              {:else if leftImageRetried && imageDiff && resolveImageFallbackSource(imageDiff.leftAssetUrl, imageDiff.leftMeta)}
                <div class="image-diff-preview">
                  <img
                    alt={`${diffHeaderContext.leftPaneLabel} preview`}
                    class="image-diff-img"
                    decoding="async"
                    draggable="false"
                    src={resolveImageFallbackSource(imageDiff.leftAssetUrl, imageDiff.leftMeta) ?? undefined}
                    on:error={() => { leftImageError = true }}
                  />
                </div>
              {:else if imageDiff?.leftMeta.exists && resolveImageSource(imageDiff.leftAssetUrl, imageDiff.leftMeta)}
                <div class="image-diff-preview">
                  <img
                    alt={`${diffHeaderContext.leftPaneLabel} preview`}
                    class="image-diff-img"
                    decoding="async"
                    draggable="false"
                    src={resolveImageSource(imageDiff.leftAssetUrl, imageDiff.leftMeta) ?? undefined}
                    on:error={() => { leftImageRetried = true }}
                  />
                </div>
              {:else}
                <div class="image-diff-empty-state">
                  <svg aria-hidden="true" class="image-diff-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                  <span>No image on this side</span>
                </div>
              {/if}
            </div>
            {#if imageDiff?.leftMeta.sha256}
              <footer class="image-diff-pane-footer" title={imageDiff.leftMeta.sha256}>
                <span class="image-diff-hash-label">SHA-256</span>
                <code class="image-diff-hash-value">{formatBinaryHashShort(imageDiff.leftMeta.sha256)}</code>
              </footer>
            {/if}
          </section>

          <section class="image-diff-pane">
            <header class="image-diff-pane-header">
              <div class="image-diff-pane-title">
                <span class="image-diff-side">Right</span>
                <strong class="image-diff-filename" title={diffHeaderContext.rightAbsolutePath}>{diffHeaderContext.rightPaneLabel}</strong>
              </div>
              {#if imageDiff}
                <div class="image-diff-pane-meta">
                  <span class="image-diff-meta-tag">{formatBinaryFormatLabel(imageDiff.rightMeta.format, imageDiff.rightMeta.exists)}</span>
                  <span class="image-diff-meta-tag">{formatBinarySizeValue(imageDiff.rightMeta.size)}</span>
                </div>
              {/if}
            </header>
            <div class="image-diff-body" class:image-bg-checker={imageBg === 'checker'} class:image-bg-white={imageBg === 'white'} class:image-bg-black={imageBg === 'black'}>
              {#if rightImageError}
                <div class="image-diff-error-state">
                  <svg aria-hidden="true" class="image-diff-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
                    <path d="m21 15-5-5L5 21" />
                    <line x1="4" y1="4" x2="20" y2="20" stroke="var(--danger)" stroke-width="2" />
                  </svg>
                  <span>Could not load image</span>
                  <span class="image-diff-error-path">{imageDiff?.rightMeta.path ?? ''}</span>
                </div>
              {:else if rightImageRetried && imageDiff && resolveImageFallbackSource(imageDiff.rightAssetUrl, imageDiff.rightMeta)}
                <div class="image-diff-preview">
                  <img
                    alt={`${diffHeaderContext.rightPaneLabel} preview`}
                    class="image-diff-img"
                    decoding="async"
                    draggable="false"
                    src={resolveImageFallbackSource(imageDiff.rightAssetUrl, imageDiff.rightMeta) ?? undefined}
                    on:error={() => { rightImageError = true }}
                  />
                </div>
              {:else if imageDiff?.rightMeta.exists && resolveImageSource(imageDiff.rightAssetUrl, imageDiff.rightMeta)}
                <div class="image-diff-preview">
                  <img
                    alt={`${diffHeaderContext.rightPaneLabel} preview`}
                    class="image-diff-img"
                    decoding="async"
                    draggable="false"
                    src={resolveImageSource(imageDiff.rightAssetUrl, imageDiff.rightMeta) ?? undefined}
                    on:error={() => { rightImageRetried = true }}
                  />
                </div>
              {:else}
                <div class="image-diff-empty-state">
                  <svg aria-hidden="true" class="image-diff-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                  <span>No image on this side</span>
                </div>
              {/if}
            </div>
            {#if imageDiff?.rightMeta.sha256}
              <footer class="image-diff-pane-footer" title={imageDiff.rightMeta.sha256}>
                <span class="image-diff-hash-label">SHA-256</span>
                <code class="image-diff-hash-value">{formatBinaryHashShort(imageDiff.rightMeta.sha256)}</code>
              </footer>
            {/if}
          </section>
        </div>

        <footer class="image-diff-status-bar">
          <div class="image-diff-bg-toggle">
            <span class="image-diff-bg-label">BG</span>
            <button
              class:active={imageBg === 'checker'}
              class="image-diff-bg-button"
              title="Checkerboard background"
              type="button"
              on:click={() => { imageBg = 'checker' }}
            >
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14"><rect x="0" y="0" width="7" height="7" fill="currentColor" opacity="0.5"/><rect x="7" y="7" width="7" height="7" fill="currentColor" opacity="0.5"/><rect x="7" y="0" width="7" height="7" fill="currentColor" opacity="0.15"/><rect x="0" y="7" width="7" height="7" fill="currentColor" opacity="0.15"/></svg>
            </button>
            <button
              class:active={imageBg === 'white'}
              class="image-diff-bg-button"
              title="White background"
              type="button"
              on:click={() => { imageBg = 'white' }}
            >
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width="12" height="12" rx="2" fill="#ffffff" stroke="currentColor" stroke-width="1"/></svg>
            </button>
            <button
              class:active={imageBg === 'black'}
              class="image-diff-bg-button"
              title="Black background"
              type="button"
              on:click={() => { imageBg = 'black' }}
            >
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width="12" height="12" rx="2" fill="#111111" stroke="currentColor" stroke-width="1"/></svg>
            </button>
          </div>
          {#if imageDiff}
            <div class="image-diff-status-chips">
              {#each getBinarySummaryChips('image', imageDiff.leftMeta, imageDiff.rightMeta) as chip}
                <span class="image-diff-status-chip">{chip}</span>
              {/each}
            </div>
          {/if}
        </footer>
      </div>
    {:else if activeDiff.contentKind === 'binary'}
      <div class="binary-view hex-view">
        <div class="context-card binary-summary-card">
          <strong>{activeDiff.summary}</strong>
          {#if binaryDiff}
            <div class="binary-summary-chips">
              {#each getBinarySummaryChips(
                'binary',
                binaryDiff.leftMeta,
                binaryDiff.rightMeta,
                binaryDiff,
              ) as chip}
                <span class="binary-summary-chip">{chip}</span>
              {/each}
            </div>
          {/if}
        </div>

        <div class="binary-hex-shell">
          <div class="binary-hex-scroll" bind:this={binaryHexScroll} on:scroll={onBinaryHexScroll}>
            {#if binaryDiff}
              {@const totalRows = computeBinaryTotalRows(binaryDiff)}
              {@const totalHeight = totalRows * BINARY_ROW_HEIGHT}
              {#if totalRows === 0}
                <div class="empty-inline-state binary-empty-state">
                  {binaryDiff.truncated
                    ? 'Binary content is too large to render as hex.'
                    : 'No byte differences.'}
                </div>
              {:else}
                <div class="binary-hex-table" style="display: block; height: {totalHeight + 24}px; position: relative;">
                  <div class="binary-hex-header">
                    <span class="binary-hex-cell binary-offset-header">Offset</span>
                    <span class="binary-hex-cell binary-group-header">Left hex</span>
                    <span class="binary-hex-cell binary-group-header">Left ASCII</span>
                    <span class="binary-hex-cell binary-group-header">Right hex</span>
                    <span class="binary-hex-cell binary-group-header">Right ASCII</span>
                  </div>

                  <div style="position: absolute; top: {24 + binaryVirtualStart * BINARY_ROW_HEIGHT}px; left: 0; right: 0;">
                    {#each { length: binaryVirtualEnd - binaryVirtualStart } as _, i}
                      {@const rowIndex = binaryVirtualStart + i}
                      {@const rowOffset = rowIndex * binaryDiff.bytesPerRow}
                      {@const rowChanged = isBinaryRowChangedFromBytes(binaryDiff.leftBytes, binaryDiff.rightBytes, rowOffset, binaryDiff.bytesPerRow)}
                      <div class:changed={rowChanged} class="binary-hex-row">
                        <span class="binary-hex-cell binary-offset-cell">{formatBinaryOffset(rowOffset)}</span>

                        <span class="binary-hex-cell binary-byte-group">
                          {#each { length: binaryDiff.bytesPerRow } as _, ci}
                            {@const idx = rowOffset + ci}
                            {@const lb = idx < binaryDiff.leftBytes.length ? binaryDiff.leftBytes[idx] : -1}
                            {@const rb = idx < binaryDiff.rightBytes.length ? binaryDiff.rightBytes[idx] : -1}
                            {@const cellChanged = lb !== rb}
                            <span
                              class:changed={cellChanged}
                              class="binary-byte binary-hex-byte"
                              title={lb >= 0 ? byteToHex(lb) : ''}
                            >
                              {lb >= 0 ? byteToHex(lb) : '\u00a0\u00a0'}
                            </span>
                          {/each}
                        </span>

                        <span class="binary-hex-cell binary-byte-group binary-ascii-group">
                          {#each { length: binaryDiff.bytesPerRow } as _, ci}
                            {@const idx = rowOffset + ci}
                            {@const lb = idx < binaryDiff.leftBytes.length ? binaryDiff.leftBytes[idx] : -1}
                            {@const rb = idx < binaryDiff.rightBytes.length ? binaryDiff.rightBytes[idx] : -1}
                            {@const cellChanged = lb !== rb}
                            <span class:changed={cellChanged} class="binary-byte binary-ascii-byte">
                              {lb >= 0 ? byteToAscii(lb) : '\u00a0'}
                            </span>
                          {/each}
                        </span>

                        <span class="binary-hex-cell binary-byte-group">
                          {#each { length: binaryDiff.bytesPerRow } as _, ci}
                            {@const idx = rowOffset + ci}
                            {@const lb = idx < binaryDiff.leftBytes.length ? binaryDiff.leftBytes[idx] : -1}
                            {@const rb = idx < binaryDiff.rightBytes.length ? binaryDiff.rightBytes[idx] : -1}
                            {@const cellChanged = lb !== rb}
                            <span
                              class:changed={cellChanged}
                              class="binary-byte binary-hex-byte"
                              title={rb >= 0 ? byteToHex(rb) : ''}
                            >
                              {rb >= 0 ? byteToHex(rb) : '\u00a0\u00a0'}
                            </span>
                          {/each}
                        </span>

                        <span class="binary-hex-cell binary-byte-group binary-ascii-group">
                          {#each { length: binaryDiff.bytesPerRow } as _, ci}
                            {@const idx = rowOffset + ci}
                            {@const lb = idx < binaryDiff.leftBytes.length ? binaryDiff.leftBytes[idx] : -1}
                            {@const rb = idx < binaryDiff.rightBytes.length ? binaryDiff.rightBytes[idx] : -1}
                            {@const cellChanged = lb !== rb}
                            <span class:changed={cellChanged} class="binary-byte binary-ascii-byte">
                              {rb >= 0 ? byteToAscii(rb) : '\u00a0'}
                            </span>
                          {/each}
                        </span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <div class="message-card">{activeDiff.summary}</div>
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
