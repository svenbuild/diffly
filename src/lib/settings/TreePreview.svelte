<script lang="ts">
  import PierreDirectoryTree from '../compare/PierreDirectoryTree.svelte'
  import type { CompareTreeSettings, DirectoryEntryResult, EntryStatus } from '../types'
  import type { AppearanceSettings } from '../theme'

  export let treeSettings: CompareTreeSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'

  function entry(relativePath: string, status: EntryStatus): DirectoryEntryResult {
    return {
      relativePath,
      status,
      leftPath: status === 'rightOnly' ? null : `/left/${relativePath}`,
      rightPath: status === 'leftOnly' ? null : `/right/${relativePath}`,
      leftSize: status === 'rightOnly' ? null : 1024,
      rightSize: status === 'leftOnly' ? null : 1280,
    }
  }

  const entries: DirectoryEntryResult[] = [
    entry('src/app.css', 'modified'),
    entry('src/lib/settings/CompareSettingsSection.svelte', 'modified'),
    entry('src/lib/settings/DiffPreview.svelte', 'rightOnly'),
    entry('src/lib/settings/TreePreview.svelte', 'rightOnly'),
    entry('src/lib/compare/PierreDiffViewer.svelte', 'modified'),
    entry('src/lib/legacy/OldDiffView.svelte', 'leftOnly'),
    entry('src/styles/workspace.css', 'modified'),
    entry('src/styles/legacy.css', 'leftOnly'),
    entry('docs/getting-started.md', 'rightOnly'),
    entry('docs/changelog.md', 'modified'),
    entry('README.md', 'modified'),
    entry('package.json', 'modified'),
  ]

  let selectedRelativePath = 'src/app.css'

  async function selectEntry(selected: DirectoryEntryResult) {
    selectedRelativePath = selected.relativePath
  }

  // Remount the tree on any settings change. Pierre's in-place rebuild path is
  // only exercised off-screen in the real app; remounting guarantees a clean
  // render here (the initial mount always works).
  $: treeKey = `${resolvedThemeMode}:${JSON.stringify(treeSettings)}`
</script>

<div class="settings-preview-host settings-preview-host-tree">
  {#key treeKey}
    <PierreDirectoryTree
      directoryEntries={entries}
      entriesRevision={1}
      {selectedRelativePath}
      {treeSettings}
      {appearanceSettings}
      {resolvedThemeMode}
      {selectEntry}
    />
  {/key}
</div>
