import { describe, expect, it } from 'vitest'
import { resolveFileTypeIcon } from './file-icons'

describe('resolveFileTypeIcon', () => {
  it('uses Pierre tree complete icons for programming languages', () => {
    expect(resolveFileTypeIcon('src/main.ts')).toMatchObject({
      name: 'file-tree-builtin-typescript',
      token: 'typescript',
    })
    expect(resolveFileTypeIcon('lib.rs')).toMatchObject({
      name: 'file-tree-builtin-rust',
      token: 'rust',
    })
    expect(resolveFileTypeIcon('module.c')).toMatchObject({
      name: 'file-tree-builtin-c',
      token: 'c',
    })
    expect(resolveFileTypeIcon('App.svelte')).toMatchObject({
      name: 'file-tree-builtin-svelte',
      token: 'svelte',
    })
  })

  it('uses document and config icons from the tree resolver', () => {
    expect(resolveFileTypeIcon('package.json')).toMatchObject({
      name: 'file-tree-builtin-json',
      token: 'json',
    })
    expect(resolveFileTypeIcon('README.md')).toMatchObject({
      name: 'file-tree-builtin-markdown',
      token: 'markdown',
    })
    expect(resolveFileTypeIcon('notes.txt')).toMatchObject({
      name: 'file-tree-builtin-text',
      token: 'text',
    })
  })

  it('uses dedicated icons for images and stylesheets', () => {
    expect(resolveFileTypeIcon('logo.png')).toMatchObject({
      name: 'file-tree-builtin-image',
      token: 'image',
    })
    expect(resolveFileTypeIcon('icon.svg')).toMatchObject({
      name: 'file-tree-builtin-svg',
      token: 'svg',
    })
    expect(resolveFileTypeIcon('app.css')).toMatchObject({
      name: 'file-tree-builtin-css',
      token: 'css',
    })
  })

  it('falls back to Pierre tree default file icons for unknown files', () => {
    expect(resolveFileTypeIcon('archive.unknownext')).toMatchObject({
      name: 'file-tree-builtin-default',
      token: 'default',
    })
    expect(resolveFileTypeIcon('noextension')).toMatchObject({
      name: 'file-tree-builtin-default',
      token: 'default',
    })
  })

  it('works with full relative paths including backslashes', () => {
    expect(resolveFileTypeIcon('src\\lib\\compare\\viewer.ts').token).toBe('typescript')
    expect(resolveFileTypeIcon('docs/guide/intro.md').token).toBe('markdown')
  })
})
