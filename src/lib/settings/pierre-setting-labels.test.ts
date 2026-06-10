import { describe, expect, it } from 'vitest'
import { PIERRE_SETTING_LABELS } from './pierre-setting-labels'

describe('PIERRE_SETTING_LABELS', () => {
  it('uses the literal Pierre option name as the visible label', () => {
    for (const [key, entry] of Object.entries(PIERRE_SETTING_LABELS)) {
      expect(entry.label).toBe(key)
    }
  })

  it('provides a non-empty description for every setting', () => {
    for (const entry of Object.values(PIERRE_SETTING_LABELS)) {
      expect(entry.description.trim().length).toBeGreaterThan(0)
    }
  })
})
