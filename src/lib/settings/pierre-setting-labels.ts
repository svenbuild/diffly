// Central label metadata for settings backed by Pierre `@pierre/diffs` and
// `@pierre/trees` options. Labels are short, readable UI names; descriptions
// explain the behavior. Internal persistence keys are unchanged and unrelated
// to these labels.

export interface PierreSettingLabel {
  label: string
  description: string
}

export const PIERRE_SETTING_LABELS = {
  // @pierre/diffs — layout & context
  diffStyle: {
    label: 'View layout',
    description: 'Show changes in split columns or one unified column.',
  },
  overflow: {
    label: 'Line wrapping',
    description: 'Wrap long code lines instead of scrolling sideways.',
  },
  expandUnchanged: {
    label: 'Show unchanged lines',
    description: 'Open diffs with unchanged sections already expanded.',
  },
  collapsedContextThreshold: {
    label: 'Fold threshold',
    description: 'Minimum unchanged lines before a section can collapse.',
  },
  expansionLineCount: {
    label: 'Expand amount',
    description: 'Number of lines to reveal when opening a collapsed section.',
  },
  stickyHeader: {
    label: 'Sticky file header',
    description: 'Keep the file header visible while scrolling a diff.',
  },

  // @pierre/diffs — code rendering
  lineDiffType: {
    label: 'Inline changes',
    description: 'Choose how detailed inline highlights should be.',
  },
  diffIndicators: {
    label: 'Change markers',
    description: 'Choose bars, +/- markers, or no change markers.',
  },
  hunkSeparators: {
    label: 'Section separators',
    description: 'Choose how changed sections are separated.',
  },
  disableLineNumbers: {
    label: 'Line numbers',
    description: 'Show line numbers in the diff gutter.',
  },
  disableFileHeader: {
    label: 'File header',
    description: "Show Pierre's default file header.",
  },
  disableBackground: {
    label: 'Change background',
    description: 'Highlight added and deleted lines with background colors.',
  },

  // @pierre/diffs — syntax & limits
  useTokenTransformer: {
    label: 'Syntax highlighting',
    description: 'Use Shiki highlighting for supported languages.',
  },
  preferredHighlighter: {
    label: 'Highlighter engine',
    description: 'Choose the Shiki JavaScript or WASM engine.',
  },
  useCSSClasses: {
    label: 'Token CSS classes',
    description: 'Use class-based token styling from Pierre.',
  },
  tokenizeMaxLineLength: {
    label: 'Line highlight limit',
    description: 'Skip syntax highlighting for lines longer than this.',
  },
  tokenizeMaxLength: {
    label: 'File highlight limit',
    description: 'Skip syntax highlighting after this total content length.',
  },
  maxLineDiffLength: {
    label: 'Inline diff limit',
    description: 'Skip inline comparison when paired lines exceed this length.',
  },

  // @pierre/diffs — mouse & selection
  lineHoverHighlight: {
    label: 'Hover highlight',
    description: 'Choose what highlights when pointing at a diff row.',
  },
  enableTokenInteractionsOnWhitespace: {
    label: 'Whitespace tokens',
    description: 'Include whitespace when handling token interactions.',
  },
  tokenHover: {
    label: 'Token hover',
    description: 'Show an info tooltip when hovering known syntax tokens.',
  },
  enableGutterUtility: {
    label: 'Gutter actions',
    description: 'Show the gutter action button for line ranges.',
  },
  enableLineSelection: {
    label: 'Line selection',
    description: 'Allow selecting line ranges inside the diff.',
  },
  controlledSelection: {
    label: 'Saved selection',
    description: 'Keep selected ranges in Diffly state.',
  },
  disableVirtualizationBuffers: {
    label: 'Render buffers',
    description: "Use Pierre's extra buffer rows around the visible area.",
  },

  // @pierre/trees — structure
  iconSet: {
    label: 'Icon style',
    description: 'Choose the file icon set used in the tree.',
  },
  coloredIcons: {
    label: 'Colored icons',
    description: 'Use file-type colors with the complete icon set.',
  },
  initialExpansion: {
    label: 'Start expanded',
    description: 'Choose how much of the tree opens initially.',
  },
  flattenEmptyDirectories: {
    label: 'Flat folders',
    description: 'Collapse folder chains that contain no branching.',
  },
  stickyFolders: {
    label: 'Sticky folders',
    description: 'Keep parent folders visible while scrolling.',
  },
  // Diffly extension (not a Pierre option): local directory compare only.
  showUnmodified: {
    label: 'Unchanged files',
    description: 'Show unchanged files in the tree.',
  },
  initialExpandedPaths: {
    label: 'Expanded paths',
    description: 'Paths to open automatically when the tree loads.',
  },

  // @pierre/trees — density
  density: {
    label: 'Row density',
    description: 'Choose a preset row density or a custom scale.',
  },
  itemHeight: {
    label: 'Row height',
    description: 'Set the tree row height in pixels.',
  },
  initialVisibleRowCount: {
    label: 'Initial rows',
    description: 'Rows used to estimate the first tree viewport.',
  },
  overscan: {
    label: 'Extra rows',
    description: 'Rows rendered outside the visible tree window.',
  },

  // @pierre/trees — search
  search: {
    label: 'Tree search',
    description: "Show Pierre's built-in tree search.",
  },
  fileTreeSearchMode: {
    label: 'Search behavior',
    description: 'Choose how non-matching rows behave during search.',
  },
  searchBlurBehavior: {
    label: 'Search on blur',
    description: 'Choose whether search closes or stays active when focus leaves.',
  },
  searchFakeFocus: {
    label: 'Search focus style',
    description: "Use Pierre's visual focus state for search.",
  },
  initialSearchQuery: {
    label: 'Start search',
    description: 'Search text applied when the tree loads.',
  },

  // @pierre/trees — mutations
  dragAndDrop: {
    label: 'Drag and drop',
    description: 'Allow local drag-and-drop inside the tree.',
  },
  renaming: {
    label: 'Inline rename',
    description: 'Allow local inline renaming inside the tree.',
  },
} as const satisfies Record<string, PierreSettingLabel>

export type PierreSettingKey = keyof typeof PIERRE_SETTING_LABELS
