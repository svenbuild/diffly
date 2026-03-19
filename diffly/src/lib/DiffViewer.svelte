<script lang="ts">
  import { tick } from 'svelte'
  import { detectSyntaxLanguage, renderDiffFragments } from './syntax'
  import type { DiffSegment, FileDiffResult, ViewMode } from './types'
  import type { SideBySideRenderItem, UnifiedRenderItem } from './ui-types'

  export let activeDiff: FileDiffResult | null
  export let loading: boolean
  export let detailLoading: boolean
  export let viewMode: ViewMode
  export let currentDiffHunk: number
  export let showInlineHighlights: boolean
  export let sideBySideRenderItems: SideBySideRenderItem[]
  export let unifiedRenderItems: UnifiedRenderItem[]
  export let getFileName: (path: string) => string
  export let syncPaneWheel: (event: WheelEvent, source: 'left' | 'right') => void
  export let syncPaneScroll: (source: 'left' | 'right') => void
  export let refreshDiffNavigationState: () => void
  export let leftPaneScroll: HTMLDivElement | null = null
  export let rightPaneScroll: HTMLDivElement | null = null
  export let unifiedScroll: HTMLDivElement | null = null
  let leftPaneGrid: HTMLDivElement | null = null
  let rightPaneGrid: HTMLDivElement | null = null
  let unifiedContentGrid: HTMLDivElement | null = null
  let syntaxLanguage: ReturnType<typeof detectSyntaxLanguage> = null
  let sideBySideContentWidth = 0
  let unifiedContentWidth = 0

  $: syntaxLanguage = activeDiff ? detectSyntaxLanguage(activeDiff.rightLabel) : null

  $: if (activeDiff?.contentKind === 'text' && viewMode === 'sideBySide') {
    sideBySideRenderItems
    void updateSideBySideContentWidth()
  }

  $: if (activeDiff?.contentKind === 'text' && viewMode === 'unified') {
    unifiedRenderItems
    void updateUnifiedContentWidth()
  }

  function syntaxFragments(text: string, segments: DiffSegment[]) {
    return renderDiffFragments(text, segments, syntaxLanguage)
  }

  async function updateSideBySideContentWidth() {
    await tick()

    if (!leftPaneScroll || !rightPaneScroll || !leftPaneGrid || !rightPaneGrid) {
      sideBySideContentWidth = 0
      return
    }

    sideBySideContentWidth = Math.max(
      leftPaneGrid.scrollWidth,
      rightPaneGrid.scrollWidth,
      leftPaneScroll.clientWidth,
      rightPaneScroll.clientWidth,
    )
  }

  async function updateUnifiedContentWidth() {
    await tick()

    if (!unifiedScroll || !unifiedContentGrid) {
      unifiedContentWidth = 0
      return
    }

    unifiedContentWidth = Math.max(unifiedContentGrid.scrollWidth, unifiedScroll.clientWidth)
  }
</script>

<svelte:window
  on:resize={() => {
    void updateSideBySideContentWidth()
    void updateUnifiedContentWidth()
  }}
/>

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
            on:wheel={(event) => syncPaneWheel(event, 'left')}
            on:scroll={() => syncPaneScroll('left')}
          >
            <div
              bind:this={leftPaneGrid}
              class="pane-grid"
              style:min-width={sideBySideContentWidth ? `${sideBySideContentWidth}px` : undefined}
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
                    data-diff-index={item.hunkIndex}
                  >
                    {#if item.row.left}
                      <span class="line-number">{item.row.left.lineNumber ?? ''}</span>
                      <span class="prefix">{item.row.left.prefix}</span>
                      <span class="line-text">
                        {#each syntaxFragments(item.row.left.text, item.row.left.segments) as fragment}
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
            on:wheel={(event) => syncPaneWheel(event, 'right')}
            on:scroll={() => syncPaneScroll('right')}
          >
            <div
              bind:this={rightPaneGrid}
              class="pane-grid"
              style:min-width={sideBySideContentWidth ? `${sideBySideContentWidth}px` : undefined}
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
                    data-diff-index={item.hunkIndex}
                  >
                    {#if item.row.right}
                      <span class="line-number">{item.row.right.lineNumber ?? ''}</span>
                      <span class="prefix">{item.row.right.prefix}</span>
                      <span class="line-text">
                        {#each syntaxFragments(item.row.right.text, item.row.right.segments) as fragment}
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
      <div bind:this={unifiedScroll} class="unified-grid" on:scroll={refreshDiffNavigationState}>
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
              data-diff-index={item.hunkIndex}
            >
              <span class="line-number">{item.row.leftLineNumber ?? ''}</span>
              <span class="line-number">{item.row.rightLineNumber ?? ''}</span>
              <span class="prefix">{item.row.prefix}</span>
              <span class="line-text">
                {#each syntaxFragments(item.row.text, item.row.segments) as fragment}
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
