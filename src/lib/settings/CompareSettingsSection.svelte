<script lang="ts">
  import DiffSettingsSection from './DiffSettingsSection.svelte'
  import TreeSettingsSection from './TreeSettingsSection.svelte'
  import DiffPreview from './DiffPreview.svelte'
  import TreePreview from './TreePreview.svelte'
  import type { CompareTreeSettings, CompareViewerSettings, ViewMode } from '../types'
  import type { AppearanceSettings } from '../theme'

  type CompareSectionId =
    | 'layout'
    | 'rendering'
    | 'syntax'
    | 'mouse'
    | 'rules'
    | 'structure'
    | 'density'
    | 'search'
    | 'mutations'

  export let viewMode: ViewMode
  export let viewerSettings: CompareViewerSettings
  export let treeSettings: CompareTreeSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark' = 'dark'
  export let onSetViewMode: (viewMode: ViewMode) => void
  export let onSetViewerSettings: (settings: CompareViewerSettings) => void
  export let onSetTreeSettings: (settings: CompareTreeSettings) => void

  interface SectionItem {
    id: CompareSectionId
    label: string
    summary: string
  }

  interface SectionGroup {
    domain: 'diffs' | 'trees'
    label: string
    sections: SectionItem[]
  }

  const navGroups: SectionGroup[] = [
    {
      domain: 'diffs',
      label: 'Diffs',
      sections: [
        { id: 'layout', label: 'Layout & context', summary: 'Structure, wrapping, collapsed regions, and sticky headers.' },
        { id: 'rendering', label: 'Code rendering', summary: 'Inline highlights, gutters, hunk separators, and backgrounds.' },
        { id: 'syntax', label: 'Syntax & limits', summary: 'Highlighter engine, CSS output, and tokenization limits.' },
        { id: 'mouse', label: 'Mouse & selection', summary: 'Hover state, token callbacks, gutter buttons, and ranges.' },
      ],
    },
    {
      domain: 'trees',
      label: 'Trees',
      sections: [
        { id: 'structure', label: 'Tree structure', summary: 'Sorting, icons, initial expansion, and sticky parents.' },
        { id: 'density', label: 'Tree density', summary: 'Preset density, row height, and virtualized windows.' },
        { id: 'search', label: 'Tree search', summary: 'Built-in search, match handling, focus, and initial query.' },
        { id: 'mutations', label: 'Tree mutations', summary: 'Local drag-and-drop and inline rename behavior.' },
      ],
    },
  ]

  let activeSection: CompareSectionId = 'layout'

  $: activeDomain =
    navGroups.find((group) => group.sections.some((section) => section.id === activeSection))?.domain ?? 'diffs'
</script>

<section class="settings-page compare-settings-page">
  <div class="settings-page-heading">
    <h2>Compare</h2>
    <p>Configure the diff viewer and directory tree used by compare sessions.</p>
  </div>

  <div class="compare-settings-layout">
    <nav class="compare-settings-nav" aria-label="Compare settings sections">
      {#each navGroups as group}
        <span class="compare-settings-nav-group">{group.label}</span>
        {#each group.sections as section}
          <button
            aria-current={activeSection === section.id ? 'page' : undefined}
            class:active={activeSection === section.id}
            class="compare-settings-nav-link"
            type="button"
            on:click={() => (activeSection = section.id)}
          >
            {section.label}
          </button>
        {/each}
      {/each}
    </nav>

    <div class="compare-settings-content">
      <div class="compare-settings-body" data-domain={activeDomain}>
        <div class="compare-settings-main">
          {#if activeDomain === 'diffs'}
            <DiffSettingsSection
              {activeSection}
              {viewMode}
              {viewerSettings}
              {onSetViewMode}
              {onSetViewerSettings}
            />
          {:else}
            <TreeSettingsSection {activeSection} {treeSettings} {onSetTreeSettings} />
          {/if}
        </div>

        <div class="compare-settings-preview">
          <div class="compare-settings-preview-header">
            <strong>Live preview</strong>
            <span>
              {activeDomain === 'diffs'
                ? 'Interactive demo on sample files — settings apply instantly.'
                : 'Interactive demo on a sample folder.'}
            </span>
          </div>
          {#if activeDomain === 'diffs'}
            <DiffPreview height={480} {viewerSettings} {viewMode} {appearanceSettings} {resolvedThemeMode} />
          {:else}
            <TreePreview {treeSettings} {appearanceSettings} {resolvedThemeMode} />
          {/if}
        </div>
      </div>
    </div>
  </div>
</section>
