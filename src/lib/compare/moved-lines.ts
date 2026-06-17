import type { FileDiffMetadata } from '@pierre/diffs'

export interface MovedLineDecorations {
  deletions: Set<number>
  additions: Set<number>
}

interface CandidateLine {
  lineNumber: number
}

const MIN_MEANINGFUL_TRIMMED_LENGTH = 8
const MAX_OCCURRENCES_PER_SIDE = 64
const MAX_MARKED_LINES_PER_FILE = 5000
const IGNORED_TRIMMED_LINES = new Set(['{', '}', '};', 'break;', 'else'])

export const MOVED_LINE_UNSAFE_CSS = `
  [data-diffly-moved-line] {
    --diffs-computed-diff-line-bg: color-mix(in srgb, var(--diffs-modified-base, #2f6feb) 20%, var(--diffs-bg, transparent));
    --diffs-computed-selected-line-bg: var(--diffs-computed-diff-line-bg);
    --diffs-line-bg: var(--diffs-computed-diff-line-bg);
    background-color: var(--diffs-line-bg) !important;
  }

  [data-diffly-moved-line][data-line-type='change-deletion'],
  [data-diffly-moved-line][data-line-type='change-addition'] {
    color: var(--diffs-fg, inherit) !important;
  }

  [data-diffly-moved-line][data-column-number] {
    color: var(--diffs-fg-number, var(--diffs-fg, inherit)) !important;
  }

  [data-diffly-moved-line] [data-diff-span] {
    background-color: transparent !important;
  }
`

function emptyDecorations(): MovedLineDecorations {
  return {
    deletions: new Set(),
    additions: new Set(),
  }
}

function isMeaningfulMovedLineCandidate(text: string) {
  const trimmed = text.trim()
  return trimmed.length >= MIN_MEANINGFUL_TRIMMED_LENGTH && !IGNORED_TRIMMED_LINES.has(trimmed)
}

function movedLineKey(text: string) {
  return text.replace(/(?:\r\n|\n|\r)$/, '')
}

function addCandidate(
  candidatesByText: Map<string, CandidateLine[]>,
  text: string | undefined,
  lineNumber: number,
) {
  if (text === undefined) {
    return
  }

  const key = movedLineKey(text)
  if (!isMeaningfulMovedLineCandidate(key)) {
    return
  }

  const candidates = candidatesByText.get(key)
  if (candidates) {
    if (candidates.length < MAX_OCCURRENCES_PER_SIDE) {
      candidates.push({ lineNumber })
    }
    return
  }

  candidatesByText.set(key, [{ lineNumber }])
}

export function detectMovedLines(fileDiff: FileDiffMetadata): MovedLineDecorations {
  const deletedByText = new Map<string, CandidateLine[]>()
  const addedByText = new Map<string, CandidateLine[]>()

  for (const hunk of fileDiff.hunks) {
    let deletionLineIndex = hunk.deletionLineIndex
    let additionLineIndex = hunk.additionLineIndex
    let deletionLineNumber = hunk.deletionStart
    let additionLineNumber = hunk.additionStart

    for (const content of hunk.hunkContent) {
      if (content.type === 'context') {
        deletionLineIndex += content.lines
        additionLineIndex += content.lines
        deletionLineNumber += content.lines
        additionLineNumber += content.lines
        continue
      }

      for (let offset = 0; offset < content.deletions; offset += 1) {
        addCandidate(
          deletedByText,
          fileDiff.deletionLines[deletionLineIndex + offset],
          deletionLineNumber + offset,
        )
      }

      for (let offset = 0; offset < content.additions; offset += 1) {
        addCandidate(
          addedByText,
          fileDiff.additionLines[additionLineIndex + offset],
          additionLineNumber + offset,
        )
      }

      deletionLineIndex += content.deletions
      additionLineIndex += content.additions
      deletionLineNumber += content.deletions
      additionLineNumber += content.additions
    }
  }

  const movedLines = emptyDecorations()
  let markedLineCount = 0

  for (const [text, deletedLines] of deletedByText) {
    const addedLines = addedByText.get(text)
    if (!addedLines) {
      continue
    }

    deletedLines.sort((left, right) => left.lineNumber - right.lineNumber)
    addedLines.sort((left, right) => left.lineNumber - right.lineNumber)

    const pairCount = Math.min(deletedLines.length, addedLines.length)
    for (let index = 0; index < pairCount; index += 1) {
      if (markedLineCount + 2 > MAX_MARKED_LINES_PER_FILE) {
        return movedLines
      }

      movedLines.deletions.add(deletedLines[index].lineNumber)
      movedLines.additions.add(addedLines[index].lineNumber)
      markedLineCount += 2
    }
  }

  return movedLines
}

function movedLineContainers(host: HTMLElement): HTMLElement[] {
  const containers = Array.from(host.querySelectorAll<HTMLElement>('diffs-container'))
  return host.localName === 'diffs-container'
    ? [host, ...containers]
    : containers
}

function markMovedLine(
  root: ShadowRoot,
  lineType: 'change-deletion' | 'change-addition',
  lineNumber: number,
  side: keyof MovedLineDecorations,
) {
  const selector = `[data-line-type="${lineType}"][data-line="${lineNumber}"], [data-line-type="${lineType}"][data-column-number="${lineNumber}"]`
  root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
    element.dataset.difflyMovedLine = side
  })
}

export function applyMovedLineDecorations(
  host: HTMLElement | null,
  movedLines: MovedLineDecorations,
): void {
  if (!host) {
    return
  }

  for (const container of movedLineContainers(host)) {
    const root = container.shadowRoot
    if (!root) {
      continue
    }

    root.querySelectorAll<HTMLElement>('[data-diffly-moved-line]').forEach((element) => {
      element.removeAttribute('data-diffly-moved-line')
    })

    movedLines.deletions.forEach((lineNumber) => {
      markMovedLine(root, 'change-deletion', lineNumber, 'deletions')
    })
    movedLines.additions.forEach((lineNumber) => {
      markMovedLine(root, 'change-addition', lineNumber, 'additions')
    })
  }
}
