<script context="module" lang="ts">
  let dropdownIdCounter = 0

  export interface DropdownOption {
    value: string
    label: string
  }
</script>

<script lang="ts">
  export let value: string
  export let options: ReadonlyArray<DropdownOption>
  export let onChange: (value: string) => void
  export let ariaLabel: string
  export let disabled = false
  /** Optional fixed width for the trigger (e.g. "88px"). Defaults to filling its container. */
  export let width: string | null = null

  const uid = `dropdown-${(dropdownIdCounter += 1)}`

  let open = false
  let dropUp = false
  let rootEl: HTMLDivElement
  let buttonEl: HTMLButtonElement
  let optionEls: HTMLButtonElement[] = []
  let activeIndex = -1

  $: selectedIndex = options.findIndex((option) => option.value === value)
  $: selectedLabel = selectedIndex >= 0 ? options[selectedIndex].label : ''

  // Keep the highlighted option visible while navigating with the keyboard.
  $: if (open && activeIndex >= 0) {
    optionEls[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }

  function openMenu() {
    if (disabled || open) {
      return
    }

    open = true
    activeIndex = selectedIndex >= 0 ? selectedIndex : 0
  }

  function closeMenu(returnFocus = true) {
    if (!open) {
      return
    }

    open = false

    if (returnFocus) {
      buttonEl?.focus()
    }
  }

  function toggleMenu() {
    if (open) {
      closeMenu(false)
    } else {
      openMenu()
    }
  }

  function choose(index: number) {
    const option = options[index]

    if (!option) {
      return
    }

    if (option.value !== value) {
      onChange(option.value)
    }

    closeMenu()
  }

  function handleButtonKeydown(event: KeyboardEvent) {
    if (disabled) {
      return
    }

    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault()
      openMenu()
    }
  }

  function handleMenuKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        activeIndex = Math.min(activeIndex + 1, options.length - 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        activeIndex = Math.max(activeIndex - 1, 0)
        break
      case 'Home':
        event.preventDefault()
        activeIndex = 0
        break
      case 'End':
        event.preventDefault()
        activeIndex = options.length - 1
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        choose(activeIndex)
        break
      case 'Escape':
        event.preventDefault()
        closeMenu()
        break
      case 'Tab':
        closeMenu(false)
        break
    }
  }

  function handleWindowClick(event: MouseEvent) {
    if (!open || rootEl?.contains(event.target as Node)) {
      return
    }

    open = false
  }

  // Open upward when there is not enough room below the trigger (e.g. a
  // dropdown near the bottom of a scrollable settings panel).
  function positionMenu(node: HTMLDivElement) {
    const triggerRect = buttonEl.getBoundingClientRect()
    const spaceBelow = window.innerHeight - triggerRect.bottom
    const spaceAbove = triggerRect.top

    dropUp = spaceBelow < node.offsetHeight + 12 && spaceAbove > spaceBelow
    node.focus()
  }
</script>

<svelte:window on:click={handleWindowClick} />

<div bind:this={rootEl} class="dropdown" class:open class:disabled style:width={width}>
  <button
    bind:this={buttonEl}
    aria-expanded={open}
    aria-haspopup="listbox"
    aria-label={ariaLabel}
    class="dropdown-trigger"
    {disabled}
    type="button"
    on:click={toggleMenu}
    on:keydown={handleButtonKeydown}
  >
    <span>{selectedLabel}</span>
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path
        d="m4.5 6.2 3.5 3.6 3.5-3.6"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
    </svg>
  </button>

  {#if open}
    <div
      aria-activedescendant={activeIndex >= 0 ? `${uid}-option-${activeIndex}` : undefined}
      aria-label={ariaLabel}
      class="dropdown-menu"
      class:up={dropUp}
      role="listbox"
      tabindex="-1"
      use:positionMenu
      on:keydown={handleMenuKeydown}
    >
      {#each options as option, index (option.value)}
        <button
          bind:this={optionEls[index]}
          aria-selected={option.value === value}
          class:active={option.value === value}
          class:highlighted={index === activeIndex}
          id={`${uid}-option-${index}`}
          role="option"
          type="button"
          on:click={() => choose(index)}
          on:mousemove={() => (activeIndex = index)}
        >
          {option.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .dropdown {
    position: relative;
    width: 100%;
    min-width: 0;
  }

  .dropdown-trigger {
    width: 100%;
    height: var(--control-height-md);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--control-radius);
    background: color-mix(in srgb, var(--surface) 90%, var(--panel-bg));
    color: var(--text);
    font-size: 12px;
    text-align: left;
  }

  .dropdown-trigger:hover:not(:disabled),
  .dropdown-trigger:focus-visible {
    border-color: color-mix(in srgb, var(--accent) 42%, var(--border-strong));
    background: color-mix(in srgb, var(--surface-strong) 22%, var(--surface));
  }

  .dropdown-trigger > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dropdown-trigger svg {
    width: 14px;
    height: 14px;
    color: var(--muted);
    transition: transform 140ms ease;
  }

  .dropdown.open .dropdown-trigger svg {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    position: absolute;
    z-index: 30;
    top: calc(100% + 4px);
    left: 0;
    min-width: 100%;
    width: max-content;
    max-width: min(280px, 72vw);
    max-height: 248px;
    overflow: auto;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: 0 8px 18px color-mix(in srgb, var(--app-bar-shadow-strong) 28%, transparent);
    outline: none;
  }

  .dropdown-menu.up {
    top: auto;
    bottom: calc(100% + 4px);
  }

  .dropdown-menu button {
    width: 100%;
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0;
    padding: 0 9px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    font-size: 12px;
    text-align: left;
    white-space: nowrap;
  }

  .dropdown-menu button:hover:not(:disabled),
  .dropdown-menu button.highlighted {
    border-color: transparent;
    background: var(--surface-alt);
  }

  .dropdown-menu button.active {
    border-color: color-mix(in srgb, var(--accent) 34%, transparent);
    background: color-mix(in srgb, var(--accent-soft) 54%, var(--surface-alt));
    color: var(--active-text);
  }

  .dropdown-menu button.active.highlighted,
  .dropdown-menu button.active:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent-soft) 68%, var(--surface-alt));
  }
</style>
