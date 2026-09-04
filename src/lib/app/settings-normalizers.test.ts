import { describe, expect, it } from 'vitest'
import { createDefaultTreeSettings, createDefaultViewerSettings, normalizeTreeSettings, normalizeViewerSettings } from './settings-normalizers'

describe('desktop compare settings', () => {
  it('preserves fractional custom tree density', () => {
    const defaults = createDefaultTreeSettings()
    expect(normalizeTreeSettings({ ...defaults, customDensity: 1.25 }, defaults).customDensity).toBe(1.25)
  })

  it('migrates obsolete tree demo options to safe desktop behavior', () => {
    const defaults = createDefaultTreeSettings()
    const settings = normalizeTreeSettings({ ...defaults, dragAndDrop: true, renaming: true, initialSearchQuery: 'hidden', searchFakeFocus: true }, defaults)
    expect(settings).toMatchObject({ dragAndDrop: false, renaming: false, initialSearchQuery: '', searchFakeFocus: false })
  })

  it('retains rendering buffers and inline syntax colors for old sessions', () => {
    const defaults = createDefaultViewerSettings()
    expect(normalizeViewerSettings({ ...defaults, disableVirtualizationBuffers: true, useCSSClasses: true }, defaults))
      .toMatchObject({ disableVirtualizationBuffers: false, useCSSClasses: false })
  })
})
