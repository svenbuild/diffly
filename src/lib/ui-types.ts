import type {
  DirectoryEntryResult,
  DirectoryListing,
  ExplorerEntry,
} from './types'

export interface EntryGroup {
  key: string
  label: string
  entries: DirectoryEntryResult[]
}

export interface FolderSection {
  key: string
  label: string
  depth: number
  entries: DirectoryEntryResult[]
  totalCount: number
}

export interface DiffHeaderContext {
  currentFileLabel: string
  leftPaneLabel: string
  rightPaneLabel: string
  leftAbsolutePath: string
  rightAbsolutePath: string
  leftRootLabel: string
  rightRootLabel: string
  leftRootFullPath: string
  rightRootFullPath: string
}

export interface ExplorerPaneState {
  title: string
  roots: ExplorerEntry[]
  currentPath: string
  pathInput: string
  currentListing: DirectoryListing | null
  listings: Record<string, DirectoryListing>
  history: string[]
  historyIndex: number
  selectedTargetPath: string
  selectedTargetKind: 'file' | 'directory' | null
  selectedTargetPaths: string[]
  loading: boolean
  error: string
}

export type Side = 'left' | 'right'
export type SettingsSection =
  | 'appearance'
  | 'diffs'
  | 'trees'
  | 'updates'
  | 'reset'
