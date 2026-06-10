import { describe, expect, it } from 'vitest'
import { FILE_ICON_PATHS, fileTypeIconKind, type FileTypeIconKind } from './file-icons'

describe('fileTypeIconKind', () => {
  it('maps programming languages to the code icon', () => {
    expect(fileTypeIconKind('src/main.ts')).toBe('code')
    expect(fileTypeIconKind('lib.rs')).toBe('code')
    expect(fileTypeIconKind('module.c')).toBe('code')
    expect(fileTypeIconKind('App.svelte')).toBe('code')
  })

  it('maps documents to the doc icon', () => {
    expect(fileTypeIconKind('README.md')).toBe('doc')
    expect(fileTypeIconKind('notes.txt')).toBe('doc')
    expect(fileTypeIconKind('data.csv')).toBe('doc')
  })

  it('maps config formats to the config icon', () => {
    expect(fileTypeIconKind('package.json')).toBe('config')
    expect(fileTypeIconKind('config.yaml')).toBe('config')
    expect(fileTypeIconKind('Cargo.toml')).toBe('config')
    expect(fileTypeIconKind('settings.xml')).toBe('config')
  })

  it('maps stylesheets to the styles icon', () => {
    expect(fileTypeIconKind('app.css')).toBe('styles')
    expect(fileTypeIconKind('theme.scss')).toBe('styles')
    expect(fileTypeIconKind('main.less')).toBe('styles')
  })

  it('maps images by extension regardless of filetype fallback', () => {
    expect(fileTypeIconKind('logo.png')).toBe('image')
    expect(fileTypeIconKind('photo.JPG')).toBe('image')
    expect(fileTypeIconKind('icon.svg')).toBe('image')
  })

  it('falls back to unknown for unrecognized extensions', () => {
    expect(fileTypeIconKind('archive.unknownext')).toBe('unknown')
    expect(fileTypeIconKind('binary.bin')).toBe('unknown')
    expect(fileTypeIconKind('noextension')).toBe('unknown')
  })

  it('works with full relative paths including backslashes', () => {
    expect(fileTypeIconKind('src\\lib\\compare\\viewer.ts')).toBe('code')
    expect(fileTypeIconKind('docs/guide/intro.md')).toBe('doc')
  })
})

describe('FILE_ICON_PATHS registry', () => {
  it('has path data for every icon kind including the unknown fallback', () => {
    const kinds: FileTypeIconKind[] = ['code', 'doc', 'image', 'config', 'styles', 'unknown']
    for (const kind of kinds) {
      expect(FILE_ICON_PATHS[kind].length).toBeGreaterThan(0)
    }
  })
})
