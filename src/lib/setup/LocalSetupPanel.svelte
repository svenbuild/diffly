<script lang="ts">
  import PickerPane from '../PickerPane.svelte'
  import type { ExplorerEntry } from '../types'
  import type { ExplorerPaneState, Side } from '../ui-types'

  export let pickerSides: Array<{ side: Side; pane: ExplorerPaneState }> = []
  export let pickerLoading = false
  export let canGoBack: (pane: ExplorerPaneState) => boolean
  export let canGoForward: (pane: ExplorerPaneState) => boolean
  export let currentDrive: (pane: ExplorerPaneState) => string
  export let formatModified: (modifiedMs: number | null) => string
  export let formatSize: (size: number | null) => string
  export let entryTypeLabel: (entry: ExplorerEntry) => string
  export let changeDrive: (side: Side, path: string) => Promise<void>
  export let navigateHistory: (side: Side, direction: -1 | 1) => Promise<void>
  export let navigateTo: (side: Side, path: string) => Promise<void>
  export let updatePathInput: (side: Side, value: string) => void
  export let submitPathInput: (side: Side) => Promise<void>
  export let browseSystem: (side: Side, kind?: 'file' | 'directory') => Promise<void>
  export let useCurrentFolder: (side: Side) => void
  export let isCurrentFolderSelected: (pane: ExplorerPaneState) => boolean
  export let selectListEntry: (side: Side, entry: ExplorerEntry, event?: MouseEvent) => void
  export let activateListEntry: (side: Side, entry: ExplorerEntry) => Promise<void>
  export let isTargetSelected: (pane: ExplorerPaneState, entry: ExplorerEntry) => boolean
</script>

<section class="setup-launcher" aria-label="Compare setup">
  <section class="picker-workspace">
    {#each pickerSides as item}
      <PickerPane
        side={item.side}
        pane={item.pane}
        {pickerLoading}
        {canGoBack}
        {canGoForward}
        {currentDrive}
        {formatModified}
        {formatSize}
        {entryTypeLabel}
        {changeDrive}
        {navigateHistory}
        {navigateTo}
        {updatePathInput}
        {submitPathInput}
        {browseSystem}
        setCurrentFolderAsTarget={useCurrentFolder}
        {isCurrentFolderSelected}
        {selectListEntry}
        {activateListEntry}
        {isTargetSelected}
      />
    {/each}
  </section>
</section>
