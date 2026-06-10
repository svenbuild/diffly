// Diff status indicator metadata shared by the compare sidebar badge logic.
// Single source of truth for the letter + default label per status, so the
// same status never carries different letters in different surfaces.

export type DiffStatusIndicatorKey =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'typeChanged'
  | 'untracked'
  | 'conflicted'

export interface DiffStatusIndicator {
  // Single-letter badge label: M A D R C T ? U
  letter: string
  // Default human-readable label (tooltips may override, e.g. rename paths).
  label: string
}

export const DIFF_STATUS_INDICATORS: Record<DiffStatusIndicatorKey, DiffStatusIndicator> = {
  modified: { letter: 'M', label: 'Modified' },
  added: { letter: 'A', label: 'Added' },
  deleted: { letter: 'D', label: 'Deleted' },
  renamed: { letter: 'R', label: 'Renamed' },
  copied: { letter: 'C', label: 'Copied' },
  typeChanged: { letter: 'T', label: 'Type changed' },
  untracked: { letter: '?', label: 'Untracked' },
  conflicted: { letter: 'U', label: 'Conflicted' },
}
