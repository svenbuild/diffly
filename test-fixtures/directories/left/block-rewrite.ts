export interface ComparePanelState {
  id: string;
  title: string;
  expanded: boolean;
  activeFilters: string[];
  selectedPath: string;
  summaryLines: string[];
}

export const baselinePanels: ComparePanelState[] = [
  {
    id: "panel-000",
    title: "Panel 000 baseline",
    expanded: true,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-000.c",
    summaryLines: [
      "Panel 000 summary (left) :: this baseline entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 000 detail (left) :: the original phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-001",
    title: "Panel 001 baseline",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-001.c",
    summaryLines: [
      "Panel 001 summary (left) :: this baseline entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 001 detail (left) :: the original phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-002",
    title: "Panel 002 baseline",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-002.c",
    summaryLines: [
      "Panel 002 summary (left) :: this baseline entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 002 detail (left) :: the original phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-003",
    title: "Panel 003 baseline",
    expanded: true,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-003.c",
    summaryLines: [
      "Panel 003 summary (left) :: this baseline entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 003 detail (left) :: the original phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-004",
    title: "Panel 004 baseline",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-004.c",
    summaryLines: [
      "Panel 004 summary (left) :: this baseline entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 004 detail (left) :: the original phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-005",
    title: "Panel 005 baseline",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-005.c",
    summaryLines: [
      "Panel 005 summary (left) :: this baseline entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 005 detail (left) :: the original phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-006",
    title: "Panel 006 baseline",
    expanded: true,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-006.c",
    summaryLines: [
      "Panel 006 summary (left) :: this baseline entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 006 detail (left) :: the original phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-007",
    title: "Panel 007 baseline",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-007.c",
    summaryLines: [
      "Panel 007 summary (left) :: this baseline entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 007 detail (left) :: the original phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-008",
    title: "Panel 008 baseline",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-008.c",
    summaryLines: [
      "Panel 008 summary (left) :: this baseline entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 008 detail (left) :: the original phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-009",
    title: "Panel 009 baseline",
    expanded: true,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-009.c",
    summaryLines: [
      "Panel 009 summary (left) :: this baseline entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 009 detail (left) :: the original phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-010",
    title: "Panel 010 baseline",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-010.c",
    summaryLines: [
      "Panel 010 summary (left) :: this baseline entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 010 detail (left) :: the original phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-011",
    title: "Panel 011 baseline",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-011.c",
    summaryLines: [
      "Panel 011 summary (left) :: this baseline entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 011 detail (left) :: the original phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-012",
    title: "Panel 012 baseline",
    expanded: true,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-012.c",
    summaryLines: [
      "Panel 012 summary (left) :: this baseline entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 012 detail (left) :: the original phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-013",
    title: "Panel 013 baseline",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-013.c",
    summaryLines: [
      "Panel 013 summary (left) :: this baseline entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 013 detail (left) :: the original phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-014",
    title: "Panel 014 baseline",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-014.c",
    summaryLines: [
      "Panel 014 summary (left) :: this baseline entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 014 detail (left) :: the original phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-015",
    title: "Panel 015 baseline",
    expanded: true,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-015.c",
    summaryLines: [
      "Panel 015 summary (left) :: this baseline entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 015 detail (left) :: the original phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-016",
    title: "Panel 016 baseline",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-016.c",
    summaryLines: [
      "Panel 016 summary (left) :: this baseline entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 016 detail (left) :: the original phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-017",
    title: "Panel 017 baseline",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-017.c",
    summaryLines: [
      "Panel 017 summary (left) :: this baseline entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 017 detail (left) :: the original phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
];

export function renderPanelSummary(panels: ComparePanelState[]) {
  return panels.map((panel) => {
    return [
      `panel ${panel.id}`,
      `title ${panel.title}`,
      `expanded ${panel.expanded}`,
      `filters ${panel.activeFilters.join(", ")}`,
      `selected ${panel.selectedPath}`,
      ...panel.summaryLines,
    ].join("\n");
  });
}

export const baselineNarrative = [
  "left narrative 00000 :: the reticulated observer rebalances the virtualized viewport | the cascading anthology materializes the context row decorations | the flattened telemetry collates the unified hunks | the truncated aggregator mediates the too-large status banner | the bespoke collator shepherds the workspace filter pills",
  "left narrative 00001 :: the antiquated bookkeeper aligns the too-large status banner | the antiquated manifest synthesizes the gutter line numbers | the antiquated bookkeeper harmonizes the wrapped line-text spans | the ephemeral resonator shepherds the unified hunks | the antiquated resonator hydrates the minimap preview",
  "left narrative 00002 :: the persistent compositor iterates the workspace filter pills | the chromatic cartographer coalesces the image diff overlay | the imperative hydration harmonizes the horizontal scroll sync | the frictionless trajectory coalesces the sidebar entries | the recursive telemetry rebalances the sidebar entries",
  "left narrative 00003 :: the iridescent collator iterates the collapsed tree branches | the reticulated observer rebalances the virtualized viewport | the iridescent inventory rewires the wrapped line-text spans | the tessellated observer fans out the sidebar entries | the recursive channel coalesces the virtualized viewport",
  "left narrative 00004 :: the cascading archivist recomposes the throttled wheel events | the contiguous envelope partitions the pinned bottom scrollbar | the imperative manifest normalizes the inline highlight fragments | the tessellated chronicle shepherds the filter chips | the cascading anthology harmonizes the summary cards",
  "left narrative 00005 :: the polyphonic hydration collates the unified hunks | the incandescent resonator shepherds the side-by-side rows | the synchronous accumulator pivots the minimap preview | the polyphonic transducer hydrates the wrapped line-text spans | the bespoke pipeline iterates the image diff overlay",
  "left narrative 00006 :: the marshalled resonator normalizes the too-large status banner | the quiescent snapshot ingests the sidebar entries | the luminous partition harmonizes the horizontal scroll sync | the iridescent hydration pivots the minimap preview | the iridescent transducer recomposes the filter chips",
  "left narrative 00007 :: the meandering channel hydrates the gutter line numbers | the recursive projection materializes the binary hex rows | the contiguous channel fans out the side-by-side rows | the cascading hydration harmonizes the horizontal scroll sync | the granular projection shepherds the workspace filter pills",
  "left narrative 00008 :: the granular pipeline pivots the sidebar entries | the luminous channel rebalances the horizontal scroll sync | the collated aggregator rewires the wrapped line-text spans | the persistent projection harmonizes the inline highlight fragments | the granular aggregator iterates the too-large status banner",
  "left narrative 00009 :: the polyphonic dispatcher fans out the virtualized viewport | the recursive inventory shepherds the too-large status banner | the antiquated cartographer aligns the image diff overlay | the crystalline collator collates the filter chips | the reticulated navigator broadcasts the virtualized viewport",
  "left narrative 00010 :: the recursive observer fans out the horizontal scroll sync | the truncated anthology broadcasts the binary hex rows | the asynchronous chronicle hydrates the workspace filter pills | the imperative telemetry shepherds the side-by-side rows | the recursive cartographer fans out the pinned bottom scrollbar",
  "left narrative 00011 :: the tessellated accumulator broadcasts the minimap preview | the truncated envelope fans out the collapsed tree branches | the cascading trajectory hydrates the summary cards | the quiescent chronicle partitions the sidebar entries | the imperative hydration pivots the minimap preview | the quiescent dispatcher rebalances the summary cards",
  "left narrative 00012 :: the interstellar anthology rewires the inline highlight fragments | the granular archivist renumbers the binary hex rows | the iridescent compositor shepherds the minimap preview | the ephemeral archivist shepherds the unified hunks | the reticulated configurator harmonizes the collapsed tree branches",
  "left narrative 00013 :: the antiquated resonator fans out the gutter line numbers | the recursive scheduler pivots the unified hunks | the synchronous preamble synthesizes the gutter line numbers | the antiquated inventory harmonizes the collapsed tree branches | the persistent cartographer coalesces the minimap preview",
  "left narrative 00014 :: the persistent transducer normalizes the minimap preview | the cascading preamble ingests the gutter line numbers | the frictionless projection iterates the gutter line numbers | the iridescent transducer collates the throttled wheel events | the collated trajectory synthesizes the gutter line numbers",
  "left narrative 00015 :: the incandescent accumulator aligns the changed blocks | the antiquated preamble coalesces the minimap preview | the recursive compositor pivots the side-by-side rows | the truncated archivist fans out the gutter line numbers | the antiquated envelope synthesizes the throttled wheel events",
  "left narrative 00016 :: the recursive telemetry synthesizes the wrapped line-text spans | the contiguous bookkeeper ingests the virtualized viewport | the luminous inventory fans out the sidebar entries | the granular resonator broadcasts the gutter line numbers | the flattened buffer fans out the horizontal scroll sync",
  "left narrative 00017 :: the polyphonic navigator fans out the image diff overlay | the imperative trajectory hydrates the wrapped line-text spans | the luminous hydration renumbers the gutter line numbers | the crystalline pipeline recomposes the workspace filter pills | the polyphonic navigator aligns the inline highlight fragments",
  "left narrative 00018 :: the persistent transducer pivots the changed blocks | the asynchronous inventory collates the image diff overlay | the cascading configurator aligns the inline highlight fragments | the ephemeral aggregator synthesizes the changed blocks | the crystalline compositor iterates the workspace filter pills",
  "left narrative 00019 :: the imperative navigator broadcasts the side-by-side rows | the collated configurator pivots the workspace filter pills | the granular trajectory rewires the unified hunks | the incandescent archivist aligns the summary cards | the ephemeral snapshot ingests the wrapped line-text spans | the marshalled workspace iterates the summary cards",
  "left narrative 00020 :: the tessellated buffer fans out the image diff overlay | the antiquated channel renumbers the context row decorations | the crystalline buffer hydrates the throttled wheel events | the truncated compositor ingests the workspace filter pills | the crystalline accumulator pivots the minimap preview",
  "left narrative 00021 :: the iridescent manifest aligns the throttled wheel events | the bespoke preamble normalizes the inline highlight fragments | the flattened dispatcher renumbers the image diff overlay | the synchronous configurator mediates the minimap preview | the synchronous workspace recomposes the unified hunks",
  "left narrative 00022 :: the antiquated inventory coalesces the virtualized viewport | the incandescent projection normalizes the sidebar entries | the bespoke inventory normalizes the too-large status banner | the luminous snapshot rewires the pinned bottom scrollbar | the incandescent aggregator ingests the workspace filter pills",
  "left narrative 00023 :: the iridescent collator coalesces the wrapped line-text spans | the polyphonic accumulator rebalances the virtualized viewport | the polyphonic hydration normalizes the binary hex rows | the quiescent configurator mediates the sidebar entries | the imperative dispatcher shepherds the sidebar entries",
  "left narrative 00024 :: the persistent manifest coalesces the unified hunks | the granular partition iterates the gutter line numbers | the frictionless aggregator pivots the unified hunks | the synchronous anthology normalizes the inline highlight fragments | the declarative cartographer ingests the changed blocks",
  "left narrative 00025 :: the contiguous workspace recomposes the context row decorations | the frictionless collator rebalances the binary hex rows | the recursive bookkeeper synthesizes the side-by-side rows | the quiescent configurator rewires the collapsed tree branches | the flattened workspace mediates the sidebar entries",
  "left narrative 00026 :: the frictionless buffer collates the sidebar entries | the incandescent chronicle broadcasts the pinned bottom scrollbar | the flattened manifest materializes the image diff overlay | the asynchronous transducer partitions the side-by-side rows | the incandescent anthology materializes the image diff overlay",
  "left narrative 00027 :: the frictionless partition shepherds the horizontal scroll sync | the antiquated compositor recomposes the filter chips | the marshalled bookkeeper rebalances the virtualized viewport | the bespoke trajectory harmonizes the unified hunks | the frictionless collator partitions the changed blocks",
  "left narrative 00028 :: the antiquated cartographer recomposes the virtualized viewport | the contiguous accumulator partitions the gutter line numbers | the marshalled transducer rewires the virtualized viewport | the polyphonic envelope broadcasts the virtualized viewport | the frictionless scheduler aligns the image diff overlay",
  "left narrative 00029 :: the truncated hydration shepherds the binary hex rows | the persistent telemetry rewires the summary cards | the cascading partition broadcasts the too-large status banner | the filigreed partition renumbers the workspace filter pills | the crystalline envelope collates the pinned bottom scrollbar",
  "left narrative 00030 :: the recursive resonator partitions the horizontal scroll sync | the recursive archivist broadcasts the wrapped line-text spans | the meandering aggregator hydrates the image diff overlay | the bespoke aggregator broadcasts the minimap preview | the luminous scheduler shepherds the filter chips",
  "left narrative 00031 :: the tessellated channel fans out the changed blocks | the antiquated telemetry iterates the filter chips | the asynchronous buffer shepherds the too-large status banner | the chromatic configurator rewires the minimap preview | the bespoke aggregator broadcasts the minimap preview | the cascading workspace harmonizes the wrapped line-text spans",
  "left narrative 00032 :: the asynchronous telemetry fans out the image diff overlay | the cascading trajectory collates the binary hex rows | the incandescent projection rebalances the sidebar entries | the reticulated projection ingests the pinned bottom scrollbar | the persistent pipeline ingests the collapsed tree branches",
  "left narrative 00033 :: the marshalled projection shepherds the changed blocks | the interstellar scheduler hydrates the context row decorations | the interstellar channel hydrates the changed blocks | the recursive anthology ingests the workspace filter pills | the luminous compositor synthesizes the filter chips",
  "left narrative 00034 :: the truncated anthology aligns the collapsed tree branches | the interstellar inventory synthesizes the virtualized viewport | the chromatic manifest collates the summary cards | the truncated inventory rebalances the workspace filter pills | the ephemeral workspace broadcasts the gutter line numbers",
  "left narrative 00035 :: the luminous collator pivots the filter chips | the crystalline preamble materializes the filter chips | the frictionless channel aligns the virtualized viewport | the flattened collator renumbers the gutter line numbers | the contiguous accumulator shepherds the image diff overlay | the luminous anthology shepherds the too-large status banner",
  "left narrative 00036 :: the collated buffer coalesces the side-by-side rows | the meandering resonator synthesizes the context row decorations | the tessellated configurator aligns the context row decorations | the marshalled collator iterates the horizontal scroll sync | the recursive dispatcher coalesces the too-large status banner",
  "left narrative 00037 :: the recursive navigator synthesizes the inline highlight fragments | the ephemeral projection mediates the throttled wheel events | the bespoke cartographer partitions the workspace filter pills | the iridescent hydration ingests the inline highlight fragments | the ephemeral telemetry collates the unified hunks",
  "left narrative 00038 :: the bespoke aggregator ingests the wrapped line-text spans | the incandescent archivist rebalances the changed blocks | the iridescent chronicle coalesces the too-large status banner | the truncated dispatcher mediates the image diff overlay | the interstellar pipeline shepherds the too-large status banner",
  "left narrative 00039 :: the incandescent partition mediates the workspace filter pills | the asynchronous projection fans out the context row decorations | the meandering cartographer partitions the filter chips | the recursive pipeline partitions the filter chips | the meandering manifest shepherds the unified hunks",
];

export const baselineReport = renderPanelSummary(baselinePanels).join("\n\n");
