import type {
  CompareTreeSettings,
  CompareViewerSettings,
  PersistedSession,
} from '../types'

export function createDefaultViewerSettings(): CompareViewerSettings {
  return {
    diffStyle: 'split',
    codeOverflow: 'scroll',
    diffIndicators: 'bars',
    // Default to no intra-line (word/char) diff highlighting. Word-level diffing
    // wraps every changed segment in extra spans; on files with many changed
    // lines that multiplies the DOM and makes scrolling stutter on machines
    // without GPU compositing. The reference app T3 Code uses 'none' for the
    // same @pierre/diffs renderer and scrolls smoothly. Users can re-enable
    // word/char highlighting in Diff settings.
    lineDiffType: 'none',
    hunkSeparators: 'line-info',
    expandUnchanged: false,
    collapsedContextThreshold: 3,
    expansionLineCount: 100,
    disableLineNumbers: false,
    disableFileHeader: false,
    disableBackground: false,
    disableVirtualizationBuffers: false,
    stickyHeader: false,
    syntaxMode: 'shiki',
    preferredHighlighter: 'shiki-js',
    useCSSClasses: false,
    tokenizeMaxLineLength: 1000,
    tokenizeMaxLength: 100000,
    maxLineDiffLength: 1000,
    lineHoverHighlight: 'disabled',
    enableTokenInteractionsOnWhitespace: false,
    enableGutterUtility: false,
    enableLineSelection: false,
    controlledSelection: false,
    tokenHover: false,
  }
}

export function createDefaultTreeSettings(): CompareTreeSettings {
  return {
    density: 'compact',
    customDensity: 1,
    flattenEmptyDirectories: true,
    stickyFolders: true,
    initialExpansion: 'open',
    initialExpansionDepth: 2,
    initialExpandedPaths: [],
    sortMode: 'path',
    searchMode: 'expand-matches',
    search: true,
    searchFakeFocus: false,
    searchBlurBehavior: 'close',
    initialSearchQuery: '',
    initialVisibleRowCount: 18,
    itemHeight: 22,
    overscan: 8,
    dragAndDrop: false,
    renaming: false,
    iconSet: 'complete',
    coloredIcons: true,
  }
}

export function normalizeViewerSettings(
  settings: CompareViewerSettings | null | undefined,
  current: CompareViewerSettings,
  legacy?: PersistedSession | null,
): CompareViewerSettings {
  const legacyDiffStyle = legacy?.viewMode === 'unified' ? 'unified' : 'split'
  const legacyOverflow = legacy?.wrapSideBySideLines ? 'wrap' : 'scroll'
  const legacyLineDiffType = legacy?.showInlineHighlights === true ? 'word-alt' : 'none'
  const legacySyntaxMode = legacy?.showSyntaxHighlighting === false ? 'plain' : 'shiki'

  return {
    diffStyle: settings?.diffStyle ?? legacyDiffStyle,
    codeOverflow: settings?.codeOverflow ?? legacyOverflow,
    diffIndicators: settings?.diffIndicators ?? 'bars',
    lineDiffType: settings?.lineDiffType ?? legacyLineDiffType,
    hunkSeparators: settings?.hunkSeparators ?? 'line-info',
    expandUnchanged: settings?.expandUnchanged ?? Boolean(legacy?.showFullFile),
    collapsedContextThreshold: clampNumber(
      settings?.collapsedContextThreshold ?? legacy?.contextLines,
      0,
      500,
      current.collapsedContextThreshold,
    ),
    expansionLineCount: clampNumber(settings?.expansionLineCount, 1, 5000, current.expansionLineCount),
    disableLineNumbers: settings?.disableLineNumbers ?? false,
    disableFileHeader: settings?.disableFileHeader ?? false,
    disableBackground: settings?.disableBackground ?? false,
    disableVirtualizationBuffers: settings?.disableVirtualizationBuffers ?? false,
    stickyHeader: settings?.stickyHeader ?? false,
    syntaxMode: settings?.syntaxMode ?? legacySyntaxMode,
    preferredHighlighter: isPreferredHighlighter(settings?.preferredHighlighter)
      ? settings.preferredHighlighter
      : current.preferredHighlighter,
    useCSSClasses: settings?.useCSSClasses ?? false,
    tokenizeMaxLineLength: clampNumber(settings?.tokenizeMaxLineLength, 0, 20000, current.tokenizeMaxLineLength),
    tokenizeMaxLength: clampNumber(settings?.tokenizeMaxLength, 0, 1000000, current.tokenizeMaxLength),
    maxLineDiffLength: clampNumber(settings?.maxLineDiffLength, 0, 20000, current.maxLineDiffLength),
    lineHoverHighlight: isLineHoverHighlight(settings?.lineHoverHighlight)
      ? settings.lineHoverHighlight
      : current.lineHoverHighlight,
    enableTokenInteractionsOnWhitespace: settings?.enableTokenInteractionsOnWhitespace ?? false,
    enableGutterUtility: settings?.enableGutterUtility ?? false,
    enableLineSelection: settings?.enableLineSelection ?? false,
    controlledSelection: settings?.controlledSelection ?? false,
    tokenHover: settings?.tokenHover ?? false,
  }
}

export function normalizeTreeSettings(
  settings: CompareTreeSettings | null | undefined,
  current: CompareTreeSettings,
): CompareTreeSettings {
  return {
    density: isTreeDensity(settings?.density) ? settings.density : current.density,
    customDensity: clampNumber(settings?.customDensity, 0.5, 2, current.customDensity),
    flattenEmptyDirectories: settings?.flattenEmptyDirectories ?? true,
    stickyFolders: settings?.stickyFolders ?? true,
    initialExpansion: isTreeInitialExpansion(settings?.initialExpansion)
      ? settings.initialExpansion
      : current.initialExpansion,
    initialExpansionDepth: clampNumber(settings?.initialExpansionDepth, 0, 12, current.initialExpansionDepth),
    initialExpandedPaths: Array.isArray(settings?.initialExpandedPaths)
      ? settings.initialExpandedPaths
          .filter((path) => typeof path === 'string' && path.trim())
          .map((path) => path.trim())
      : current.initialExpandedPaths,
    sortMode: settings?.sortMode === 'default' ? 'default' : 'path',
    searchMode: isTreeSearchMode(settings?.searchMode) ? settings.searchMode : current.searchMode,
    search: settings?.search ?? true,
    searchFakeFocus: settings?.searchFakeFocus ?? false,
    searchBlurBehavior: settings?.searchBlurBehavior === 'retain' ? 'retain' : 'close',
    initialSearchQuery: typeof settings?.initialSearchQuery === 'string' ? settings.initialSearchQuery : '',
    initialVisibleRowCount: clampNumber(settings?.initialVisibleRowCount, 1, 200, current.initialVisibleRowCount),
    itemHeight: clampNumber(settings?.itemHeight, 18, 60, current.itemHeight),
    overscan: clampNumber(settings?.overscan, 0, 200, current.overscan),
    dragAndDrop: settings?.dragAndDrop ?? false,
    renaming: settings?.renaming ?? false,
    iconSet: isTreeIconSet(settings?.iconSet) ? settings.iconSet : current.iconSet,
    coloredIcons: settings?.coloredIcons ?? current.coloredIcons,
  }
}

function clampNumber(value: number | null | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.round(value)))
}

function isPreferredHighlighter(value: string | null | undefined): value is CompareViewerSettings['preferredHighlighter'] {
  return value === 'shiki-js' || value === 'shiki-wasm'
}

function isLineHoverHighlight(value: string | null | undefined): value is CompareViewerSettings['lineHoverHighlight'] {
  return value === 'disabled' || value === 'both' || value === 'number' || value === 'line'
}

function isTreeDensity(value: string | null | undefined): value is CompareTreeSettings['density'] {
  return value === 'compact' || value === 'default' || value === 'relaxed' || value === 'custom'
}

function isTreeInitialExpansion(value: string | null | undefined): value is CompareTreeSettings['initialExpansion'] {
  return value === 'closed' || value === 'open' || value === 'depth'
}

function isTreeSearchMode(value: string | null | undefined): value is CompareTreeSettings['searchMode'] {
  return value === 'expand-matches' || value === 'collapse-non-matches' || value === 'hide-non-matches'
}

function isTreeIconSet(value: string | null | undefined): value is CompareTreeSettings['iconSet'] {
  return value === 'minimal' || value === 'standard' || value === 'complete' || value === 'none'
}
