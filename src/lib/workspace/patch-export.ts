export function createDocumentPatch(name: string, original: string, edited: string) {
  const path = name.replaceAll('\\', '/').replace(/^\/+/, '') || 'document.txt'
  const before = splitLines(original)
  const after = splitLines(edited)
  const lines = [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
  ]
  if (original === edited) return `${lines.join('\n')}\n`
  lines.push(`@@ -1,${before.lines.length} +1,${after.lines.length} @@`)
  lines.push(...before.lines.map((line) => `-${line}`))
  if (!before.trailingNewline && before.lines.length > 0) lines.push('\\ No newline at end of file')
  lines.push(...after.lines.map((line) => `+${line}`))
  if (!after.trailingNewline && after.lines.length > 0) lines.push('\\ No newline at end of file')
  return `${lines.join('\n')}\n`
}

function splitLines(contents: string) {
  const trailingNewline = /(?:\r\n|\r|\n)$/.test(contents)
  const lines = contents.split(/\r\n|\r|\n/)
  if (trailingNewline) lines.pop()
  return { lines, trailingNewline }
}
