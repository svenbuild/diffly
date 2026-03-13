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
    id: "workspace",
    title: "Workspace",
    expanded: true,
    activeFilters: ["modified", "leftOnly"],
    selectedPath: "nested/src/module.c",
    summaryLines: [
      "Baseline workspace keeps the original compare controls visible.",
      "Directory counts are rendered in compact rows with narrow spacing.",
      "Selected rows stay pinned while the sidebar scroll position changes.",
      "Refresh actions report a static button label and a small loading marker.",
    ],
  },
  {
    id: "viewer",
    title: "Viewer",
    expanded: true,
    activeFilters: ["modified", "binary", "tooLarge"],
    selectedPath: "inline-change.css",
    summaryLines: [
      "The side-by-side viewer shows line numbers and inline highlights.",
      "The unified viewer groups matching context before and after each hunk.",
      "Scrollbars are themed to match the dark panel surfaces and borders.",
      "Large binary files stay in the status-only list and never open text rows.",
    ],
  },
  {
    id: "history",
    title: "History",
    expanded: false,
    activeFilters: ["rightOnly"],
    selectedPath: "right-only.txt",
    summaryLines: [
      "Recent compares retain the selected roots and the active compare mode.",
      "Manual refresh keeps the same target pair and current file selection.",
      "Collapsed tree branches remain collapsed after a new compare completes.",
      "Toolbar actions keep a fixed width instead of shifting under loading.",
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
  "This left-side fixture keeps the older wording for several summary rows.",
  "A full block of viewer notes is intentionally phrased differently from the right side.",
  "The goal is to force a contiguous delete block before the replacement insert block.",
  "That shape makes the unified renderer exercise grouped block presentation logic.",
];

export const baselineReport = renderPanelSummary(baselinePanels).join("\n\n");
