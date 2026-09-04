<script lang="ts">
  import { onDestroy } from 'svelte'
  import type {
    AppearanceSettings,
    ThemeAdvancedColorKey,
    ThemeDefinition,
    ThemeSemanticColorKey,
    ThemeVariant,
  } from '../theme'
  import { createThemeCssVariables } from '../theme/runtime'
  import {
    themeRoleFromCssValue,
    type InspectableThemeRole as ColorRole,
  } from './theme-inspector'

  interface ColorField {
    role: ColorRole
    label: string
  }

  export let open: boolean
  export let revision: number
  export let initialAppearance: ThemeVariant
  export let seedName: string
  export let editing: boolean
  export let availableAppearances: ThemeVariant[]
  export let appearanceSettings: AppearanceSettings
  export let lightTheme: ThemeDefinition
  export let darkTheme: ThemeDefinition
  export let onSetThemeColor: (
    variant: ThemeVariant,
    field: 'accent' | 'surface' | 'ink',
    value: string,
  ) => void
  export let onSetThemeSemanticColor: (
    variant: ThemeVariant,
    field: ThemeSemanticColorKey,
    value: string,
  ) => void
  export let onSetThemeAdvancedColor: (
    variant: ThemeVariant,
    field: ThemeAdvancedColorKey,
    value: string,
  ) => void
  export let onClose: () => void

  const foundationFields: ColorField[] = [
    { role: 'background', label: 'Background' },
    { role: 'surface', label: 'Surface' },
    { role: 'raised', label: 'Raised surface' },
    { role: 'overlay', label: 'Overlay' },
    { role: 'text', label: 'Text' },
    { role: 'muted', label: 'Muted text' },
    { role: 'border', label: 'Border' },
    { role: 'input', label: 'Input' },
  ]

  const brandFields: ColorField[] = [
    { role: 'accent', label: 'Accent' },
    { role: 'added', label: 'Added changes' },
    { role: 'removed', label: 'Removed changes' },
    { role: 'syntax', label: 'Syntax accent' },
  ]

  let lastRevision = -1
  let name = ''
  let activeAppearance: ThemeVariant = 'dark'
  let advanced = false
  let minimized = false
  let inspecting = false
  let selectedRole: ColorRole | null = null
  let query = ''
  let draftColors: Record<ColorRole, string> = emptyColors()
  let panel: HTMLDivElement
  let position: { x: number; y: number } | null = null
  let dragOffset: { x: number; y: number } | null = null
  let inspectorListenersActive = false
  let highlightedElement: HTMLElement | null = null
  let inspectorLabelElement: HTMLDivElement | null = null
  let highlightRestore: Array<{ property: string; value: string; priority: string }> = []
  let lastInspectedElement: Element | null = null
  let inspectionFrame: number | null = null
  const inspectedRoleCache = new WeakMap<Element, ColorRole | null>()


  $: if (open && revision !== lastRevision) {
    lastRevision = revision
    name = seedName
    activeAppearance = initialAppearance
    advanced = false
    minimized = false
    inspecting = false
    selectedRole = null
    query = ''
    position = null
    draftColors = colorsForTheme(activeAppearance === 'light' ? lightTheme : darkTheme)
  }

  $: syncInspectorListeners(open && inspecting)

  onDestroy(() => {
    syncInspectorListeners(false)
  })

  function emptyColors(): Record<ColorRole, string> {
    return {
      background: '#000000',
      surface: '#000000',
      raised: '#000000',
      overlay: '#000000',
      text: '#ffffff',
      muted: '#808080',
      border: '#202020',
      input: '#202020',
      accent: '#346bf1',
      added: '#00a240',
      removed: '#e02e2a',
      syntax: '#8160d8',
    }
  }

  function colorsForTheme(theme: ThemeDefinition): Record<ColorRole, string> {
    const variables = createThemeCssVariables(theme, appearanceSettings)
    return {
      background: variables['--canvas'] ?? theme.surface,
      surface: variables['--surface'] ?? theme.surface,
      raised: variables['--surface-alt'] ?? theme.surface,
      overlay: variables['--surface-strong'] ?? theme.surface,
      text: variables['--text'] ?? theme.ink,
      muted: variables['--muted'] ?? theme.ink,
      border: variables['--border'] ?? theme.ink,
      input: variables['--surface-strong'] ?? theme.surface,
      accent: theme.accent,
      added: theme.semanticColors.diffAdded,
      removed: theme.semanticColors.diffRemoved,
      syntax: theme.semanticColors.skill,
    }
  }

  function setAppearance(variant: ThemeVariant) {
    if (!availableAppearances.includes(variant)) return
    activeAppearance = variant
    selectedRole = null
    draftColors = colorsForTheme(variant === 'light' ? lightTheme : darkTheme)
  }

  function updateColor(role: ColorRole, value: string) {
    draftColors = { ...draftColors, [role]: value.toLowerCase() }
    selectedRole = role
  }

  function saveTheme() {
    if (!editing && !name.trim()) return
    onSetThemeColor(
      activeAppearance,
      'surface',
      advanced ? draftColors.surface : draftColors.background,
    )
    onSetThemeColor(activeAppearance, 'accent', draftColors.accent)
    if (advanced) {
      onSetThemeColor(activeAppearance, 'ink', draftColors.text)
      onSetThemeAdvancedColor(activeAppearance, 'background', draftColors.background)
      onSetThemeAdvancedColor(activeAppearance, 'raisedSurface', draftColors.raised)
      onSetThemeAdvancedColor(activeAppearance, 'overlay', draftColors.overlay)
      onSetThemeAdvancedColor(activeAppearance, 'mutedText', draftColors.muted)
      onSetThemeAdvancedColor(activeAppearance, 'border', draftColors.border)
      onSetThemeAdvancedColor(activeAppearance, 'input', draftColors.input)
      onSetThemeSemanticColor(activeAppearance, 'diffAdded', draftColors.added)
      onSetThemeSemanticColor(activeAppearance, 'diffRemoved', draftColors.removed)
      onSetThemeSemanticColor(activeAppearance, 'skill', draftColors.syntax)
    }
    onClose()
  }

  function toggleInspector() {
    inspecting = !inspecting
    if (!inspecting) selectedRole = null
  }

  function roleLabel(role: ColorRole) {
    return foundationFields.concat(brandFields).find((field) => field.role === role)?.label ?? role
  }

  function roleFromStyle(style: CSSStyleDeclaration) {
    const preferredProperties = [
      'background',
      'background-color',
      'color',
      'border',
      'border-color',
      'border-top-color',
      'outline-color',
      'box-shadow',
      'fill',
      'stroke',
    ]
    for (const property of preferredProperties) {
      const role = themeRoleFromCssValue(style.getPropertyValue(property))
      if (role) return role
    }
    return null
  }

  function roleFromRules(element: Element, rules: CSSRuleList): ColorRole | null {
    let matchedRole: ColorRole | null = null
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        try {
          if (!element.matches(rule.selectorText)) continue
        } catch {
          continue
        }
        const role = roleFromStyle(rule.style)
        if (role) matchedRole = role
        continue
      }
      if ('cssRules' in rule) {
        try {
          const role = roleFromRules(element, (rule as CSSGroupingRule).cssRules)
          if (role) matchedRole = role
        } catch {
          // Cross-origin and unsupported rule lists are not inspectable.
        }
      }
    }
    return matchedRole
  }

  function roleFromElement(element: Element) {
    const cached = inspectedRoleCache.get(element)
    if (cached !== undefined) return cached
    const root = element.getRootNode()
    const styleSheets = Array.from(document.styleSheets)
    if (root instanceof ShadowRoot) {
      styleSheets.push(...Array.from(root.adoptedStyleSheets))
      for (const style of Array.from(root.querySelectorAll('style'))) {
        if (style.sheet) styleSheets.push(style.sheet)
      }
    }
    let matchedRole: ColorRole | null = null
    for (const sheet of styleSheets) {
      try {
        const role = roleFromRules(element, sheet.cssRules)
        if (role) matchedRole = role
      } catch {
        // Stylesheets without readable rules are ignored.
      }
    }
    inspectedRoleCache.set(element, matchedRole)
    return matchedRole
  }

  function inspectTarget(target: Element | null) {
    if (!target || panel.contains(target)) {
      clearInspectorHighlight()
      return
    }
    let element: Element | null = target
    let role: ColorRole | null = null
    while (element && element !== document.documentElement) {
      role = roleFromElement(element)
      if (role) break
      element = element.parentElement
    }
    if (!role || !(element instanceof HTMLElement)) {
      clearInspectorHighlight()
      return
    }
    if (highlightedElement !== element) {
      clearInspectorHighlight()
      highlightedElement = element
      highlightedElement.dataset.themeInspectorHighlight = ''
      highlightRestore = ['outline', 'outline-offset', 'box-shadow'].map((property) => ({
        property,
        value: highlightedElement!.style.getPropertyValue(property),
        priority: highlightedElement!.style.getPropertyPriority(property),
      }))
      highlightedElement.style.setProperty('outline', '2px solid var(--accent-strong)', 'important')
      highlightedElement.style.setProperty('outline-offset', '-2px', 'important')
      highlightedElement.style.setProperty(
        'box-shadow',
        '0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent)',
        'important',
      )
    }
    selectedRole = role
    updateInspectorLabel(role)
    if (role !== 'background' && role !== 'accent') advanced = true
  }

  function updateInspectorLabel(role: ColorRole) {
    if (!highlightedElement) return
    if (!inspectorLabelElement) {
      inspectorLabelElement = document.createElement('div')
      inspectorLabelElement.dataset.themeInspectorLabel = ''
      document.body.append(inspectorLabelElement)
    }
    const bounds = highlightedElement.getBoundingClientRect()
    inspectorLabelElement.textContent = roleLabel(role)
    inspectorLabelElement.style.left = `${Math.max(4, bounds.left)}px`
    inspectorLabelElement.style.top = `${Math.max(4, bounds.top - 26)}px`
  }

  function clearInspectorHighlight() {
    if (highlightedElement) {
      delete highlightedElement.dataset.themeInspectorHighlight
      for (const { property, value, priority } of highlightRestore) {
        if (value) highlightedElement.style.setProperty(property, value, priority)
        else highlightedElement.style.removeProperty(property)
      }
    }
    highlightedElement = null
    highlightRestore = []
    inspectorLabelElement?.remove()
    inspectorLabelElement = null
    lastInspectedElement = null
  }

  function handleInspectorViewportChange() {
    if (selectedRole) updateInspectorLabel(selectedRole)
  }

  function handleInspectorPointerMove(event: PointerEvent) {
    const target = event.composedPath().find((item) => item instanceof Element) as Element | undefined
    if (target === lastInspectedElement) return
    lastInspectedElement = target ?? null
    if (inspectionFrame !== null) cancelAnimationFrame(inspectionFrame)
    inspectionFrame = requestAnimationFrame(() => {
      inspectionFrame = null
      inspectTarget(target ?? null)
    })
  }

  function handleInspectorClick(event: MouseEvent) {
    const target = event.composedPath().find((item) => item instanceof Element) as Element | undefined
    if (!target || panel.contains(target)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    inspectTarget(target)
    inspecting = false
  }

  function syncInspectorListeners(enabled: boolean) {
    if (enabled === inspectorListenersActive || typeof document === 'undefined') return
    inspectorListenersActive = enabled
    if (enabled) {
      document.documentElement.classList.add('theme-inspecting')
      document.addEventListener('pointermove', handleInspectorPointerMove, true)
      document.addEventListener('click', handleInspectorClick, true)
      document.addEventListener('scroll', handleInspectorViewportChange, true)
      window.addEventListener('resize', handleInspectorViewportChange)
      return
    }
    document.removeEventListener('pointermove', handleInspectorPointerMove, true)
    document.removeEventListener('click', handleInspectorClick, true)
    document.removeEventListener('scroll', handleInspectorViewportChange, true)
    window.removeEventListener('resize', handleInspectorViewportChange)
    document.documentElement.classList.remove('theme-inspecting')
    if (inspectionFrame !== null) cancelAnimationFrame(inspectionFrame)
    inspectionFrame = null
    clearInspectorHighlight()
  }

  function handleHeaderPointerDown(event: PointerEvent) {
    if ((event.target as HTMLElement).closest('button, input')) return
    const bounds = panel.getBoundingClientRect()
    dragOffset = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    position = { x: bounds.left, y: bounds.top }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function handleHeaderPointerMove(event: PointerEvent) {
    if (!dragOffset) return
    const width = panel.offsetWidth
    position = {
      x: Math.min(Math.max(8, event.clientX - dragOffset.x), window.innerWidth - width - 8),
      y: Math.min(Math.max(8, event.clientY - dragOffset.y), window.innerHeight - 48),
    }
  }

  function endDrag() {
    dragOffset = null
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!open) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (inspecting) {
        inspecting = false
        selectedRole = null
      } else {
        onClose()
      }
    }
  }

  function matching(fields: ColorField[]) {
    const normalized = query.trim().toLowerCase()
    return normalized
      ? fields.filter((field) => field.label.toLowerCase().includes(normalized))
      : fields
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div
    bind:this={panel}
    aria-label={editing ? 'Edit theme' : 'Create theme'}
    class:advanced
    class:minimized
    class="t3-theme-editor-panel"
    role="dialog"
    style={position ? `left:${position.x}px;top:${position.y}px;right:auto;bottom:auto` : ''}
  >
    <div
      class="t3-theme-editor-panel-header"
      role="presentation"
      on:pointercancel={endDrag}
      on:pointerdown={handleHeaderPointerDown}
      on:pointermove={handleHeaderPointerMove}
      on:pointerup={endDrag}
    >
      <div class="t3-theme-editor-panel-heading">
        <strong>{editing ? 'Edit theme' : 'Create theme'}</strong>
        {#if !minimized}
          <span>
            {inspecting
              ? 'Select an element · Esc to cancel'
              : selectedRole
                ? roleLabel(selectedRole)
                : 'Select a color below'}
          </span>
        {/if}
      </div>
      <button aria-pressed={inspecting} class:active={inspecting} class="t3-editor-inspect" type="button" on:click={toggleInspector}>
        <svg aria-hidden="true" viewBox="0 0 16 16"><path d="m3 2 9.5 5-4.2 1.2-1.5 4.2L3 2Z"></path></svg>
        {inspecting ? 'Cancel' : 'Inspect'}
      </button>
      <button aria-label={minimized ? 'Expand theme editor' : 'Minimize theme editor'} class="t3-editor-header-icon" type="button" on:click={() => (minimized = !minimized)}>
        <svg aria-hidden="true" viewBox="0 0 16 16"><path d={minimized ? 'm5 9 3-3 3 3' : 'm5 6 3 3 3-3'}></path></svg>
      </button>
      <button aria-label="Close theme editor" class="t3-editor-header-icon" type="button" on:click={onClose}>
        <svg aria-hidden="true" viewBox="0 0 16 16"><path d="m5 5 6 6M11 5l-6 6"></path></svg>
      </button>
    </div>

    {#if !minimized}
      <div class="t3-theme-editor-panel-body">
        <label class="t3-editor-form-row">
          <strong>Theme name</strong>
          <input disabled={editing} maxlength="48" placeholder="e.g. Aurora" type="text" bind:value={name} />
        </label>

        <div class="t3-editor-form-row">
          <strong>Appearance</strong>
          <div aria-label="Theme appearance" class="t3-editor-appearance" role="group">
            <button aria-pressed={activeAppearance === 'light'} class:active={activeAppearance === 'light'} disabled={!availableAppearances.includes('light')} type="button" on:click={() => setAppearance('light')}>Light</button>
            <button aria-pressed={activeAppearance === 'dark'} class:active={activeAppearance === 'dark'} disabled={!availableAppearances.includes('dark')} type="button" on:click={() => setAppearance('dark')}>Dark</button>
          </div>
        </div>

        <div class="t3-editor-colors-header">
          <div>
            <strong>Colors</strong>
            {#if !advanced}<span>Two colors, rest derived</span>{/if}
          </div>
          <div>
            {#if advanced}<input aria-label="Filter colors" placeholder="Filter colors" type="search" bind:value={query} />{/if}
            <label class="t3-editor-advanced">
              <strong>Advanced</strong>
              <span class="settings-switch">
                <input checked={advanced} role="switch" type="checkbox" on:change={(event) => (advanced = (event.currentTarget as HTMLInputElement).checked)} />
                <span aria-hidden="true" class="settings-switch-ui"></span>
              </span>
            </label>
          </div>
        </div>

        {#if advanced}
          <section class="t3-editor-color-section">
            <h3>Foundation</h3>
            {#each matching(foundationFields) as field}
              <label class:selected={selectedRole === field.role} class="t3-editor-color-row">
                <span>{field.label}</span>
                <input aria-label={`${field.label} color`} type="color" value={draftColors[field.role]} on:input={(event) => updateColor(field.role, (event.currentTarget as HTMLInputElement).value)} />
                <input aria-label={`${field.label} hex value`} class="t3-editor-hex" spellcheck="false" type="text" value={draftColors[field.role]} on:focus={() => (selectedRole = field.role)} on:change={(event) => updateColor(field.role, (event.currentTarget as HTMLInputElement).value)} />
              </label>
            {/each}
          </section>
          <section class="t3-editor-color-section">
            <h3>Brand &amp; content</h3>
            {#each matching(brandFields) as field}
              <label class:selected={selectedRole === field.role} class="t3-editor-color-row">
                <span>{field.label}</span>
                <input aria-label={`${field.label} color`} type="color" value={draftColors[field.role]} on:input={(event) => updateColor(field.role, (event.currentTarget as HTMLInputElement).value)} />
                <input aria-label={`${field.label} hex value`} class="t3-editor-hex" spellcheck="false" type="text" value={draftColors[field.role]} on:focus={() => (selectedRole = field.role)} on:change={(event) => updateColor(field.role, (event.currentTarget as HTMLInputElement).value)} />
              </label>
            {/each}
          </section>
        {:else}
          <div class="t3-editor-simple-colors">
            {#each [{ role: 'background', label: 'Background' }, { role: 'accent', label: 'Accent' }] as field}
              <label class:selected={selectedRole === field.role} class="t3-editor-color-row">
                <span>{field.label}</span>
                <input aria-label={`${field.label} color`} type="color" value={draftColors[field.role as ColorRole]} on:input={(event) => updateColor(field.role as ColorRole, (event.currentTarget as HTMLInputElement).value)} />
                <input aria-label={`${field.label} hex value`} class="t3-editor-hex" spellcheck="false" type="text" value={draftColors[field.role as ColorRole]} on:focus={() => (selectedRole = field.role as ColorRole)} on:change={(event) => updateColor(field.role as ColorRole, (event.currentTarget as HTMLInputElement).value)} />
              </label>
            {/each}
          </div>
        {/if}
      </div>

      <footer class="t3-theme-editor-panel-footer">
        <button class="t3-editor-cancel" type="button" on:click={onClose}>Cancel</button>
        <button class="primary t3-editor-create" disabled={!editing && !name.trim()} type="button" on:click={saveTheme}>
          <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 2.2a5.8 5.8 0 1 0 0 11.6h.9a1.3 1.3 0 0 0 0-2.6H8a1 1 0 0 1 0-2h1.3a4.7 4.7 0 0 0 0-9.4H8Z"></path><circle cx="5" cy="5.5" r=".65"></circle><circle cx="4.3" cy="8.2" r=".65"></circle><circle cx="7" cy="3.9" r=".65"></circle></svg>
          {editing ? 'Save changes' : 'Create theme'}
        </button>
      </footer>
    {/if}
  </div>
{/if}
