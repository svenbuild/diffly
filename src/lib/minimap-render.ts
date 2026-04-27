import type { SideBySideRow, UnifiedLine } from './types'
import type { SideBySideRenderItem, UnifiedRenderItem } from './ui-types'

export interface MinimapRow {
  change: 'context' | 'insert' | 'delete'
  text: string
  isGap: boolean
}

export interface MinimapHunkMarker {
  startRow: number
  endRow: number
  kind: 'insert' | 'delete' | 'mixed'
}

export interface MinimapColors {
  insertBg: string
  deleteBg: string
  gapBg: string
  text: string
  insertText: string
  deleteText: string
  markerInsert: string
  markerDelete: string
  markerMixed: string
}

const CHAR_WIDTH = 1.1
const MAX_CHARS = 55
const GUTTER_WIDTH = 4
const TEXT_ALPHA = 0.38
const CHANGED_TEXT_ALPHA = 0.5
const MARKER_ALPHA = 0.55

export function sideBySideMinimapRows(rows: SideBySideRow[]): MinimapRow[] {
  return rows.map((row) => ({
    change: row.right?.change ?? 'context',
    text: row.right?.text ?? '',
    isGap: !row.right,
  }))
}

export function unifiedMinimapRows(rows: UnifiedLine[]): MinimapRow[] {
  return rows.map((row) => ({
    change: row.change,
    text: row.text,
    isGap: false,
  }))
}

export function sideBySideItemMinimapRows(items: SideBySideRenderItem[]): MinimapRow[] {
  return items.map((item) => {
    if (item.type === 'hunk') {
      return { change: 'context' as const, text: '', isGap: false }
    }
    return {
      change: item.row?.right?.change ?? 'context',
      text: item.row?.right?.text ?? '',
      isGap: !item.row?.right,
    }
  })
}

export function unifiedItemMinimapRows(items: UnifiedRenderItem[]): MinimapRow[] {
  return items.map((item) => {
    if (item.type === 'hunk') {
      return { change: 'context' as const, text: '', isGap: false }
    }
    return {
      change: item.row?.change ?? 'context',
      text: item.row?.text ?? '',
      isGap: false,
    }
  })
}

export function buildHunkMarkers(rows: MinimapRow[]): MinimapHunkMarker[] {
  const markers: MinimapHunkMarker[] = []
  let i = 0

  while (i < rows.length) {
    if (rows[i].change === 'context' && !rows[i].isGap) {
      i += 1
      continue
    }

    const start = i
    let hasInsert = false
    let hasDelete = false

    while (i < rows.length && (rows[i].change !== 'context' || rows[i].isGap)) {
      if (rows[i].change === 'insert') hasInsert = true
      if (rows[i].change === 'delete' || rows[i].isGap) hasDelete = true
      i += 1
    }

    markers.push({
      startRow: start,
      endRow: i - 1,
      kind: hasInsert && hasDelete ? 'mixed' : hasInsert ? 'insert' : 'delete',
    })
  }

  return markers
}

export function renderMinimap(
  canvas: HTMLCanvasElement,
  rows: MinimapRow[],
  markers: MinimapHunkMarker[],
  colors: MinimapColors,
): void {
  const width = canvas.clientWidth
  const height = canvas.clientHeight

  if (width <= 0 || height <= 0 || rows.length === 0) {
    canvas.width = 0
    canvas.height = 0
    return
  }

  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.scale(dpr, dpr)

  const rowHeight = Math.min(3, height / rows.length)
  const textWidth = width - GUTTER_WIDTH

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    const y = i * rowHeight
    const h = Math.max(1, rowHeight)

    if (row.isGap) {
      ctx.fillStyle = colors.gapBg
      ctx.fillRect(0, y, textWidth, h)
      continue
    }

    if (row.change === 'insert') {
      ctx.fillStyle = colors.insertBg
      ctx.fillRect(0, y, textWidth, h)
    } else if (row.change === 'delete') {
      ctx.fillStyle = colors.deleteBg
      ctx.fillRect(0, y, textWidth, h)
    }

    if (row.text.length > 0) {
      if (row.change === 'insert') {
        ctx.fillStyle = colors.insertText
        ctx.globalAlpha = CHANGED_TEXT_ALPHA
      } else if (row.change === 'delete') {
        ctx.fillStyle = colors.deleteText
        ctx.globalAlpha = CHANGED_TEXT_ALPHA
      } else {
        ctx.fillStyle = colors.text
        ctx.globalAlpha = TEXT_ALPHA
      }

      const charH = Math.max(1, rowHeight * 0.85)
      const len = Math.min(row.text.length, MAX_CHARS)

      for (let c = 0; c < len; c += 1) {
        const ch = row.text.charCodeAt(c)
        if (ch === 32 || ch === 9) continue
        const x = c * CHAR_WIDTH
        if (x >= textWidth) break
        ctx.fillRect(x, y, Math.max(0.8, CHAR_WIDTH - 0.3), charH)
      }

      ctx.globalAlpha = 1
    }
  }

  for (const marker of markers) {
    const y = marker.startRow * rowHeight
    const h = Math.max(2, (marker.endRow - marker.startRow + 1) * rowHeight)

    ctx.fillStyle =
      marker.kind === 'insert'
        ? colors.markerInsert
        : marker.kind === 'delete'
          ? colors.markerDelete
          : colors.markerMixed

    ctx.globalAlpha = MARKER_ALPHA
    ctx.fillRect(textWidth + 1, y, GUTTER_WIDTH - 1, h)
    ctx.globalAlpha = 1
  }
}

export function computeViewport(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  totalRows: number,
  containerHeight: number,
): { top: number; height: number } {
  if (scrollHeight <= clientHeight || totalRows <= 0 || containerHeight <= 0) {
    return { top: 0, height: containerHeight }
  }

  const rowHeight = Math.min(3, containerHeight / totalRows)
  const usedHeight = Math.min(containerHeight, rowHeight * totalRows)

  const viewportFraction = clientHeight / scrollHeight
  const vpHeight = Math.max(20, viewportFraction * usedHeight)
  const maxScrollTop = scrollHeight - clientHeight
  const scrollFraction = maxScrollTop > 0 ? Math.min(1, scrollTop / maxScrollTop) : 0
  const maxTop = Math.max(0, usedHeight - vpHeight)

  return {
    top: Math.max(0, Math.min(scrollFraction * maxTop, containerHeight - vpHeight)),
    height: Math.min(vpHeight, containerHeight),
  }
}

export function scrollTopFromClick(
  clickY: number,
  totalRows: number,
  containerHeight: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  if (totalRows <= 0 || containerHeight <= 0 || scrollHeight <= clientHeight) return 0

  const rowHeight = Math.min(3, containerHeight / totalRows)
  const usedHeight = Math.min(containerHeight, rowHeight * totalRows)
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight)
  const contentFraction = usedHeight > 0 ? clickY / usedHeight : 0
  const targetScrollTop = contentFraction * scrollHeight - clientHeight / 2

  return Math.max(0, Math.min(maxScrollTop, targetScrollTop))
}
