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
    title: "Panel 000 updated",
    expanded: true,
    activeFilters: ["modified", "leftOnly", "rightOnly"],
    selectedPath: "nested/src/module-000.c",
    summaryLines: [
      "Panel 000 summary (right) :: this rewritten entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 000 detail (right) :: the updated phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-001",
    title: "Panel 001 updated",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-001.c",
    summaryLines: [
      "Panel 001 summary (right) :: this rewritten entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 001 detail (right) :: the updated phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-002",
    title: "Panel 002 updated",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-002.c",
    summaryLines: [
      "Panel 002 summary (right) :: this rewritten entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 002 detail (right) :: the updated phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-003",
    title: "Panel 003 updated, rightOnly",
    expanded: true,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-003.c",
    summaryLines: [
      "Panel 003 summary (right) :: this rewritten entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 003 detail (right) :: the updated phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-004",
    title: "Panel 004 updated",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-004.c",
    summaryLines: [
      "Panel 004 summary (right) :: this rewritten entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 004 detail (right) :: the updated phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-005",
    title: "Panel 005 updated",
    expanded: false,
    activeFilters: ["modified", "leftOnly", "rightOnly"],
    selectedPath: "nested/src/module-005.c",
    summaryLines: [
      "Panel 005 summary (right) :: this rewritten entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 005 detail (right) :: the updated phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-006",
    title: "Panel 006 updated",
    expanded: true,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-006.c",
    summaryLines: [
      "Panel 006 summary (right) :: this rewritten entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 006 detail (right) :: the updated phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-007",
    title: "Panel 007 updated",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-007.c",
    summaryLines: [
      "Panel 007 summary (right) :: this rewritten entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 007 detail (right) :: the updated phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-008",
    title: "Panel 008 updated",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-008.c",
    summaryLines: [
      "Panel 008 summary (right) :: this rewritten entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 008 detail (right) :: the updated phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-009",
    title: "Panel 009 updated",
    expanded: true,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-009.c",
    summaryLines: [
      "Panel 009 summary (right) :: this rewritten entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 009 detail (right) :: the updated phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-010",
    title: "Panel 010 updated, rightOnly",
    expanded: false,
    activeFilters: ["modified", "leftOnly", "rightOnly"],
    selectedPath: "nested/src/module-010.c",
    summaryLines: [
      "Panel 010 summary (right) :: this rewritten entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 010 detail (right) :: the updated phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-011",
    title: "Panel 011 updated",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-011.c",
    summaryLines: [
      "Panel 011 summary (right) :: this rewritten entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 011 detail (right) :: the updated phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-012",
    title: "Panel 012 updated",
    expanded: true,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-012.c",
    summaryLines: [
      "Panel 012 summary (right) :: this rewritten entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 012 detail (right) :: the updated phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-013",
    title: "Panel 013 updated",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-013.c",
    summaryLines: [
      "Panel 013 summary (right) :: this rewritten entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 013 detail (right) :: the updated phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-014",
    title: "Panel 014 updated",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-014.c",
    summaryLines: [
      "Panel 014 summary (right) :: this rewritten entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 014 detail (right) :: the updated phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-015",
    title: "Panel 015 updated",
    expanded: true,
    activeFilters: ["modified", "leftOnly", "rightOnly"],
    selectedPath: "nested/src/module-015.c",
    summaryLines: [
      "Panel 015 summary (right) :: this rewritten entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 015 detail (right) :: the updated phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-016",
    title: "Panel 016 updated",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-016.c",
    summaryLines: [
      "Panel 016 summary (right) :: this rewritten entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 016 detail (right) :: the updated phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
    ],
  },
  {
    id: "panel-017",
    title: "Panel 017 updated, rightOnly",
    expanded: false,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module-017.c",
    summaryLines: [
      "Panel 017 summary (right) :: this rewritten entry keeps a very long descriptive sentence so the diff viewer must scroll horizontally when wrap mode is disabled and the content runs past the viewport bounds on both split and unified layouts without clipping any fragment highlights or gutter markers rendered by the virtualized pane.",
      "Panel 017 detail (right) :: the updated phrasing explains how scrollbars, sidebars, minimap previews, inline highlights, collapsed tree branches, pinned bottom scroll rails, workspace filter chips, and summary badges cooperate while the user drags across an extraordinarily wide run of prose rendered in a monospace grid.",
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
  "right narrative 00000 :: the interstellar preamble mediates the minimap preview | the declarative inventory iterates the inline highlight fragments | the flattened snapshot partitions the pinned bottom scrollbar | the antiquated anthology rebalances the throttled wheel events | the collated hydration shepherds the too-large status banner",
  "right narrative 00001 :: the contiguous scheduler fans out the pinned bottom scrollbar | the luminous snapshot hydrates the horizontal scroll sync | the marshalled dispatcher rebalances the inline highlight fragments | the interstellar accumulator normalizes the sidebar entries | the contiguous trajectory rewires the horizontal scroll sync",
  "right narrative 00002 :: the persistent transducer rewires the summary cards | the meandering partition renumbers the minimap preview | the orbital workspace renumbers the gutter line numbers | the bespoke anthology rewires the horizontal scroll sync | the declarative telemetry partitions the summary cards | the antiquated partition coalesces the workspace filter pills",
  "right narrative 00003 :: the ephemeral envelope renumbers the virtualized viewport | the cascading preamble renumbers the throttled wheel events | the interstellar hydration aligns the summary cards | the synchronous accumulator renumbers the throttled wheel events | the meandering transducer recomposes the too-large status banner",
  "right narrative 00004 :: the cascading pipeline iterates the collapsed tree branches | the iridescent bookkeeper shepherds the workspace filter pills | the ephemeral collator pivots the filter chips | the meandering snapshot hydrates the throttled wheel events | the frictionless partition rewires the sidebar entries",
  "right narrative 00005 :: the meandering resonator synthesizes the context row decorations | the chromatic partition iterates the context row decorations | the recursive chronicle renumbers the context row decorations | the granular anthology materializes the unified hunks | the tessellated dispatcher recomposes the collapsed tree branches",
  "right narrative 00006 :: the meandering scheduler aligns the summary cards | the flattened resonator partitions the inline highlight fragments | the recursive configurator iterates the image diff overlay | the chromatic channel collates the sidebar entries | the antiquated chronicle fans out the throttled wheel events",
  "right narrative 00007 :: the flattened transducer pivots the workspace filter pills | the crystalline hydration harmonizes the changed blocks | the antiquated workspace harmonizes the wrapped line-text spans | the interstellar accumulator materializes the too-large status banner | the asynchronous buffer rebalances the workspace filter pills",
  "right narrative 00008 :: the crystalline scheduler recomposes the virtualized viewport | the synchronous partition synthesizes the workspace filter pills | the iridescent preamble fans out the context row decorations | the meandering partition harmonizes the changed blocks | the granular collator aligns the sidebar entries",
  "right narrative 00009 :: the quiescent anthology normalizes the gutter line numbers | the incandescent compositor shepherds the inline highlight fragments | the interstellar pipeline partitions the summary cards | the cascading snapshot rebalances the throttled wheel events | the tessellated workspace iterates the too-large status banner",
  "right narrative 00010 :: the bespoke projection rewires the changed blocks | the antiquated bookkeeper harmonizes the changed blocks | the bespoke manifest harmonizes the context row decorations | the luminous preamble iterates the minimap preview | the contiguous channel recomposes the changed blocks | the synchronous collator renumbers the workspace filter pills",
  "right narrative 00011 :: the truncated anthology coalesces the filter chips | the synchronous resonator shepherds the sidebar entries | the meandering preamble rewires the sidebar entries | the synchronous transducer pivots the gutter line numbers | the contiguous projection iterates the gutter line numbers | the filigreed chronicle shepherds the too-large status banner",
  "right narrative 00012 :: the imperative cartographer harmonizes the wrapped line-text spans | the ephemeral preamble renumbers the collapsed tree branches | the quiescent configurator broadcasts the side-by-side rows | the quiescent projection iterates the minimap preview | the chromatic partition rewires the horizontal scroll sync",
  "right narrative 00013 :: the recursive pipeline partitions the sidebar entries | the crystalline resonator normalizes the workspace filter pills | the iridescent scheduler rewires the too-large status banner | the polyphonic anthology materializes the side-by-side rows | the reticulated telemetry aligns the too-large status banner",
  "right narrative 00014 :: the marshalled anthology pivots the minimap preview | the tessellated pipeline broadcasts the virtualized viewport | the flattened aggregator broadcasts the summary cards | the marshalled hydration rewires the context row decorations | the synchronous cartographer hydrates the binary hex rows",
  "right narrative 00015 :: the chromatic archivist recomposes the sidebar entries | the crystalline channel rebalances the filter chips | the antiquated workspace renumbers the too-large status banner | the persistent archivist collates the wrapped line-text spans | the cascading navigator collates the binary hex rows",
  "right narrative 00016 :: the cascading envelope partitions the too-large status banner | the frictionless workspace harmonizes the throttled wheel events | the crystalline hydration synthesizes the context row decorations | the crystalline snapshot iterates the wrapped line-text spans | the contiguous aggregator recomposes the sidebar entries",
  "right narrative 00017 :: the declarative pipeline shepherds the collapsed tree branches | the persistent workspace harmonizes the sidebar entries | the interstellar trajectory shepherds the binary hex rows | the meandering chronicle pivots the wrapped line-text spans | the tessellated cartographer collates the unified hunks",
  "right narrative 00018 :: the recursive preamble renumbers the changed blocks | the crystalline telemetry recomposes the workspace filter pills | the tessellated buffer hydrates the context row decorations | the orbital navigator ingests the wrapped line-text spans | the polyphonic anthology ingests the context row decorations",
  "right narrative 00019 :: the interstellar collator mediates the minimap preview | the declarative anthology recomposes the binary hex rows | the reticulated buffer renumbers the wrapped line-text spans | the tessellated collator pivots the too-large status banner | the quiescent partition partitions the unified hunks",
  "right narrative 00020 :: the meandering partition pivots the minimap preview | the luminous projection partitions the virtualized viewport | the filigreed projection collates the summary cards | the marshalled snapshot synthesizes the binary hex rows | the collated chronicle materializes the pinned bottom scrollbar",
  "right narrative 00021 :: the incandescent accumulator shepherds the summary cards | the ephemeral buffer pivots the workspace filter pills | the filigreed accumulator shepherds the changed blocks | the frictionless scheduler aligns the pinned bottom scrollbar | the recursive envelope shepherds the workspace filter pills",
  "right narrative 00022 :: the contiguous configurator coalesces the throttled wheel events | the meandering buffer ingests the summary cards | the crystalline envelope materializes the binary hex rows | the luminous accumulator rewires the sidebar entries | the frictionless aggregator rebalances the throttled wheel events",
  "right narrative 00023 :: the quiescent archivist rewires the filter chips | the antiquated envelope rebalances the pinned bottom scrollbar | the iridescent snapshot pivots the inline highlight fragments | the persistent transducer fans out the context row decorations | the marshalled navigator recomposes the minimap preview",
  "right narrative 00024 :: the cascading workspace shepherds the summary cards | the recursive manifest rebalances the side-by-side rows | the imperative collator harmonizes the virtualized viewport | the luminous configurator iterates the context row decorations | the contiguous manifest partitions the side-by-side rows",
  "right narrative 00025 :: the contiguous transducer fans out the summary cards | the filigreed chronicle pivots the pinned bottom scrollbar | the recursive envelope rebalances the sidebar entries | the contiguous anthology iterates the binary hex rows | the declarative envelope rebalances the minimap preview | the granular workspace broadcasts the summary cards",
  "right narrative 00026 :: the marshalled manifest shepherds the too-large status banner | the persistent inventory harmonizes the wrapped line-text spans | the bespoke dispatcher shepherds the side-by-side rows | the antiquated accumulator collates the unified hunks | the reticulated trajectory partitions the wrapped line-text spans",
  "right narrative 00027 :: the iridescent observer hydrates the pinned bottom scrollbar | the crystalline bookkeeper rewires the too-large status banner | the filigreed collator coalesces the summary cards | the luminous compositor mediates the minimap preview | the frictionless configurator rewires the horizontal scroll sync",
  "right narrative 00028 :: the tessellated projection collates the inline highlight fragments | the orbital telemetry pivots the throttled wheel events | the persistent observer aligns the too-large status banner | the granular cartographer rewires the wrapped line-text spans | the persistent configurator rebalances the collapsed tree branches",
  "right narrative 00029 :: the contiguous dispatcher synthesizes the too-large status banner | the crystalline inventory fans out the virtualized viewport | the chromatic pipeline ingests the changed blocks | the flattened chronicle materializes the unified hunks | the tessellated observer iterates the changed blocks",
  "right narrative 00030 :: the interstellar cartographer synthesizes the wrapped line-text spans | the imperative scheduler hydrates the summary cards | the collated channel renumbers the virtualized viewport | the antiquated hydration recomposes the horizontal scroll sync | the ephemeral bookkeeper renumbers the throttled wheel events",
  "right narrative 00031 :: the iridescent collator materializes the throttled wheel events | the contiguous archivist normalizes the inline highlight fragments | the quiescent trajectory harmonizes the wrapped line-text spans | the collated buffer harmonizes the horizontal scroll sync | the synchronous workspace synthesizes the collapsed tree branches",
  "right narrative 00032 :: the synchronous cartographer broadcasts the image diff overlay | the synchronous navigator harmonizes the image diff overlay | the imperative manifest ingests the pinned bottom scrollbar | the polyphonic cartographer shepherds the changed blocks | the ephemeral anthology synthesizes the virtualized viewport",
  "right narrative 00033 :: the imperative preamble fans out the side-by-side rows | the ephemeral chronicle broadcasts the side-by-side rows | the meandering workspace rebalances the binary hex rows | the iridescent channel broadcasts the image diff overlay | the contiguous chronicle broadcasts the collapsed tree branches",
  "right narrative 00034 :: the reticulated transducer materializes the side-by-side rows | the synchronous partition renumbers the minimap preview | the persistent dispatcher partitions the workspace filter pills | the frictionless snapshot collates the minimap preview | the declarative inventory mediates the changed blocks",
  "right narrative 00035 :: the flattened transducer rebalances the image diff overlay | the frictionless partition collates the changed blocks | the contiguous aggregator materializes the binary hex rows | the contiguous snapshot renumbers the horizontal scroll sync | the asynchronous scheduler shepherds the too-large status banner",
  "right narrative 00036 :: the filigreed transducer collates the too-large status banner | the interstellar aggregator renumbers the unified hunks | the filigreed observer normalizes the changed blocks | the incandescent navigator broadcasts the horizontal scroll sync | the chromatic observer synthesizes the minimap preview",
  "right narrative 00037 :: the meandering collator shepherds the virtualized viewport | the granular transducer renumbers the binary hex rows | the tessellated chronicle materializes the pinned bottom scrollbar | the quiescent manifest rewires the horizontal scroll sync | the persistent archivist recomposes the throttled wheel events",
  "right narrative 00038 :: the antiquated scheduler fans out the sidebar entries | the chromatic anthology iterates the filter chips | the meandering archivist normalizes the unified hunks | the recursive workspace normalizes the changed blocks | the interstellar hydration ingests the minimap preview | the contiguous hydration ingests the pinned bottom scrollbar",
  "right narrative 00039 :: the reticulated preamble renumbers the unified hunks | the interstellar navigator rebalances the side-by-side rows | the chromatic partition recomposes the wrapped line-text spans | the recursive transducer hydrates the binary hex rows | the frictionless inventory collates the workspace filter pills",
];

export const baselineReport = renderPanelSummary(baselinePanels).join("\n\n");
