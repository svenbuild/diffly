<script lang="ts">
  import type { FileDiffResult, ViewMode } from './types'
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
  export let syncPaneScroll: (source: 'left' | 'right') => void
  export let refreshDiffNavigationState: () => void
  export let leftPaneScroll: HTMLDivElement | null = null
  export let rightPaneScroll: HTMLDivElement | null = null
  export let unifiedScroll: HTMLDivElement | null = null
</script>

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
                  <div
                    class:current-diff-target={item.hunkIndex === currentDiffHunk}
                    class="hunk-row"
                    data-diff-anchor={item.isAnchor ? 'true' : undefined}
                    data-diff-index={item.hunkIndex}
                  >
                    {item.header}
                  </div>
                {:else if item.row}
                  <div
                    class:current-diff-target={item.isAnchor && item.hunkIndex === currentDiffHunk}
                    class={`diff-row ${item.row.left?.change ?? item.row.right?.change ?? 'context'}`}
                    data-diff-anchor={item.isAnchor ? 'true' : undefined}
                    data-diff-index={item.hunkIndex}
                  >
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
            on:scroll={() => syncPaneScroll('right')}
          >
            <div class="pane-grid">
              {#if sideBySideRenderItems.length === 0}
                <div class="empty-inline-state">No changed lines.</div>
              {/if}

              {#each sideBySideRenderItems as item}
                {#if item.type === 'hunk'}
                  <div class:current-diff-target={item.hunkIndex === currentDiffHunk} class="hunk-row">
                    {item.header}
                  </div>
                {:else if item.row}
                  <div
                    class:current-diff-target={item.isAnchor && item.hunkIndex === currentDiffHunk}
                    class={`diff-row ${item.row.right?.change ?? item.row.left?.change ?? 'context'}`}
                  >
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
        {#if unifiedRenderItems.length === 0}
          <div class="empty-inline-state">No changed lines.</div>
        {/if}

        {#each unifiedRenderItems as item}
          {#if item.type === 'hunk'}
            <div
              class:current-diff-target={item.hunkIndex === currentDiffHunk}
              class="hunk-row unified-hunk"
              data-diff-anchor={item.isAnchor ? 'true' : undefined}
              data-diff-index={item.hunkIndex}
            >
              {item.header}
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
