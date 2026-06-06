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
  export let height = 380
  export let bare = false

  const leftText = `import { palette } from "./palette";
import { clamp } from "./math";

// NOTE: keep these tokens in sync with the design-system package and the Figma export pipeline before shipping a release.
const SPACING = 8;

export function createButton(label) {
  const node = document.createElement("button");
  node.className = "btn";
  node.textContent = label;
  node.style.color = palette.text;
  node.style.background = palette.surface;
  node.style.padding = SPACING + "px";
  return node;
}

export function layout(items) {
  let offset = 0;
  for (const item of items) {
    item.x = offset;
    offset += item.width;
  }
  return offset;
}

const save = createButton("Save");
document.body.append(save);
`

  const rightText = `import { palette, withAlpha } from "./palette";
import { clamp } from "./math";

// NOTE: keep these tokens in sync with the design-system package and the Figma export pipeline before shipping a release.
const SPACING = 12;

export function createButton(label, variant = "primary") {
  const node = document.createElement("button");
  node.className = \`btn btn-\${variant}\`;
  node.textContent = label;
  node.style.color = palette.onAccent;
  node.style.background = palette.accent;
  node.style.boxShadow = \`0 1px 3px \${withAlpha(palette.accent, 0.35)}\`;
  node.style.padding = SPACING + "px";
  return node;
}

export function layout(items, gap = SPACING) {
  let offset = 0;
  for (const item of items) {
    item.x = clamp(offset, 0, 9999);
    offset += item.width + gap;
  }
  return offset;
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

<div
  class:settings-preview-host-bare={bare}
  class="settings-preview-host settings-preview-host-diff"
  style={`height: ${height}px`}
>
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
