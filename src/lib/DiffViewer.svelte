<script lang="ts">
  import { convertFileSrc } from '@tauri-apps/api/core'
  import { onDestroy, tick } from 'svelte'
  import { loadBinaryPreview } from './api'
  import { formatSize } from './format'
  import { normalizeWheelDelta } from './app/pane-scroll-sync'
  import Minimap from './Minimap.svelte'
  import type { MinimapRow } from './minimap-render'
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
  export let sideBySideMinimapData: MinimapRow[] = []
  export let unifiedMinimapData: MinimapRow[] = []
  export let maxLineNumber = 0
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
  let splitHorizontalScrollSyncLocked = false
  let unifiedHorizontalScrollSyncLocked = false
  let imageDiff: ImageDiffPayload | null = null
  let binaryDiff: BinaryDiffPayload | null = null
  let binaryPreviewLoading = false
  let binaryPreviewError = ''
  let activeBinaryPreviewRequestId = 0
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
    kind: 'insert' | 'delete' | 'mixed'
  }

  interface ItemLayout {
    offsets: number[]
    total: number
    anchors: VirtualHunkAnchor[]
  }

  const FULL_FILE_VIRTUALIZATION_MIN_ROWS = 200
  const FULL_FILE_VIRTUALIZATION_BASE_OVERSCAN = 40
  const LARGE_FULL_FILE_FRAGMENT_SIMPLIFICATION_ROWS = 600
  const HUGE_FILE_THRESHOLD = 3000
  const NON_FULL_VIRTUALIZATION_MIN_ITEMS = 200
  // Collapsed hunk separator row. Matches .collapsed-row: 28px + margin-block 6px 4px.
  const COLLAPSED_ROW_HEIGHT = 38

  const emptyVirtualRange: VirtualRange = {
    start: 0,
    end: 0,
    topPadding: 0,
    bottomPadding: 0,
  }

  const emptyVirtualAnchors: VirtualHunkAnchor[] = []
  const emptyItemLayout: ItemLayout = { offsets: [0], total: 0, anchors: [] }
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

  $: virtualizeNonFullSideBySide =
    activeDiff?.contentKind === 'text' &&
    viewMode === 'sideBySide' &&
    !showFullFile &&
    !wrapSideBySideLines &&
    sideBySideRenderItems.length > NON_FULL_VIRTUALIZATION_MIN_ITEMS

  $: virtualizeNonFullUnified =
    activeDiff?.contentKind === 'text' &&
    viewMode === 'unified' &&
    !showFullFile &&
    unifiedRenderItems.length > NON_FULL_VIRTUALIZATION_MIN_ITEMS

  $: virtualizeSideBySideActive = virtualizeSideBySide || virtualizeNonFullSideBySide
  $: virtualizeUnifiedActive = virtualizeUnified || virtualizeNonFullUnified

  $: sideBySideItemLayout =
    virtualizeNonFullSideBySide && activeDiff?.contentKind === 'text'
      ? buildSideBySideItemLayout(
          activeDiff.sideBySide,
          sideBySideRenderItems,
          sideBySideHunkRanges,
          rowHeightPx,
        )
      : emptyItemLayout

  $: unifiedItemLayout =
    virtualizeNonFullUnified && activeDiff?.contentKind === 'text'
      ? buildUnifiedItemLayout(
          activeDiff.unified,
          unifiedRenderItems,
          unifiedHunkRanges,
          rowHeightPx,
        )
      : emptyItemLayout

  $: leftVirtualRange = virtualizeSideBySide
    ? buildVirtualRange(
        activeDiff?.contentKind === 'text' ? activeDiff.sideBySide.length : 0,
        leftVirtualScrollTop,
        leftVirtualViewportHeight,
        rowHeightPx,
      )
    : virtualizeNonFullSideBySide
      ? buildVirtualRangeFromLayout(
          sideBySideItemLayout,
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
    : virtualizeNonFullSideBySide
      ? buildVirtualRangeFromLayout(
          sideBySideItemLayout,
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
    : virtualizeNonFullUnified
      ? buildVirtualRangeFromLayout(
          unifiedItemLayout,
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
    : virtualizeNonFullSideBySide
      ? sideBySideRenderItems.slice(leftVirtualRange.start, leftVirtualRange.end)
      : sideBySideRenderItems

  $: rightVisibleSideBySideItems = virtualizeSideBySide
    ? buildVisibleFullFileSideBySideItems(
        activeDiff?.contentKind === 'text' ? activeDiff.sideBySide : [],
        sideBySideHunkRanges,
        rightVirtualRange.start,
        rightVirtualRange.end,
      )
    : virtualizeNonFullSideBySide
      ? sideBySideRenderItems.slice(rightVirtualRange.start, rightVirtualRange.end)
      : sideBySideRenderItems

  $: visibleUnifiedItems = virtualizeUnified
    ? buildVisibleFullFileUnifiedItems(
        activeDiff?.contentKind === 'text' ? activeDiff.unified : [],
        unifiedHunkRanges,
        unifiedVirtualRange.start,
        unifiedVirtualRange.end,
      )
    : virtualizeNonFullUnified
      ? unifiedRenderItems.slice(unifiedVirtualRange.start, unifiedVirtualRange.end)
      : unifiedRenderItems

  $: sideBySideVirtualAnchors =
    virtualizeSideBySide && activeDiff?.contentKind === 'text'
      ? buildSideBySideVirtualAnchors(activeDiff.sideBySide, sideBySideHunkRanges, rowHeightPx)
      : virtualizeNonFullSideBySide
        ? sideBySideItemLayout.anchors
        : emptyVirtualAnchors

  $: unifiedVirtualAnchors =
    virtualizeUnified && activeDiff?.contentKind === 'text'
      ? buildUnifiedVirtualAnchors(activeDiff.unified, unifiedHunkRanges, rowHeightPx)
      : virtualizeNonFullUnified
        ? unifiedItemLayout.anchors
        : emptyVirtualAnchors

  $: rightPaneMinimapRows = sideBySideMinimapData

  $: simplifyVirtualizedContextFragments =
    activeDiff?.contentKind === 'text' && (virtualizeSideBySideActive || virtualizeUnifiedActive)

  $: simplifyLargeFullFileFragments =
    activeDiff?.contentKind === 'text' &&
    ((virtualizeSideBySideActive &&
      sideBySideRenderItems.length >= LARGE_FULL_FILE_FRAGMENT_SIMPLIFICATION_ROWS) ||
      (virtualizeUnifiedActive &&
        unifiedRenderItems.length >= LARGE_FULL_FILE_FRAGMENT_SIMPLIFICATION_ROWS))

  $: simplifyHugeFileFragments =
    activeDiff?.contentKind === 'text' &&
    ((virtualizeSideBySideActive && sideBySideRenderItems.length >= HUGE_FILE_THRESHOLD) ||
      (virtualizeUnifiedActive && unifiedRenderItems.length >= HUGE_FILE_THRESHOLD))

  $: syntaxLanguage = activeDiff ? detectSyntaxLanguage(activeDiff.rightLabel) : null

  $: {
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

  $: imageDiff = activeDiff?.contentKind === 'image' ? activeDiff.image ?? null : null
  $: if (activeDiff) { leftImageError = false; rightImageError = false; leftImageRetried = false; rightImageRetried = false }
  $: binaryDiff = activeDiff?.contentKind === 'binary' ? activeDiff.binary ?? null : null
  $: if (activeDiff?.contentKind !== 'binary') {
    activeBinaryPreviewRequestId += 1
    binaryPreviewLoading = false
    binaryPreviewError = ''
  }

  $: {
    leftPaneScroll
    rightPaneScroll
    unifiedScroll
    sideBySideRenderItems
    unifiedRenderItems
    virtualizeSideBySide
    virtualizeUnified
    virtualizeNonFullSideBySide
    virtualizeNonFullUnified
    void tick().then(() => {
      syncVirtualViewportState()
    })
  }

  function getFragmentModeKey(change: 'context' | 'delete' | 'insert') {
    if (!showInlineHighlights && !showSyntaxHighlighting) {
      return 'plain-static'
    }

    if (!showSyntaxHighlighting) {
      if (simplifyHugeFileFragments) {
        return 'plain-huge-file'
      }

      if (simplifyLargeFullFileFragments) {
        return 'plain-large-file'
      }

      if (simplifyVirtualizedContextFragments && change === 'context') {
        return 'plain-context-file'
      }
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
  const ASCII_LOOKUP: string[] = []
  for (let i = 0; i < 256; i++) {
    ASCII_LOOKUP.push(i >= 32 && i <= 126 ? String.fromCharCode(i) : '.')
  }

  interface BinaryFragment {
    text: string
    changed: boolean
  }

  interface BinaryRowView {
    offset: string
    leftHex: BinaryFragment[]
    leftAscii: BinaryFragment[]
    rightHex: BinaryFragment[]
    rightAscii: BinaryFragment[]
    changed: boolean
  }

  interface BinaryViewState {
    mask: Uint8Array
    rowMask: Uint8Array
    totalRows: number
    rowCache: Map<number, BinaryRowView>
  }

  function isBinaryRowChangedFromBytes(
    leftBytes: ArrayLike<number>,
    rightBytes: ArrayLike<number>,
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
  let binaryTotalRows = 0
  let binaryScrollRafId: number | null = null
  // Per-payload caches. Keyed by BinaryDiffPayload identity so masks + row views
  // can never leak across file switches. GC reclaims entries when the payload
  // drops out of the detail cache.
  const binaryViewStates = new WeakMap<BinaryDiffPayload, BinaryViewState>()
  const BINARY_ROW_HEIGHT = 22
  const BINARY_HEADER_HEIGHT = 26
  const BINARY_OVERSCAN = 32

  function computeBinaryTotalRows(diff: BinaryDiffPayload): number {
    const total = Math.max(diff.leftBytes.length, diff.rightBytes.length)
    return Math.ceil(total / diff.bytesPerRow)
  }

  function buildBinaryViewState(diff: BinaryDiffPayload): BinaryViewState {
    const lb = diff.leftBytes
    const rb = diff.rightBytes
    const max = Math.max(lb.length, rb.length)
    const mask = new Uint8Array(max)
    const common = Math.min(lb.length, rb.length)
    for (let i = 0; i < common; i += 1) {
      if (lb[i] !== rb[i]) mask[i] = 1
    }
    for (let i = common; i < max; i += 1) mask[i] = 1

    const bpr = diff.bytesPerRow
    const totalRows = Math.ceil(max / bpr)
    const rowMask = new Uint8Array(totalRows)
    for (let r = 0; r < totalRows; r += 1) {
      const start = r * bpr
      const end = Math.min(start + bpr, max)
      for (let i = start; i < end; i += 1) {
        if (mask[i]) {
          rowMask[r] = 1
          break
        }
      }
    }

    return { mask, rowMask, totalRows, rowCache: new Map() }
  }

  function getBinaryViewState(diff: BinaryDiffPayload): BinaryViewState {
    const cached = binaryViewStates.get(diff)
    if (cached) return cached
    const state = buildBinaryViewState(diff)
    binaryViewStates.set(diff, state)
    return state
  }

  function buildHexFragments(
    bytes: ArrayLike<number>,
    rowOffset: number,
    bytesPerRow: number,
    mask: Uint8Array,
  ): BinaryFragment[] {
    const fragments: BinaryFragment[] = []
    let cur: BinaryFragment | null = null
    for (let i = 0; i < bytesPerRow; i += 1) {
      const idx = rowOffset + i
      const inRange = idx < bytes.length
      const changed = inRange && mask[idx] === 1
      const byteText = inRange ? HEX_LOOKUP[bytes[idx]] : '  '
      const sep = i === 0 ? '' : i === bytesPerRow / 2 ? '  ' : ' '
      if (!cur) {
        cur = { text: sep + byteText, changed }
      } else if (cur.changed === changed) {
        cur.text += sep + byteText
      } else {
        if (sep) cur.text += sep
        fragments.push(cur)
        cur = { text: byteText, changed }
      }
    }
    if (cur) fragments.push(cur)
    return fragments
  }

  function buildAsciiFragments(
    bytes: ArrayLike<number>,
    rowOffset: number,
    bytesPerRow: number,
    mask: Uint8Array,
  ): BinaryFragment[] {
    const fragments: BinaryFragment[] = []
    let cur: BinaryFragment | null = null
    for (let i = 0; i < bytesPerRow; i += 1) {
      const idx = rowOffset + i
      const inRange = idx < bytes.length
      const changed = inRange && mask[idx] === 1
      const char = inRange ? ASCII_LOOKUP[bytes[idx]] : ' '
      if (!cur) {
        cur = { text: char, changed }
      } else if (cur.changed === changed) {
        cur.text += char
      } else {
        fragments.push(cur)
        cur = { text: char, changed }
      }
    }
    if (cur) fragments.push(cur)
    return fragments
  }

  function getBinaryRowView(rowIndex: number): BinaryRowView | null {
    if (!binaryDiff) return null
    const state = getBinaryViewState(binaryDiff)
    const cached = state.rowCache.get(rowIndex)
    if (cached) return cached

    const bpr = binaryDiff.bytesPerRow
    const rowOffset = rowIndex * bpr
    const view: BinaryRowView = {
      offset: formatBinaryOffset(rowOffset),
      leftHex: buildHexFragments(binaryDiff.leftBytes, rowOffset, bpr, state.mask),
      leftAscii: buildAsciiFragments(binaryDiff.leftBytes, rowOffset, bpr, state.mask),
      rightHex: buildHexFragments(binaryDiff.rightBytes, rowOffset, bpr, state.mask),
      rightAscii: buildAsciiFragments(binaryDiff.rightBytes, rowOffset, bpr, state.mask),
      changed: state.rowMask[rowIndex] === 1,
    }
    state.rowCache.set(rowIndex, view)
    return view
  }

  function updateBinaryVirtualRange() {
    if (!binaryHexScroll || !binaryDiff?.previewLoaded) return
    const scrollTop = binaryHexScroll.scrollTop
    const viewportHeight = binaryHexScroll.clientHeight || 800
    const visibleCount = Math.ceil(viewportHeight / BINARY_ROW_HEIGHT)
    const rawStart = Math.floor(scrollTop / BINARY_ROW_HEIGHT) - BINARY_OVERSCAN
    const start = Math.max(0, Math.min(binaryTotalRows, rawStart))
    const end = Math.min(binaryTotalRows, start + visibleCount + BINARY_OVERSCAN * 2)
    binaryVirtualStart = start
    binaryVirtualEnd = end
  }

  function onBinaryHexScroll() {
    if (binaryScrollRafId !== null) return
    binaryScrollRafId = requestAnimationFrame(() => {
      binaryScrollRafId = null
      updateBinaryVirtualRange()
    })
  }

  // Prime the view state for the current payload (reuses WeakMap entry if
  // already warmed by preload) and reset the virtual range to the top.
  $: if (binaryDiff?.previewLoaded) {
    const state = getBinaryViewState(binaryDiff)
    binaryTotalRows = state.totalRows
    binaryVirtualStart = 0
    binaryVirtualEnd = Math.min(binaryTotalRows, 100)
    void tick().then(() => {
      if (binaryHexScroll) {
        binaryHexScroll.scrollTop = 0
      }
      updateBinaryVirtualRange()
    })
  } else {
    binaryTotalRows = 0
    binaryVirtualStart = 0
    binaryVirtualEnd = 0
  }

  $: if (
    activeDiff?.contentKind === 'binary' &&
    binaryDiff &&
    !binaryDiff.previewLoaded &&
    !binaryPreviewLoading &&
    !binaryPreviewError
  ) {
    const requestId = activeBinaryPreviewRequestId + 1
    activeBinaryPreviewRequestId = requestId
    binaryPreviewLoading = true
    binaryPreviewError = ''

    const leftPath = binaryDiff.leftMeta.path || activeDiff.leftLabel
    const rightPath = binaryDiff.rightMeta.path || activeDiff.rightLabel

    void tick().then(() =>
      loadBinaryPreview(leftPath, rightPath, {
        ignoreWhitespace: false,
        ignoreCase: false,
      })
        .then((preview) => {
          if (requestId !== activeBinaryPreviewRequestId || activeDiff?.contentKind !== 'binary') {
            return
          }

          binaryDiff = preview
        })
        .catch((error) => {
          if (requestId !== activeBinaryPreviewRequestId) {
            return
          }

          binaryPreviewError =
            error instanceof Error ? error.message : 'Binary preview could not be loaded.'
        })
        .finally(() => {
          if (requestId === activeBinaryPreviewRequestId) {
            binaryPreviewLoading = false
          }
        }),
    )
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
      if (diff.previewLoaded && diff.changedRowCount !== null) {
        chips.push(`${diff.changedRowCount} changed rows`)
      } else if (!diff.previewLoaded) {
        chips.push('Preview pending')
      }

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

  function buildItemOffsets(
    itemTypes: ReadonlyArray<{ type: 'row' | 'hunk' }>,
    rowHeight: number,
  ): { offsets: number[]; total: number } {
    const offsets = new Array<number>(itemTypes.length + 1)
    offsets[0] = 0
    let cursor = 0
    for (let index = 0; index < itemTypes.length; index += 1) {
      cursor += itemTypes[index].type === 'row' ? rowHeight : COLLAPSED_ROW_HEIGHT
      offsets[index + 1] = cursor
    }
    return { offsets, total: cursor }
  }

  function collectAnchorRanges(
    items: ReadonlyArray<{ hunkIndex?: number }>,
  ): Map<number, { firstIndex: number; pastLastIndex: number }> {
    const ranges = new Map<number, { firstIndex: number; pastLastIndex: number }>()
    for (let index = 0; index < items.length; index += 1) {
      const hunkIndex = items[index].hunkIndex
      if (hunkIndex === undefined) {
        continue
      }
      const existing = ranges.get(hunkIndex)
      if (existing) {
        existing.pastLastIndex = index + 1
      } else {
        ranges.set(hunkIndex, { firstIndex: index, pastLastIndex: index + 1 })
      }
    }
    return ranges
  }

  function buildSideBySideItemLayout(
    rows: FileDiffResult['sideBySide'],
    items: SideBySideRenderItem[],
    hunks: DiffHunkRange[],
    rowHeight: number,
  ): ItemLayout {
    const { offsets, total } = buildItemOffsets(items, rowHeight)
    const anchorRanges = collectAnchorRanges(items)
    const anchors: VirtualHunkAnchor[] = []
    for (const [hunkIndex, range] of anchorRanges) {
      const hunk = hunks[hunkIndex]
      if (!hunk) continue
      anchors.push({
        hunkIndex,
        top: offsets[range.firstIndex],
        height: offsets[range.pastLastIndex] - offsets[range.firstIndex],
        kind: classifySideBySideHunk(rows, hunk),
      })
    }
    return { offsets, total, anchors }
  }

  function buildUnifiedItemLayout(
    rows: FileDiffResult['unified'],
    items: UnifiedRenderItem[],
    hunks: DiffHunkRange[],
    rowHeight: number,
  ): ItemLayout {
    const { offsets, total } = buildItemOffsets(items, rowHeight)
    const anchorRanges = collectAnchorRanges(items)
    const anchors: VirtualHunkAnchor[] = []
    for (const [hunkIndex, range] of anchorRanges) {
      const hunk = hunks[hunkIndex]
      if (!hunk) continue
      anchors.push({
        hunkIndex,
        top: offsets[range.firstIndex],
        height: offsets[range.pastLastIndex] - offsets[range.firstIndex],
        kind: classifyUnifiedHunk(rows, hunk),
      })
    }
    return { offsets, total, anchors }
  }

  function buildVirtualRangeFromLayout(
    layout: ItemLayout,
    scrollTop: number,
    viewportHeight: number,
    rowHeight: number,
  ): VirtualRange {
    const offsets = layout.offsets
    const itemCount = offsets.length - 1
    if (itemCount === 0) {
      return emptyVirtualRange
    }

    const overscan = getEffectiveOverscan(itemCount)
    const overscanPx = overscan * rowHeight
    const rangeTop = Math.max(0, scrollTop - overscanPx)
    const rangeBottom = scrollTop + viewportHeight + overscanPx

    // largest index with offsets[index] <= rangeTop
    let lo = 0
    let hi = itemCount
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1
      if (offsets[mid] <= rangeTop) lo = mid
      else hi = mid - 1
    }
    const start = lo

    // smallest index with offsets[index] >= rangeBottom
    lo = start
    hi = itemCount
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (offsets[mid] >= rangeBottom) hi = mid
      else lo = mid + 1
    }
    const end = Math.min(itemCount, hi)

    return {
      start,
      end,
      topPadding: offsets[start],
      bottomPadding: Math.max(0, layout.total - offsets[end]),
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
        return 'mixed' satisfies VirtualHunkAnchor['kind']
      }
    }

    if (sawInsert) {
      return 'insert' satisfies VirtualHunkAnchor['kind']
    }

    if (sawDelete) {
      return 'delete' satisfies VirtualHunkAnchor['kind']
    }

    return 'mixed' satisfies VirtualHunkAnchor['kind']
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
        return 'mixed' satisfies VirtualHunkAnchor['kind']
      }
    }

    if (sawInsert) {
      return 'insert' satisfies VirtualHunkAnchor['kind']
    }

    if (sawDelete) {
      return 'delete' satisfies VirtualHunkAnchor['kind']
    }

    return 'mixed' satisfies VirtualHunkAnchor['kind']
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

  // ─── Smooth wheel scrolling ──────────────────────────────────────────────
  // RAF-driven scroll animator keyed per element. Each wheel tick adds to the
  // target offset; a single frame loop eases the element toward it.
  type SmoothScrollState = {
    targetTop: number
    targetLeft: number
    frame: number | null
  }
  const smoothScrollStates = new WeakMap<HTMLElement, SmoothScrollState>()
  const SMOOTH_FACTOR = 0.22
  const SMOOTH_MIN_STEP = 1.25

  function scheduleSmoothScroll(
    element: HTMLElement | null,
    addDx: number,
    addDy: number,
    onStep?: () => void,
  ) {
    if (!element) return
    const maxTop = Math.max(0, element.scrollHeight - element.clientHeight)
    const maxLeft = Math.max(0, element.scrollWidth - element.clientWidth)
    let state = smoothScrollStates.get(element)
    if (!state) {
      state = { targetTop: element.scrollTop, targetLeft: element.scrollLeft, frame: null }
      smoothScrollStates.set(element, state)
    }
    // Keep target honest if the element was scrolled by other means since we last
    // animated (e.g. jump-to-hunk, sync from the other pane).
    if (state.frame === null) {
      state.targetTop = element.scrollTop
      state.targetLeft = element.scrollLeft
    }
    state.targetTop = Math.min(maxTop, Math.max(0, state.targetTop + addDy))
    state.targetLeft = Math.min(maxLeft, Math.max(0, state.targetLeft + addDx))
    if (state.frame !== null) return
    const tick = () => {
      const s = state!
      s.frame = null
      const remTop = s.targetTop - element.scrollTop
      const remLeft = s.targetLeft - element.scrollLeft
      const absTop = Math.abs(remTop)
      const absLeft = Math.abs(remLeft)
      if (absTop < 0.5 && absLeft < 0.5) {
        element.scrollTop = s.targetTop
        element.scrollLeft = s.targetLeft
        onStep?.()
        return
      }
      if (absTop >= 0.5) {
        const stepY =
          absTop < SMOOTH_MIN_STEP ? remTop : remTop * SMOOTH_FACTOR + Math.sign(remTop) * 0.4
        element.scrollTop = element.scrollTop + stepY
      }
      if (absLeft >= 0.5) {
        const stepX =
          absLeft < SMOOTH_MIN_STEP ? remLeft : remLeft * SMOOTH_FACTOR + Math.sign(remLeft) * 0.4
        element.scrollLeft = element.scrollLeft + stepX
      }
      onStep?.()
      s.frame = requestAnimationFrame(tick)
    }
    state.frame = requestAnimationFrame(tick)
  }

  function isHorizontalWheelIntent(event: WheelEvent) {
    return Math.abs(event.deltaX) > Math.abs(event.deltaY)
  }

  function getHorizontalWheelDelta(event: WheelEvent) {
    const primary = isHorizontalWheelIntent(event) ? event.deltaX : event.deltaY
    return normalizeWheelDelta(primary, event.deltaMode)
  }

  function handleSplitPaneWheel(event: WheelEvent, side: 'left' | 'right') {
    if (event.ctrlKey) return
    const horizontal = side === 'left' ? leftPaneHorizontalScroll : rightPaneHorizontalScroll
    const wantsHorizontal = event.shiftKey || isHorizontalWheelIntent(event)
    if (wantsHorizontal && horizontal) {
      const maxLeft = Math.max(0, horizontal.scrollWidth - horizontal.clientWidth)
      if (maxLeft > 0.5) {
        event.preventDefault()
        const dx = getHorizontalWheelDelta(event)
        scheduleSmoothScroll(horizontal, dx, 0, () => {
          syncSplitHorizontalScroll(horizontal.scrollLeft)
        })
        return
      }
    }
    // Non-horizontal.
    // If sync is on the App-level handler already animates + mirrors.
    if (syncSideBySideScroll) {
      syncPaneWheel(event, side)
      return
    }
    // Sync off → smooth the active pane locally so wheel still feels eased.
    const pane = side === 'left' ? leftPaneScroll : rightPaneScroll
    if (!pane || Math.abs(event.deltaY) < 0.1) return
    event.preventDefault()
    const dy = normalizeWheelDelta(event.deltaY, event.deltaMode)
    scheduleSmoothScroll(pane, 0, dy)
  }

  function handleUnifiedPaneWheel(event: WheelEvent) {
    if (event.ctrlKey || !unifiedScroll) return
    const wantsHorizontal = event.shiftKey || isHorizontalWheelIntent(event)
    if (wantsHorizontal && unifiedHorizontalScroll) {
      const maxLeft = Math.max(
        0,
        unifiedHorizontalScroll.scrollWidth - unifiedHorizontalScroll.clientWidth,
      )
      if (maxLeft > 0.5) {
        event.preventDefault()
        const dx = getHorizontalWheelDelta(event)
        scheduleSmoothScroll(unifiedHorizontalScroll, dx, 0, () => {
          syncUnifiedHorizontalScroll(unifiedHorizontalScroll!.scrollLeft)
        })
        return
      }
    }
    if (Math.abs(event.deltaY) < 0.1) return
    event.preventDefault()
    const dy = normalizeWheelDelta(event.deltaY, event.deltaMode)
    scheduleSmoothScroll(unifiedScroll, 0, dy)
  }

  function handleBinaryWheel(event: WheelEvent) {
    if (event.ctrlKey || !binaryHexScroll) return
    const wantsHorizontal = event.shiftKey || isHorizontalWheelIntent(event)
    if (wantsHorizontal) {
      const maxLeft = Math.max(0, binaryHexScroll.scrollWidth - binaryHexScroll.clientWidth)
      if (maxLeft > 0.5) {
        event.preventDefault()
        const dx = getHorizontalWheelDelta(event)
        scheduleSmoothScroll(binaryHexScroll, dx, 0)
        return
      }
    }
    if (Math.abs(event.deltaY) < 0.1) return
    event.preventDefault()
    const dy = normalizeWheelDelta(event.deltaY, event.deltaMode)
    scheduleSmoothScroll(binaryHexScroll, 0, dy)
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

  function isChangedSideBySideRow(item: SideBySideRenderItem) {
    if (!item.row) {
      return false
    }

    return item.row.left?.change !== 'context' || item.row.right?.change !== 'context'
  }

  function isChangedUnifiedRow(item: UnifiedRenderItem) {
    return item.row?.change !== 'context'
  }

  onDestroy(() => {
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
            <strong>Large file — syntax highlighting active</strong>
            <span>Scrolling may be less responsive due to syntax highlighting on a large file.</span>
          {:else}
            <strong>Large file — maximum performance mode</strong>
            <span>Syntax highlighting and inline highlights disabled for responsive scrolling.</span>
          {/if}
        </div>
      {:else if simplifyLargeFullFileFragments}
        <div class="context-card compact large-file-rendering-note">
          {#if showSyntaxHighlighting}
            <strong>Large file — syntax highlighting active</strong>
            <span>Scrolling may be less responsive due to syntax highlighting on a large file.</span>
          {:else}
            <strong>Large file optimization active</strong>
            <span>Simplifying syntax and inline highlights to keep scrolling responsive.</span>
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
              on:wheel={(event) => handleSplitPaneWheel(event, 'left')}
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
                  style:position={virtualizeSideBySideActive ? 'relative' : undefined}
                >
                {#if sideBySideRenderItems.length === 0 && (!virtualizeSideBySide || activeDiff.sideBySide.length === 0)}
                  <div class="empty-inline-state">No changed lines.</div>
                {/if}

                {#if virtualizeSideBySideActive}
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

                {#each leftVisibleSideBySideItems as item, visibleIndex (virtualizeSideBySideActive ? leftVirtualRange.start + visibleIndex : visibleIndex)}
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
                      data-diff-anchor={virtualizeSideBySideActive ? undefined : item.isAnchor ? 'true' : undefined}
                      data-diff-index={virtualizeSideBySideActive ? undefined : isChangedSideBySideRow(item) ? item.hunkIndex : undefined}
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

                {#if virtualizeSideBySideActive && leftVirtualRange.bottomPadding > 0}
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
              on:wheel={(event) => handleSplitPaneWheel(event, 'right')}
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
                  style:position={virtualizeSideBySideActive ? 'relative' : undefined}
                >
                {#if sideBySideRenderItems.length === 0 && (!virtualizeSideBySide || activeDiff.sideBySide.length === 0)}
                  <div class="empty-inline-state">No changed lines.</div>
                {/if}

                {#if virtualizeSideBySideActive}
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

                {#each rightVisibleSideBySideItems as item, visibleIndex (virtualizeSideBySideActive ? rightVirtualRange.start + visibleIndex : visibleIndex)}
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
                      data-diff-anchor={virtualizeSideBySideActive ? undefined : item.isAnchor ? 'true' : undefined}
                      data-diff-index={virtualizeSideBySideActive ? undefined : isChangedSideBySideRow(item) ? item.hunkIndex : undefined}
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

                {#if virtualizeSideBySideActive && rightVirtualRange.bottomPadding > 0}
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
            <Minimap
              rows={rightPaneMinimapRows}
              scrollContainer={rightPaneScroll}
              onScrollTo={(top) => { if (rightPaneScroll) rightPaneScroll.scrollTop = top }}
            />
          </div>
        </section>
      </div>
      {:else}
      <div bind:this={unifiedScrollShell} class="unified-grid-shell pinned-bottom-scrollbar">
        <div
          bind:this={unifiedScroll}
          class="pane-vertical-scroll unified-vertical-scroll"
          on:wheel={handleUnifiedPaneWheel}
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
              style:position={virtualizeUnifiedActive ? 'relative' : undefined}
            >
            {#if unifiedRenderItems.length === 0 && (!virtualizeUnified || activeDiff.unified.length === 0)}
              <div class="empty-inline-state">No changed lines.</div>
            {/if}

            {#if virtualizeUnifiedActive}
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

            {#each visibleUnifiedItems as item, visibleIndex (virtualizeUnifiedActive ? unifiedVirtualRange.start + visibleIndex : visibleIndex)}
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
                  data-diff-anchor={virtualizeUnifiedActive ? undefined : item.isAnchor ? 'true' : undefined}
                  data-diff-index={virtualizeUnifiedActive ? undefined : isChangedUnifiedRow(item) ? item.hunkIndex : undefined}
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

            {#if virtualizeUnifiedActive && unifiedVirtualRange.bottomPadding > 0}
              <div aria-hidden="true" class="virtual-spacer" style:height={`${unifiedVirtualRange.bottomPadding}px`}></div>
            {/if}
            </div>
          </div>
        </div>
        <Minimap
          rows={unifiedMinimapData}
          scrollContainer={unifiedScroll}
          onScrollTo={(top) => { if (unifiedScroll) unifiedScroll.scrollTop = top }}
        />
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
          <div
            class="binary-hex-scroll"
            bind:this={binaryHexScroll}
            on:scroll={onBinaryHexScroll}
            on:wheel={handleBinaryWheel}
          >
            {#if binaryDiff}
              {#if !binaryDiff.previewLoaded}
                <div class="empty-inline-state binary-empty-state">
                  {binaryPreviewError ||
                    (binaryPreviewLoading
                      ? 'Loading binary preview...'
                      : 'Binary preview is not available yet.')}
                </div>
              {:else if binaryTotalRows === 0}
                <div class="empty-inline-state binary-empty-state">
                  {binaryDiff.truncated
                    ? 'Binary content is too large to render as hex.'
                    : 'No byte differences.'}
                </div>
              {:else}
                <div
                  class="binary-hex-table"
                  style:height={`${BINARY_HEADER_HEIGHT + binaryTotalRows * BINARY_ROW_HEIGHT}px`}
                >
                  <div class="binary-hex-header" style:height={`${BINARY_HEADER_HEIGHT}px`}>
                    <span class="binary-hex-cell binary-col-offset">Offset</span>
                    <span class="binary-hex-cell binary-col-hex">Left hex</span>
                    <span class="binary-hex-cell binary-col-ascii">Left ascii</span>
                    <span class="binary-hex-cell binary-col-hex">Right hex</span>
                    <span class="binary-hex-cell binary-col-ascii">Right ascii</span>
                  </div>

                  <div
                    class="binary-hex-rows"
                    style:top={`${BINARY_HEADER_HEIGHT + binaryVirtualStart * BINARY_ROW_HEIGHT}px`}
                  >
                    {#each { length: binaryVirtualEnd - binaryVirtualStart } as _, i (binaryVirtualStart + i)}
                      {@const view = getBinaryRowView(binaryVirtualStart + i)}
                      {#if view}
                        <div
                          class:changed={view.changed}
                          class="binary-hex-row"
                          style:height={`${BINARY_ROW_HEIGHT}px`}
                        >
                          <span class="binary-hex-cell binary-col-offset">{view.offset}</span>
                          <span class="binary-hex-cell binary-col-hex">
                            {#each view.leftHex as fragment}<span class:changed={fragment.changed}>{fragment.text}</span>{/each}
                          </span>
                          <span class="binary-hex-cell binary-col-ascii">
                            {#each view.leftAscii as fragment}<span class:changed={fragment.changed}>{fragment.text}</span>{/each}
                          </span>
                          <span class="binary-hex-cell binary-col-hex">
                            {#each view.rightHex as fragment}<span class:changed={fragment.changed}>{fragment.text}</span>{/each}
                          </span>
                          <span class="binary-hex-cell binary-col-ascii">
                            {#each view.rightAscii as fragment}<span class:changed={fragment.changed}>{fragment.text}</span>{/each}
                          </span>
                        </div>
                      {/if}
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
    {#if loading || detailLoading}
      <div class="viewer-loading">Refreshing diff...</div>
    {/if}
  {:else if detailLoading}
    <div class="empty-state">Loading diff...</div>
  {:else}
    <div class="empty-state">Run a compare to see the result.</div>
  {/if}
</section>
