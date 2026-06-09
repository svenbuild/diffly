<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    context = '',
    status,
    leading,
    middle,
    actions,
  }: {
    context?: string
    status?: Snippet
    leading?: Snippet
    middle?: Snippet
    actions?: Snippet
  } = $props()
</script>

<header class="app-bar app-top-bar">
  <div class="app-bar-main">
    <div class="app-brand-group">
      <div class="app-identity">
        <h1>Diffly</h1>
        <span>{context}</span>
      </div>
    </div>
    {#if leading}
      <div class="app-bar-leading">
        {@render leading()}
      </div>
    {/if}
  </div>

  <div class="app-bar-context">
    {@render middle?.()}
  </div>

  <div class="app-bar-actions">
    {@render status?.()}
    {@render actions?.()}
  </div>
</header>
