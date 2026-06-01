<script lang="ts">
  import { formatSize } from '../format'
  import type { UnsupportedDiffPayload } from '../types'

  export let unsupported: UnsupportedDiffPayload | null
  export let summary = ''

  const reasonLabel: Record<UnsupportedDiffPayload['reason'], string> = {
    binary: 'Binary file',
    image: 'Image file',
    tooLarge: 'File too large',
    missing: 'Missing file',
    readError: 'Read error',
  }
</script>

<section class="unsupported-compare-view">
  <div class="unsupported-compare-copy">
    <h2>{unsupported ? reasonLabel[unsupported.reason] : 'Unsupported file'}</h2>
    <p>{summary || 'This file cannot be rendered as a text diff.'}</p>
  </div>

  {#if unsupported}
    <dl class="unsupported-compare-meta">
      <div>
        <dt>Left</dt>
        <dd title={unsupported.leftPath ?? ''}>
          <span>{unsupported.leftPath ?? 'Missing'}</span>
          <strong>{formatSize(unsupported.leftSize)}</strong>
        </dd>
      </div>

      <div>
        <dt>Right</dt>
        <dd title={unsupported.rightPath ?? ''}>
          <span>{unsupported.rightPath ?? 'Missing'}</span>
          <strong>{formatSize(unsupported.rightSize)}</strong>
        </dd>
      </div>
    </dl>
  {/if}
</section>
