<script lang="ts">
  import { onMount } from 'svelte'
  import { getWindowControls } from '../api'

  let { subtitle = '' }: { subtitle?: string } = $props()

  // Present only on frameless (Windows) builds; null means render nothing.
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

  function closeWindow() {
    void windowControls?.close()
  }
</script>

{#if windowControls}
  <!--
    Fallback for environments where the OS does not toggle maximize on
    caption double-click itself. Drag regions normally swallow mouse events,
    so this fires only when the native handling is absent.
  -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <header class="window-title-bar" ondblclick={toggleMaximizeWindow}>
    <div class="window-title-bar-brand">
      <span class="window-title-bar-title">Diffly</span>
      {#if subtitle}
        <span class="window-title-bar-subtitle">{subtitle}</span>
      {/if}
    </div>
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
  </header>
{/if}

<style>
  .window-title-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 0 0 auto;
    height: 34px;
    min-height: 34px;
    padding-left: 12px;
    background: var(--app-bar-bg);
    border-bottom: 1px solid var(--border-subtle);
    color: var(--muted);
    user-select: none;
    -webkit-app-region: drag;
  }

  .window-title-bar-brand {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
  }

  .window-title-bar-title {
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text);
  }

  .window-title-bar-subtitle {
    font-size: 0.74rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .window-title-bar-controls {
    display: flex;
    align-items: stretch;
    align-self: stretch;
    flex: 0 0 auto;
    -webkit-app-region: no-drag;
  }

  .window-control {
    width: 46px;
    padding: 0;
    border: none;
    border-radius: 0;
    background: transparent;
    color: var(--muted);
    transition: background-color 120ms ease, color 120ms ease;
    -webkit-app-region: no-drag;
  }

  .window-control:hover:not(:disabled) {
    border: none;
    background: color-mix(in srgb, var(--text) 10%, transparent);
    color: var(--text);
    box-shadow: none;
  }

  .window-control:active:not(:disabled) {
    background: color-mix(in srgb, var(--text) 16%, transparent);
    transform: none;
  }

  .window-control:focus-visible {
    border: none;
    box-shadow: inset 0 0 0 1px var(--accent-strong);
  }

  .window-control-close:hover:not(:disabled) {
    background: #e81123;
    color: #ffffff;
  }

  .window-control-close:active:not(:disabled) {
    background: #c50f1f;
    color: #ffffff;
  }

  .window-control svg {
    width: 10px;
    height: 10px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1;
  }
</style>
