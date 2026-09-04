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
  let rootEl: HTMLDivElement
  let buttonEl: HTMLButtonElement
  let menuEl: HTMLDivElement | null = null
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
      buttonEl?.focus({ preventScroll: true })
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
    const target = event.target as Node

    if (!open || rootEl?.contains(target) || menuEl?.contains(target)) {
      return
    }

    open = false
  }

  // Render the menu on document.body with fixed positioning anchored to the
  // trigger. This keeps it out of the settings panels (which use
  // overflow: hidden) so it can never be clipped by, or reflow, their layout.
  // Opens upward when there is not enough room below the trigger.
  function placeMenu(node: HTMLDivElement) {
    menuEl = node
    document.body.appendChild(node)

    const rect = buttonEl.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < node.offsetHeight + 12 && rect.top > spaceBelow

    node.style.left = `${rect.left}px`
    node.style.minWidth = `${rect.width}px`

    if (openUp) {
      node.style.top = 'auto'
      node.style.bottom = `${window.innerHeight - rect.top + 4}px`
    } else {
      node.style.bottom = 'auto'
      node.style.top = `${rect.bottom + 4}px`
    }

    // preventScroll: focusing for keyboard nav must not scroll the panel.
    node.focus({ preventScroll: true })

    // A fixed menu would detach visually if the page scrolls, so close it —
    // but ignore scrolling within the menu's own option list.
    const close = (event: Event) => {
      if (event.type === 'scroll' && node.contains(event.target as Node)) {
        return
      }

      open = false
    }

    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)

    return {
      destroy() {
        window.removeEventListener('scroll', close, true)
        window.removeEventListener('resize', close)
        menuEl = null
        node.parentNode?.removeChild(node)
      },
    }
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
      role="listbox"
      tabindex="-1"
      use:placeMenu
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
    background: var(--input-surface, var(--surface));
    color: var(--text);
    font-size: 12px;
    text-align: left;
  }

  .dropdown-trigger:hover:not(:disabled),
  .dropdown-trigger:focus-visible {
    border-color: color-mix(in srgb, var(--accent) 42%, var(--border-strong));
    background: color-mix(in srgb, var(--input-surface, var(--surface)) 92%, var(--text));
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

  /* Positioned on document.body by the placeMenu action (top/left/min-width
     are set inline), so it is never clipped by the panels' overflow: hidden. */
  .dropdown-menu {
    position: fixed;
    z-index: 1000;
    width: max-content;
    max-width: min(280px, 72vw);
    max-height: 248px;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) transparent;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--overlay-surface);
    box-shadow: 0 8px 18px color-mix(in srgb, var(--app-bar-shadow-strong) 28%, transparent);
    outline: none;
  }

  .dropdown-menu::-webkit-scrollbar {
    width: 8px;
  }

  .dropdown-menu::-webkit-scrollbar-thumb {
    border: 2px solid transparent;
    border-radius: 999px;
    background: var(--scrollbar-thumb);
    background-clip: padding-box;
  }

  .dropdown-menu::-webkit-scrollbar-track {
    background: transparent;
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
