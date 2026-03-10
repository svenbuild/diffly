<script lang="ts">
  import type { ExplorerEntryKind } from './types'

  export let kind: ExplorerEntryKind
  export let open = false
</script>

{#if kind === 'drive'}
  <svg aria-hidden="true" class="entry-icon drive" viewBox="0 0 16 16">
    <path
      d="M2.25 4.75A1.75 1.75 0 0 1 4 3h8a1.75 1.75 0 0 1 1.75 1.75v5.5A1.75 1.75 0 0 1 12 12H4a1.75 1.75 0 0 1-1.75-1.75zm1.5.25v5a.25.25 0 0 0 .25.25h8a.25.25 0 0 0 .25-.25V5a.25.25 0 0 0-.25-.25H4a.25.25 0 0 0-.25.25M4.5 8.5a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8m2.5.9a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 0 1.5h-3A.75.75 0 0 1 7 9.4"
      fill="currentColor"
    />
  </svg>
{:else if kind === 'directory'}
  <svg aria-hidden="true" class:open class="entry-icon folder" viewBox="0 0 16 16">
    <path
      d="M1.75 3.75C1.75 2.78 2.53 2 3.5 2h2.22c.45 0 .88.18 1.2.5l.58.58c.14.14.33.22.53.22h4.47c.97 0 1.75.78 1.75 1.75v1.2H1.75zm0 2h12.5v5.75c0 .97-.78 1.75-1.75 1.75H3.5a1.75 1.75 0 0 1-1.75-1.75z"
      fill="currentColor"
    />
  </svg>
{:else}
  <svg aria-hidden="true" class="entry-icon file" viewBox="0 0 16 16">
    <path
      d="M4 1.75A1.75 1.75 0 0 0 2.25 3.5v9A1.75 1.75 0 0 0 4 14.25h8A1.75 1.75 0 0 0 13.75 12.5V6.56a1.75 1.75 0 0 0-.51-1.24L10.43 2.5A1.75 1.75 0 0 0 9.19 2H4zm5 .87 2.88 2.88H9.75A.75.75 0 0 1 9 4.75zM5 8.25A.75.75 0 0 1 5.75 7.5h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 5 8.25m0 2.75a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 5 11"
      fill="currentColor"
    />
  </svg>
{/if}
