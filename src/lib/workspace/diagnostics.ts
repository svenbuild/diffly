export interface DiagnosticMarker {
  start: { line: number; character: number }
  end: { line: number; character: number }
  severity: 'error' | 'warning' | 'info' | 'hint'
  message: string
  source: string
}

export function diagnoseDocument(name: string, contents: string): DiagnosticMarker[] {
  const extension = name.toLocaleLowerCase().split('.').pop()
  if (extension !== 'json' && extension !== 'jsonc') return []
  try {
    JSON.parse(extension === 'jsonc' ? sanitizeJsonc(contents) : contents)
    return []
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON.'
    const offset = jsonErrorOffset(message, contents)
    const start = positionAt(contents, offset)
    return [{
      start,
      end: { line: start.line, character: start.character + 1 },
      severity: 'error',
      message,
      source: extension.toUpperCase(),
    }]
  }
}

export function sanitizeJsonc(contents: string) {
  const chars = contents.split('')
  let inString = false
  let escaped = false
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '/' && chars[index + 1] === '/') {
      chars[index] = chars[index + 1] = ' '
      index += 2
      while (index < chars.length && chars[index] !== '\n' && chars[index] !== '\r') chars[index++] = ' '
      index -= 1
    } else if (char === '/' && chars[index + 1] === '*') {
      chars[index] = chars[index + 1] = ' '
      index += 2
      while (index < chars.length && !(chars[index] === '*' && chars[index + 1] === '/')) {
        if (chars[index] !== '\n' && chars[index] !== '\r') chars[index] = ' '
        index += 1
      }
      if (index < chars.length) {
        chars[index] = chars[index + 1] = ' '
        index += 1
      }
    }
  }
  const withoutComments = chars.join('')
  return withoutComments.replace(/,(\s*[}\]])/g, (match, suffix: string) => ` ${suffix}`.padEnd(match.length, ' '))
}

function jsonErrorOffset(message: string, contents: string) {
  const offset = /position\s+(\d+)/i.exec(message)
  if (offset) return Math.min(contents.length, Number(offset[1]))
  const lineColumn = /line\s+(\d+)\s+column\s+(\d+)/i.exec(message)
  if (!lineColumn) return 0
  const targetLine = Number(lineColumn[1]) - 1
  const targetColumn = Number(lineColumn[2]) - 1
  let line = 0
  let index = 0
  while (line < targetLine && index < contents.length) {
    if (contents[index++] === '\n') line += 1
  }
  return Math.min(contents.length, index + targetColumn)
}

function positionAt(contents: string, offset: number) {
  let line = 0
  let character = 0
  for (let index = 0; index < offset; index += 1) {
    if (contents[index] === '\n') {
      line += 1
      character = 0
    } else character += 1
  }
  return { line, character }
}
