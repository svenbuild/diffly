import { writable } from 'svelte/store'
import type { ConflictDocument } from '../conflict-types'

export interface ConflictState {
  document: ConflictDocument | null
  draft: string
  loading: boolean
  resolving: boolean
  error: string | null
}

export const conflictStore = writable<ConflictState>({
  document: null,
  draft: '',
  loading: false,
  resolving: false,
  error: null,
})
