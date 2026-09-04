import { get } from 'svelte/store'
import { cancelComparisonSearch, pollComparisonSearch, startComparisonSearch } from '../api'
import type { ComparisonSearchQuery, SearchMatch } from '../search-types'
import { documentWorkspace, workspaceDocumentId } from '../workspace/document-store'
import { comparisonSearch } from './search-store'

export class SearchController {
  private generation = 0

  async start(sessionId: string, query: ComparisonSearchQuery) {
    const cancellation = this.cancel()
    const generation = this.generation
    await cancellation
    if (generation !== this.generation) return
    comparisonSearch.set({
      open: true,
      query,
      jobId: null,
      results: draftMatches(query),
      selectedIndex: -1,
      running: true,
      scannedDocuments: 0,
      totalDocuments: 0,
      totalMatches: 0,
      error: null,
    })
    try {
      const { jobId } = await startComparisonSearch({ sessionId, query })
      if (generation !== this.generation) {
        await cancelComparisonSearch(jobId).catch(() => undefined)
        return
      }
      comparisonSearch.update((state) => ({ ...state, jobId }))
      await this.poll(jobId, generation)
    } catch (error) {
      if (generation !== this.generation) return
      comparisonSearch.update((state) => ({
        ...state,
        running: false,
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  async cancel() {
    const current = get(comparisonSearch)
    this.generation += 1
    comparisonSearch.update((state) => ({ ...state, jobId: null, running: false }))
    if (current.jobId && current.running) {
      await cancelComparisonSearch(current.jobId).catch(() => undefined)
    }
  }

  close() {
    void this.cancel()
    comparisonSearch.update((state) => ({ ...state, open: false }))
  }

  select(index: number) {
    comparisonSearch.update((state) => ({
      ...state,
      selectedIndex: Math.max(0, Math.min(index, state.results.length - 1)),
    }))
  }

  next(direction: 1 | -1) {
    const state = get(comparisonSearch)
    if (state.results.length === 0) return
    const selectedIndex = (state.selectedIndex + direction + state.results.length) % state.results.length
    this.select(selectedIndex)
  }

  private async poll(jobId: string, generation: number) {
    while (generation === this.generation) {
      const batch = await pollComparisonSearch(jobId)
      if (generation !== this.generation) return
      const dirtyIds = new Set(
        Array.from(get(documentWorkspace).documents.values())
          .filter((document) => document.dirty)
          .map((document) => document.id),
      )
      comparisonSearch.update((state) => ({
        ...state,
        results: [
          ...state.results,
          ...batch.matches.filter((match) => !dirtyIds.has(workspaceDocumentId(match.target))),
        ],
        scannedDocuments: batch.scannedDocuments,
        totalDocuments: batch.totalDocuments,
        totalMatches: batch.totalMatches,
        running: !batch.done,
        error: batch.error,
      }))
      if (batch.done) return
      await new Promise<void>((resolve) => window.setTimeout(resolve, batch.matches.length > 0 ? 0 : 40))
    }
  }
}

function draftMatches(query: ComparisonSearchQuery): SearchMatch[] {
  const results: SearchMatch[] = []
  for (const item of get(documentWorkspace).documents.values()) {
    if (!item.dirty || !pathMatches(item.document.displayPath, query.pathFilter)) continue
    const matcher = buildMatcher(query)
    const lines = item.contents.split(/\r\n|\r|\n/)
    lines.forEach((line, index) => {
      for (const range of matcher(line)) {
        results.push({
          id: `draft:${item.id}:${index + 1}:${range.start}`,
          entryId: targetEntryId(item.document.target),
          path: item.document.displayPath,
          target: item.document.target,
          side: item.document.target.kind === 'local' ? item.document.target.side : 'right',
          lineNumber: index + 1,
          startColumn: range.start,
          endColumn: range.end,
          preview: line.slice(0, 1000),
        })
      }
    })
  }
  return results
}

function buildMatcher(query: ComparisonSearchQuery) {
  if (query.regex) {
    const expression = new RegExp(query.wholeWord ? `\\b(?:${query.text})\\b` : query.text, query.caseSensitive ? 'gu' : 'giu')
    return (line: string) => Array.from(line.matchAll(expression), (match) => ({
      start: match.index,
      end: match.index + match[0].length,
    }))
  }
  const needle = query.caseSensitive ? query.text : query.text.toLocaleLowerCase()
  return (line: string) => {
    const value = query.caseSensitive ? line : line.toLocaleLowerCase()
    const ranges: Array<{ start: number; end: number }> = []
    let cursor = 0
    while (needle && (cursor = value.indexOf(needle, cursor)) >= 0) {
      const end = cursor + needle.length
      const word = /[\p{L}\p{N}_]/u
      if (!query.wholeWord || (!word.test(line[cursor - 1] ?? '') && !word.test(line[end] ?? ''))) {
        ranges.push({ start: cursor, end })
      }
      cursor = Math.max(end, cursor + 1)
    }
    return ranges
  }
}

function pathMatches(path: string, filter: string) {
  const value = filter.trim().replace(/^\*\*\//, '').replace(/\*/g, '')
  return !value || path.toLocaleLowerCase().includes(value.toLocaleLowerCase())
}

function targetEntryId(target: SearchMatch['target']) {
  return target.kind === 'scratch' ? target.sourceEntryId : target.entryId
}

export const workspaceSearchController = new SearchController()
