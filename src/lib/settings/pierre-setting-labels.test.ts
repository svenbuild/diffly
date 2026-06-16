import { describe, expect, it } from 'vitest'
import { PIERRE_SETTING_LABELS } from './pierre-setting-labels'

function hasCamelCase(value: string) {
  return /[a-z][A-Z]/.test(value)
}

describe('PIERRE_SETTING_LABELS', () => {
  it('uses readable visible labels', () => {
    for (const [key, entry] of Object.entries(PIERRE_SETTING_LABELS)) {
      expect(entry.label).not.toBe(key)
      expect(hasCamelCase(entry.label)).toBe(false)
      expect(entry.label).not.toMatch(/[_-]/)
    }
  })

  it('provides a non-empty description for every setting', () => {
    for (const entry of Object.values(PIERRE_SETTING_LABELS)) {
      expect(entry.description.trim().length).toBeGreaterThan(0)
    }
  })

  it('keeps labels concise', () => {
    for (const entry of Object.values(PIERRE_SETTING_LABELS)) {
      expect(entry.label.length).toBeLessThanOrEqual(28)
    }
  })

  it('keeps high-value labels stable', () => {
    expect(PIERRE_SETTING_LABELS.collapsedContextThreshold.label).toBe('Fold threshold')
    expect(PIERRE_SETTING_LABELS.flattenEmptyDirectories.label).toBe('Flat folders')
    expect(PIERRE_SETTING_LABELS.useTokenTransformer.label).toBe('Syntax highlighting')
    expect(PIERRE_SETTING_LABELS.disableLineNumbers.label).toBe('Line numbers')
  })
})
