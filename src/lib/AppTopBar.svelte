<script lang="ts">
  import { onMount } from 'svelte'
  import type { Snippet } from 'svelte'
  import { getWindowControls } from './api'

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

  const windowControls = getWindowControls()
  let maximized = $state(false)

  onMount(() => {
    if (!windowControls) {
      return
    }

    let disposed = false
    void windowControls
      .isMaximized()
      .then((value) => {
        if (!disposed) {
          maximized = value === true
        }
      })
      .catch(() => {})
    const unsubscribe = windowControls.onMaximizedChange((value) => {
      maximized = value === true
    })

    return () => {
      disposed = true
      unsubscribe()
    }
  })

  function minimizeWindow() {
    void windowControls?.minimize()
  }

  function toggleMaximizeWindow() {
    void windowControls?.toggleMaximize()
  }

  function toggleMaximizeFromDragArea(event: MouseEvent) {
    if (!windowControls || event.button !== 0 || event.target !== event.currentTarget) {
      return
    }

    toggleMaximizeWindow()
  }

  function closeWindow() {
    void windowControls?.close()
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<header
  class={windowControls ? 'app-bar app-top-bar has-window-controls' : 'app-bar app-top-bar'}
  ondblclick={toggleMaximizeFromDragArea}
>
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

  {#if windowControls}
    <div class="window-title-bar-controls">
      <button
        type="button"
        class="window-control"
        aria-label="Minimize window"
        title="Minimize"
        onclick={minimizeWindow}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0.5 5h9" />
        </svg>
      </button>
      <button
        type="button"
        class="window-control"
        aria-label={maximized ? 'Restore window' : 'Maximize window'}
        title={maximized ? 'Restore' : 'Maximize'}
        onclick={toggleMaximizeWindow}
      >
        {#if maximized}
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2.5 2.5v-2h7v7h-2" />
            <rect x="0.5" y="2.5" width="7" height="7" />
          </svg>
        {:else}
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        {/if}
      </button>
      <button
        type="button"
        class="window-control window-control-close"
        aria-label="Close window"
        title="Close"
        onclick={closeWindow}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
        </svg>
      </button>
    </div>
  {/if}
</header>
