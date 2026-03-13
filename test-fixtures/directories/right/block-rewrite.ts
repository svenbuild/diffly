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
    activeFilters: ["modified", "leftOnly", "rightOnly"],
    selectedPath: "nested/src/module.c",
    summaryLines: [
      "Workspace controls now emphasize filter chips instead of status badges.",
      "Directory totals are rendered in clearer rows with stronger separators.",
      "Selected rows remain visible while the sidebar and viewer move together.",
      "Refresh actions preserve the label and swap only the icon while loading.",
    ],
  },
  {
    id: "viewer",
    title: "Viewer",
    expanded: true,
    activeFilters: ["modified", "binary", "tooLarge"],
    selectedPath: "inline-change.css",
    summaryLines: [
      "The side-by-side viewer keeps line numbers aligned across changed rows.",
      "The unified viewer emits a delete block first and the insert block after it.",
      "Scrollbars now use slimmer themed rails that blend into the panel chrome.",
      "Large binary files stay in the list and expose status metadata without text rows.",
    ],
  },
  {
    id: "history",
    title: "History",
    expanded: false,
    activeFilters: ["rightOnly", "binary"],
    selectedPath: "right-only.txt",
    summaryLines: [
      "Recent compares retain selected roots, mode, theme, and active filters.",
      "Manual refresh keeps the same target pair, file selection, and sidebar state.",
      "Collapsed tree branches remain collapsed after compare results are reloaded.",
      "Toolbar actions keep a fixed width while loading markers rotate in place.",
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
  "This right-side fixture rewrites the wording of several summary blocks.",
  "A full block of viewer notes is intentionally phrased as a replacement section.",
  "The goal is to force a contiguous insert block after the deleted left-side section.",
  "That shape makes the unified renderer exercise grouped block presentation logic.",
];

export const baselineReport = renderPanelSummary(baselinePanels).join("\n\n");
