import { describe, expect, it } from 'vitest'
import { resolveFileTypeIcon } from './file-icons'

describe('resolveFileTypeIcon', () => {
  it('uses material file icons for programming languages', () => {
    expect(resolveFileTypeIcon('src/main.ts')).toMatchObject({
      name: 'material-file-icon-typescript',
      token: 'typescript',
    })
    expect(resolveFileTypeIcon('lib.rs')).toMatchObject({
      name: 'material-file-icon-rust',
      token: 'rust',
    })
    expect(resolveFileTypeIcon('module.c')).toMatchObject({
      name: 'material-file-icon-c',
      token: 'c',
    })
    expect(resolveFileTypeIcon('App.svelte')).toMatchObject({
      name: 'material-file-icon-svelte',
      token: 'svelte',
    })
  })

  it('uses document and config icons from the material resolver', () => {
    expect(resolveFileTypeIcon('package.json')).toMatchObject({
      name: 'material-file-icon-nodejs',
      token: 'nodejs',
    })
    expect(resolveFileTypeIcon('README.md')).toMatchObject({
      name: 'material-file-icon-readme',
      token: 'readme',
    })
    expect(resolveFileTypeIcon('notes.txt')).toMatchObject({
      name: 'material-file-icon-document',
      token: 'document',
    })
  })

  it('uses dedicated icons for images and stylesheets', () => {
    expect(resolveFileTypeIcon('logo.png')).toMatchObject({
      name: 'material-file-icon-image',
      token: 'image',
    })
    expect(resolveFileTypeIcon('icon.svg')).toMatchObject({
      name: 'material-file-icon-svg',
      token: 'svg',
    })
    expect(resolveFileTypeIcon('app.css')).toMatchObject({
      name: 'material-file-icon-css',
      token: 'css',
    })
  })

  it('falls back to material default file icons for unknown files', () => {
    expect(resolveFileTypeIcon('archive.unknownext')).toMatchObject({
      name: 'material-file-icon-file',
      token: 'file',
    })
    expect(resolveFileTypeIcon('noextension')).toMatchObject({
      name: 'material-file-icon-file',
      token: 'file',
    })
  })

  it('works with full relative paths including backslashes', () => {
    expect(resolveFileTypeIcon('src\\lib\\compare\\viewer.ts').token).toBe('typescript')
    expect(resolveFileTypeIcon('docs/guide/intro.md').token).toBe('markdown')
  })

  it('uses the most specific extension match', () => {
    expect(resolveFileTypeIcon('src/types/api.d.ts')).toMatchObject({
      name: 'material-file-icon-typescript-def',
      token: 'typescript-def',
    })
  })
})
