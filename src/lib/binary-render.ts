import type { BinaryDiffPayload } from './types'

export interface BinaryFragment {
  text: string
  changed: boolean
}

export interface BinaryRowView {
  offset: string
  leftHex: BinaryFragment[]
  leftAscii: BinaryFragment[]
  rightHex: BinaryFragment[]
  rightAscii: BinaryFragment[]
  changed: boolean
}

interface BinaryViewState {
  mask: Uint8Array
  rowMask: Uint8Array
  totalRows: number
  rowCache: Map<number, BinaryRowView>
}

const HEX_LOOKUP = Array.from({ length: 256 }, (_, byte) =>
  byte.toString(16).toUpperCase().padStart(2, '0'),
)
const ASCII_LOOKUP = Array.from({ length: 256 }, (_, byte) =>
  byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.',
)
const binaryViewStates = new WeakMap<BinaryDiffPayload, BinaryViewState>()

export const BINARY_ROW_HEIGHT = 22
export const BINARY_HEADER_HEIGHT = 26
export const BINARY_OVERSCAN = 32

export function formatBinaryOffset(offset: number) {
  return offset.toString(16).toUpperCase().padStart(8, '0')
}

export function getBinaryTotalRows(diff: BinaryDiffPayload) {
  return getBinaryViewState(diff).totalRows
}

export function getBinaryRowView(diff: BinaryDiffPayload, rowIndex: number): BinaryRowView {
  const state = getBinaryViewState(diff)
  const cached = state.rowCache.get(rowIndex)

  if (cached) {
    return cached
  }

  const bytesPerRow = diff.bytesPerRow
  const rowOffset = rowIndex * bytesPerRow
  const view: BinaryRowView = {
    offset: formatBinaryOffset(rowOffset),
    leftHex: buildHexFragments(diff.leftBytes, rowOffset, bytesPerRow, state.mask),
    leftAscii: buildAsciiFragments(diff.leftBytes, rowOffset, bytesPerRow, state.mask),
    rightHex: buildHexFragments(diff.rightBytes, rowOffset, bytesPerRow, state.mask),
    rightAscii: buildAsciiFragments(diff.rightBytes, rowOffset, bytesPerRow, state.mask),
    changed: state.rowMask[rowIndex] === 1,
  }

  state.rowCache.set(rowIndex, view)
  return view
}

function getBinaryViewState(diff: BinaryDiffPayload): BinaryViewState {
  const cached = binaryViewStates.get(diff)

  if (cached) {
    return cached
  }

  const state = buildBinaryViewState(diff)
  binaryViewStates.set(diff, state)
  return state
}

function buildBinaryViewState(diff: BinaryDiffPayload): BinaryViewState {
  const leftBytes = diff.leftBytes
  const rightBytes = diff.rightBytes
  const maxByteCount = Math.max(leftBytes.length, rightBytes.length)
  const mask = new Uint8Array(maxByteCount)
  const commonByteCount = Math.min(leftBytes.length, rightBytes.length)

  for (let index = 0; index < commonByteCount; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) {
      mask[index] = 1
    }
  }

  for (let index = commonByteCount; index < maxByteCount; index += 1) {
    mask[index] = 1
  }

  const bytesPerRow = diff.bytesPerRow
  const totalRows = Math.ceil(maxByteCount / bytesPerRow)
  const rowMask = new Uint8Array(totalRows)

  for (let row = 0; row < totalRows; row += 1) {
    const start = row * bytesPerRow
    const end = Math.min(start + bytesPerRow, maxByteCount)

    for (let index = start; index < end; index += 1) {
      if (mask[index]) {
        rowMask[row] = 1
        break
      }
    }
  }

  return { mask, rowMask, totalRows, rowCache: new Map() }
}

function buildHexFragments(
  bytes: ArrayLike<number>,
  rowOffset: number,
  bytesPerRow: number,
  mask: Uint8Array,
): BinaryFragment[] {
  const fragments: BinaryFragment[] = []
  let current: BinaryFragment | null = null

  for (let column = 0; column < bytesPerRow; column += 1) {
    const byteIndex = rowOffset + column
    const inRange = byteIndex < bytes.length
    const changed = inRange && mask[byteIndex] === 1
    const byteText = inRange ? HEX_LOOKUP[bytes[byteIndex]] : '  '
    const separator = column === 0 ? '' : column === bytesPerRow / 2 ? '  ' : ' '

    if (!current) {
      current = { text: separator + byteText, changed }
      continue
    }

    if (current.changed === changed) {
      current.text += separator + byteText
      continue
    }

    if (separator) {
      current.text += separator
    }

    fragments.push(current)
    current = { text: byteText, changed }
  }

  if (current) {
    fragments.push(current)
  }

  return fragments
}

function buildAsciiFragments(
  bytes: ArrayLike<number>,
  rowOffset: number,
  bytesPerRow: number,
  mask: Uint8Array,
): BinaryFragment[] {
  const fragments: BinaryFragment[] = []
  let current: BinaryFragment | null = null

  for (let column = 0; column < bytesPerRow; column += 1) {
    const byteIndex = rowOffset + column
    const inRange = byteIndex < bytes.length
    const changed = inRange && mask[byteIndex] === 1
    const text = inRange ? ASCII_LOOKUP[bytes[byteIndex]] : ' '

    if (!current) {
      current = { text, changed }
      continue
    }

    if (current.changed === changed) {
      current.text += text
      continue
    }

    fragments.push(current)
    current = { text, changed }
  }

  if (current) {
    fragments.push(current)
  }

  return fragments
}
