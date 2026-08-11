import { readFile, readdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

const rendererDirectory = resolve('out/renderer')
const html = await readFile(join(rendererDirectory, 'index.html'), 'utf8')
const entryMatch = /<script[^>]+src="\.\/assets\/([^"]+\.js)"/.exec(html)
if (!entryMatch) throw new Error('Unable to identify the renderer entry chunk.')

const assetsDirectory = join(rendererDirectory, 'assets')
const entryName = basename(entryMatch[1])
const entry = await readFile(join(assetsDirectory, entryName), 'utf8')
const editMarker = 'diffs-editor-icon-replace-all'
if (entry.includes(editMarker)) {
  throw new Error(`Pierre Edit was bundled into the startup entry ${entryName}.`)
}

const javascriptAssets = (await readdir(assetsDirectory)).filter((name) => name.endsWith('.js'))
let lazyChunk = null
for (const name of javascriptAssets) {
  if (name === entryName) continue
  const contents = await readFile(join(assetsDirectory, name), 'utf8')
  if (contents.includes(editMarker)) {
    lazyChunk = name
    break
  }
}
if (!lazyChunk) throw new Error('Pierre Edit was not found in a lazy renderer chunk.')

console.log(JSON.stringify({ entry: entryName, lazyEditChunk: lazyChunk }))
