<script context="module" lang="ts">
  export interface ContextMenuItem {
    id: string
    label: string
    danger?: boolean
    enabled: boolean
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte'

  export let items: ContextMenuItem[] = []
  export let onSelect: (id: string) => void = () => {}
  export let onRequestClose: () => void = () => {}

  let menuElement: HTMLDivElement | null = null

  function menuButtons(): HTMLButtonElement[] {
    if (!menuElement) {
      return []
    }
    return Array.from(menuElement.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
  }

  function focusItemAt(index: number) {
    const buttons = menuButtons()
    if (buttons.length === 0) {
      return
    }
    const clamped = ((index % buttons.length) + buttons.length) % buttons.length
    buttons[clamped]?.focus()
  }

  function focusedIndex(): number {
    const buttons = menuButtons()
    const active = menuElement?.ownerDocument.activeElement ?? null
    return buttons.findIndex((button) => button === active)
  }

  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        focusItemAt(focusedIndex() + 1)
        break
      case 'ArrowUp':
        focusItemAt(focusedIndex() - 1)
        break
      case 'Home':
        focusItemAt(0)
        break
      case 'End':
        focusItemAt(-1)
        break
      case 'Escape':
      case 'Tab':
        onRequestClose()
        break
      default:
        return
    }

    event.preventDefault()
    event.stopPropagation()
  }

  function handleItemClick(item: ContextMenuItem) {
    if (item.enabled) {
      onSelect(item.id)
    }
  }

  onMount(() => {
    // The host anchors this menu at the pointer with fixed positioning; nudge
    // it back inside the viewport when it would overflow an edge.
    if (!menuElement) {
      return
    }

    const rect = menuElement.getBoundingClientRect()
    const overflowX = Math.max(0, rect.right - window.innerWidth + 4)
    const overflowY = Math.max(0, rect.bottom - window.innerHeight + 4)
    if (overflowX > 0 || overflowY > 0) {
      menuElement.style.transform = `translate(${-overflowX}px, ${-overflowY}px)`
    }
  })
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  bind:this={menuElement}
  class="compare-context-menu"
  role="menu"
  tabindex="-1"
  on:keydown={handleKeydown}
>
  {#each items as item (item.id)}
    <button
      aria-disabled={!item.enabled}
      class:danger={item.danger === true}
      class:disabled={!item.enabled}
      class="compare-context-menu-item"
      role="menuitem"
      type="button"
      on:click={() => handleItemClick(item)}
    >
      {item.label}
    </button>
  {/each}
</div>

<style>
  .compare-context-menu {
    display: flex;
    flex-direction: column;
    min-width: 188px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--overlay-surface);
    box-shadow: 0 8px 18px color-mix(in srgb, var(--app-bar-shadow-strong) 28%, transparent);
  }

  .compare-context-menu-item {
    appearance: none;
    display: block;
    width: 100%;
    margin: 0;
    padding: 5px 10px;
    border: 0;
    border-radius: calc(var(--radius-md) - 3px);
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .compare-context-menu-item:hover:not(.disabled),
  .compare-context-menu-item:focus-visible:not(.disabled) {
    background: var(--surface-alt);
    outline: none;
  }

  .compare-context-menu-item:focus-visible {
    outline: none;
  }

  .compare-context-menu-item.disabled {
    color: var(--muted);
    cursor: default;
  }

  .compare-context-menu-item.danger:not(.disabled) {
    color: var(--danger, #e5484d);
  }
</style>
