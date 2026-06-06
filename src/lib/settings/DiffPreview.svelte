<script lang="ts">
  import PierreDiffViewer from '../compare/PierreDiffViewer.svelte'
  import type { CompareViewerSettings, TextDiffPayload, ViewMode } from '../types'
  import type { AppearanceSettings } from '../theme'

  export let viewerSettings: CompareViewerSettings
  export let viewMode: ViewMode
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let leftLabel = 'theme-preview.ts'
  export let rightLabel = 'theme-preview.ts'

  const leftText = `import { palette } from "./palette";

export function createButton(label) {
  const node = document.createElement("button");
  node.className = "btn";
  node.textContent = label;
  node.style.color = palette.text;
  node.style.background = palette.surface;
  return node;
}

const save = createButton("Save");
document.body.append(save);
`

  const rightText = `import { palette, withAlpha } from "./palette";

export function createButton(label, variant = "primary") {
  const node = document.createElement("button");
  node.className = \`btn btn-\${variant}\`;
  node.textContent = label;
  node.style.color = palette.onAccent;
  node.style.background = palette.accent;
  node.style.boxShadow = withAlpha(palette.accent, 0.3);
  return node;
}

const save = createButton("Save changes", "primary");
document.body.append(save);
`

  const text: TextDiffPayload = {
    leftText,
    rightText,
    leftExists: true,
    rightExists: true,
    leftCacheKey: null,
    rightCacheKey: null,
    leftSha256: null,
    rightSha256: null,
    leftLineEnding: 'lf',
    rightLineEnding: 'lf',
    leftHasTrailingNewline: true,
    rightHasTrailingNewline: true,
  }
</script>

<div class="settings-preview-host settings-preview-host-diff">
  <PierreDiffViewer
    {text}
    {leftLabel}
    {rightLabel}
    {viewerSettings}
    {appearanceSettings}
    {resolvedThemeMode}
    {viewMode}
  />
</div>
