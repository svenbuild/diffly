<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import { detectSyntaxLanguage, renderDiffFragments } from './syntax'
  import type { RenderedDiffFragment } from './syntax'
  import type { DiffCell, FileDiffResult, UnifiedLine, ViewMode } from './types'
  import type { DiffHeaderContext, SideBySideRenderItem, UnifiedRenderItem } from './ui-types'

  export let activeDiff: FileDiffResult | null
  export let loading: boolean
  export let detailLoading: boolean
  export let viewMode: ViewMode
  export let currentDiffHunk: number
  export let showInlineHighlights: boolean
  export let wrapSideBySideLines: boolean
  export let showSyntaxHighlighting: boolean
  export let syncSideBySideScroll: boolean
  export let sideBySideRenderItems: SideBySideRenderItem[]
  export let unifiedRenderItems: UnifiedRenderItem[]
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
  let lineNumberColumnWidth = 'calc(1ch + 18px)'
  let prefixColumnWidth = 'calc(1ch + 8px)'
  let scrollMarkerRefreshQueued = false
  let scrollMarkerObserver: ResizeObserver | null = null
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

  $: {
    leftPaneScroll
    rightPaneScroll
    unifiedScroll
    leftPaneGrid
    rightPaneGrid
    unifiedContentGrid
    syncScrollMarkerObserver()
  }

  function currentSyntaxKey() {
    return showSyntaxHighlighting && syntaxLanguage ? syntaxLanguage : ''
  }

  function getCachedDiffCellFragments(cell: DiffCell) {
    const syntaxKey = currentSyntaxKey()
    const cached = diffCellFragmentCache.get(cell)

    if (cached && cached.syntaxKey === syntaxKey) {
      return cached.fragments
    }

    const fragments = renderDiffFragments(
      cell.text,
      cell.segments,
      syntaxKey ? syntaxLanguage : null,
    )

    diffCellFragmentCache.set(cell, { fragments, syntaxKey })
    return fragments
  }

  function getCachedUnifiedLineFragments(line: UnifiedLine) {
    const syntaxKey = currentSyntaxKey()
    const cached = unifiedLineFragmentCache.get(line)

    if (cached && cached.syntaxKey === syntaxKey) {
      return cached.fragments
    }

    const fragments = renderDiffFragments(
      line.text,
      line.segments,
      syntaxKey ? syntaxLanguage : null,
    )

    unifiedLineFragmentCache.set(line, { fragments, syntaxKey })
    return fragments
  }

  async function updateSideBySideContentMetrics() {
    await tick()

    if (!leftPaneScroll || !rightPaneScroll || !leftPaneGrid || !rightPaneGrid) {
      sideBySideContentWidth = 0
      leftPaneTrailingSpace = 0
      rightPaneTrailingSpace = 0
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

    const leftContentHeight = Math.max(0, leftPaneGrid.scrollHeight - leftPaneTrailingSpace)
    const rightContentHeight = Math.max(0, rightPaneGrid.scrollHeight - rightPaneTrailingSpace)
    const leftMaxScrollTop = Math.max(0, leftContentHeight - leftPaneScroll.clientHeight)
    const rightMaxScrollTop = Math.max(0, rightContentHeight - rightPaneScroll.clientHeight)
    const sharedMaxScrollTop = Math.max(leftMaxScrollTop, rightMaxScrollTop)

    leftPaneTrailingSpace = Math.max(0, sharedMaxScrollTop - leftMaxScrollTop)
    rightPaneTrailingSpace = Math.max(0, sharedMaxScrollTop - rightMaxScrollTop)
  }

  async function updateUnifiedContentWidth() {
    await tick()

    if (!unifiedScroll || !unifiedContentGrid) {
      unifiedContentWidth = 0
      return
    }

    unifiedContentWidth = Math.max(unifiedContentGrid.scrollWidth, unifiedScroll.clientWidth)
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
    leftScrollMarkers = buildScrollMarkers(leftPaneScroll, leftPaneGrid, leftPaneTrailingSpace)
    rightScrollMarkers = buildScrollMarkers(rightPaneScroll, rightPaneGrid, rightPaneTrailingSpace)
    unifiedScrollMarkers = buildScrollMarkers(unifiedScroll, unifiedContentGrid)
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
  })
</script>

<svelte:window
  on:resize={() => {
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

    {#if activeDiff.contentKind !== 'text'}
      <div class="message-card">{activeDiff.summary}</div>
    {:else if viewMode === 'sideBySide'}
      <div
        class:sync-disabled={!syncSideBySideScroll}
        class:wrapped-lines={wrapSideBySideLines}
        class="split-view"
      >
        <section class="diff-pane">
          <div class="pane-header" title={diffHeaderContext.leftAbsolutePath}>
            <span class="pane-header-side">Left</span>
            <span aria-hidden="true" class="pane-header-separator">&middot;</span>
            <strong class="pane-header-label">{diffHeaderContext.leftPaneLabel}</strong>
          </div>
          <div class="pane-scroll-shell">
            <div
              bind:this={leftPaneScroll}
              class="pane-scroll"
              on:wheel={(event) => syncPaneWheel(event, 'left')}
              on:scroll={() => syncPaneScroll('left')}
            >
              <div
                bind:this={leftPaneGrid}
                class="pane-grid"
                style:min-width={!wrapSideBySideLines && sideBySideContentWidth ? `${sideBySideContentWidth}px` : undefined}
                style:padding-bottom={leftPaneTrailingSpace ? `${leftPaneTrailingSpace}px` : undefined}
              >
              {#if sideBySideRenderItems.length === 0}
                <div class="empty-inline-state">No changed lines.</div>
              {/if}

              {#each sideBySideRenderItems as item}
                {#if item.type === 'hunk'}
                  <div class="collapsed-row">
                    <span class="collapsed-chip">{item.header}</span>
                  </div>
                {:else if item.row}
                  <div
                    class:current-diff-target={item.isAnchor && item.hunkIndex === currentDiffHunk}
                    class:gap-row={!item.row.left}
                    class={`diff-row ${item.row.left?.change ?? item.row.right?.change ?? 'context'}`}
                    data-diff-anchor={item.isAnchor ? 'true' : undefined}
                    data-diff-index={isChangedSideBySideRow(item) ? item.hunkIndex : undefined}
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
              </div>
            </div>
            <div class="scroll-marker-overlay">
              <div class="scroll-marker-rail">
                {#each leftScrollMarkers as marker}
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

        <section class="diff-pane">
          <div class="pane-header" title={diffHeaderContext.rightAbsolutePath}>
            <span class="pane-header-side">Right</span>
            <span aria-hidden="true" class="pane-header-separator">&middot;</span>
            <strong class="pane-header-label">{diffHeaderContext.rightPaneLabel}</strong>
          </div>
          <div class="pane-scroll-shell">
            <div
              bind:this={rightPaneScroll}
              class="pane-scroll"
              on:wheel={(event) => syncPaneWheel(event, 'right')}
              on:scroll={() => syncPaneScroll('right')}
            >
              <div
                bind:this={rightPaneGrid}
                class="pane-grid"
                style:min-width={!wrapSideBySideLines && sideBySideContentWidth ? `${sideBySideContentWidth}px` : undefined}
                style:padding-bottom={rightPaneTrailingSpace ? `${rightPaneTrailingSpace}px` : undefined}
              >
              {#if sideBySideRenderItems.length === 0}
                <div class="empty-inline-state">No changed lines.</div>
              {/if}

              {#each sideBySideRenderItems as item}
                {#if item.type === 'hunk'}
                  <div class="collapsed-row">
                    <span class="collapsed-chip">{item.header}</span>
                  </div>
                {:else if item.row}
                  <div
                    class:current-diff-target={item.isAnchor && item.hunkIndex === currentDiffHunk}
                    class:gap-row={!item.row.right}
                    class={`diff-row ${item.row.right?.change ?? item.row.left?.change ?? 'context'}`}
                    data-diff-anchor={item.isAnchor ? 'true' : undefined}
                    data-diff-index={isChangedSideBySideRow(item) ? item.hunkIndex : undefined}
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
              </div>
            </div>
            <div class="scroll-marker-overlay">
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
      <div class="unified-grid-shell">
        <div bind:this={unifiedScroll} class="unified-grid" on:scroll={scheduleScrollNavigationRefresh}>
          <div
            bind:this={unifiedContentGrid}
            class="unified-content-grid"
            style:min-width={unifiedContentWidth ? `${unifiedContentWidth}px` : undefined}
          >
          {#if unifiedRenderItems.length === 0}
            <div class="empty-inline-state">No changed lines.</div>
          {/if}

          {#each unifiedRenderItems as item}
            {#if item.type === 'hunk'}
              <div class="collapsed-row unified-collapsed-row">
                <span class="collapsed-chip">{item.header}</span>
              </div>
            {:else if item.row}
              <div
                class:current-diff-target={item.isAnchor && item.hunkIndex === currentDiffHunk}
                class={`unified-row ${item.row.change}`}
                data-diff-anchor={item.isAnchor ? 'true' : undefined}
                data-diff-index={isChangedUnifiedRow(item) ? item.hunkIndex : undefined}
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
