// Central label metadata for settings backed by Pierre `@pierre/diffs` and
// `@pierre/trees` options. The visible label is the literal Pierre option
// name; the description explains what the option does. Internal persistence
// keys are unchanged and unrelated to these labels.

export interface PierreSettingLabel {
  label: string
  description: string
}

export const PIERRE_SETTING_LABELS = {
  // @pierre/diffs — layout & context
  diffStyle: {
    label: 'diffStyle',
    description: 'Render the diff side by side (split) or as one unified column.',
  },
  overflow: {
    label: 'overflow',
    description: 'Wrap long code lines instead of using horizontal scrolling.',
  },
  expandUnchanged: {
    label: 'expandUnchanged',
    description: 'Open diffs with unchanged regions expanded.',
  },
  collapsedContextThreshold: {
    label: 'collapsedContextThreshold',
    description: 'Minimum unchanged lines before a region can collapse.',
  },
  expansionLineCount: {
    label: 'expansionLineCount',
    description: 'How many lines Pierre expands when opening collapsed regions.',
  },
  stickyHeader: {
    label: 'stickyHeader',
    description: 'Keep the file header pinned while scrolling inside the diff.',
  },

  // @pierre/diffs — code rendering
  lineDiffType: {
    label: 'lineDiffType',
    description: 'Inline highlight granularity: word, character, or none.',
  },
  diffIndicators: {
    label: 'diffIndicators',
    description: 'Change bars, classic +/- prefixes, or no indicators.',
  },
  hunkSeparators: {
    label: 'hunkSeparators',
    description: 'Separator style between changed regions.',
  },
  disableLineNumbers: {
    label: 'disableLineNumbers',
    description: 'Hide the gutter line number text. Switch on shows numbers.',
  },
  disableFileHeader: {
    label: 'disableFileHeader',
    description: "Hide Pierre's default file header. Switch on shows the header.",
  },
  disableBackground: {
    label: 'disableBackground',
    description: 'Hide added and deleted line backgrounds. Switch on shows them.',
  },

  // @pierre/diffs — syntax & limits
  useTokenTransformer: {
    label: 'useTokenTransformer',
    description: 'Use Shiki syntax highlighting for supported languages.',
  },
  preferredHighlighter: {
    label: 'preferredHighlighter',
    description: 'Select the Shiki JavaScript or WASM engine.',
  },
  useCSSClasses: {
    label: 'useCSSClasses',
    description: "Use Pierre's class-based token style output.",
  },
  tokenizeMaxLineLength: {
    label: 'tokenizeMaxLineLength',
    description: 'Skip syntax tokens for lines beyond this length.',
  },
  tokenizeMaxLength: {
    label: 'tokenizeMaxLength',
    description: 'Skip syntax tokens after this total content length.',
  },
  maxLineDiffLength: {
    label: 'maxLineDiffLength',
    description: 'Skip inline diffing when paired lines exceed this length.',
  },

  // @pierre/diffs — mouse & selection
  lineHoverHighlight: {
    label: 'lineHoverHighlight',
    description: 'Which part of a row highlights on pointer hover.',
  },
  enableTokenInteractionsOnWhitespace: {
    label: 'enableTokenInteractionsOnWhitespace',
    description: 'Include whitespace tokens in Pierre token callbacks.',
  },
  tokenHover: {
    label: 'tokenHover',
    description: 'Show an info tooltip when hovering known syntax tokens.',
  },
  enableGutterUtility: {
    label: 'enableGutterUtility',
    description: "Show Pierre's gutter utility button and report clicked ranges.",
  },
  enableLineSelection: {
    label: 'enableLineSelection',
    description: 'Allow selecting ranges inside the rendered diff.',
  },
  controlledSelection: {
    label: 'controlledSelection',
    description: 'Keep selected ranges in Diffly state and write them back to Pierre.',
  },
  disableVirtualizationBuffers: {
    label: 'disableVirtualizationBuffers',
    description: 'Force Pierre to render without buffer rows.',
  },

  // @pierre/trees — structure
  iconSet: {
    label: 'iconSet',
    description: 'Built-in icon set. "Complete" is the full colored file-type suite.',
  },
  coloredIcons: {
    label: 'coloredIcons',
    description: 'Use per-file-type colors for the "Complete" icon set.',
  },
  initialExpansion: {
    label: 'initialExpansion',
    description: 'Whether the tree starts closed, open, or expanded by depth.',
  },
  flattenEmptyDirectories: {
    label: 'flattenEmptyDirectories',
    description: 'Compress folder chains with no branching.',
  },
  stickyFolders: {
    label: 'stickyFolders',
    description: 'Keep parent folders visible while scrolling.',
  },
  // Diffly extension (not a Pierre option): local directory compare only.
  showUnmodified: {
    label: 'showUnmodified',
    description: 'Also show unchanged files in the tree, dimmed and without a status badge.',
  },
  initialExpandedPaths: {
    label: 'initialExpandedPaths',
    description: 'Optional newline-separated paths that Pierre should expand on mount.',
  },

  // @pierre/trees — density
  density: {
    label: 'density',
    description: "Pierre's preset row density or a custom scale factor.",
  },
  itemHeight: {
    label: 'itemHeight',
    description: 'Explicit row height in pixels.',
  },
  initialVisibleRowCount: {
    label: 'initialVisibleRowCount',
    description: 'Rows used for initial tree viewport estimation.',
  },
  overscan: {
    label: 'overscan',
    description: 'Extra rows rendered outside the visible tree window.',
  },

  // @pierre/trees — search
  search: {
    label: 'search',
    description: "Enable Pierre's built-in search input in the tree.",
  },
  fileTreeSearchMode: {
    label: 'fileTreeSearchMode',
    description: 'How non-matching tree rows behave during search.',
  },
  searchBlurBehavior: {
    label: 'searchBlurBehavior',
    description: 'Close or retain the search session when it loses focus.',
  },
  searchFakeFocus: {
    label: 'searchFakeFocus',
    description: "Use Pierre's visual fake-focus state for search.",
  },
  initialSearchQuery: {
    label: 'initialSearchQuery',
    description: 'Optional query applied when the tree mounts.',
  },

  // @pierre/trees — mutations
  dragAndDrop: {
    label: 'dragAndDrop',
    description: "Allow Pierre's local drag and drop behavior in the tree.",
  },
  renaming: {
    label: 'renaming',
    description: "Allow Pierre's local inline rename behavior in the tree.",
  },
} as const satisfies Record<string, PierreSettingLabel>

export type PierreSettingKey = keyof typeof PIERRE_SETTING_LABELS
