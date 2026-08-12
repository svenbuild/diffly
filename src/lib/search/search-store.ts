import { writable } from 'svelte/store'
import type { ComparisonSearchQuery, SearchMatch } from '../search-types'

export interface SearchState {
  open: boolean
  query: ComparisonSearchQuery
  jobId: string | null
  results: SearchMatch[]
  selectedIndex: number
  running: boolean
  scannedDocuments: number
  totalDocuments: number
  totalMatches: number
  error: string | null
}

export const initialSearchQuery: ComparisonSearchQuery = {
  text: '',
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  scope: 'all',
  pathFilter: '',
}

export const comparisonSearch = writable<SearchState>({
  open: false,
  query: initialSearchQuery,
  jobId: null,
  results: [],
  selectedIndex: -1,
  running: false,
  scannedDocuments: 0,
  totalDocuments: 0,
  totalMatches: 0,
  error: null,
})
