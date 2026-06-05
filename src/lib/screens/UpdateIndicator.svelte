<script lang="ts">
  import type { UpdateStatus } from '../app/update-controller'

  export let visible = false
  export let title = ''
  export let status: UpdateStatus = 'idle'
  export let onOpen: () => void
</script>

{#if visible}
  <button class="secondary update-indicator" {title} type="button" on:click={onOpen}>
    {#if status === 'downloading'}<span class="refresh-spinner visible"></span>{:else}Update{/if}
  </button>
{/if}
