import { describe, expect, it } from 'vitest'
import { diagnoseDocument, sanitizeJsonc } from './diagnostics'

describe('workspace diagnostics', () => {
  it('reports JSON syntax errors at a navigable position', () => {
    const [marker] = diagnoseDocument('settings.json', '{\n  "enabled": true,\n}')
    expect(marker?.severity).toBe('error')
    expect(marker?.start.line).toBeGreaterThanOrEqual(1)
  })

  it('accepts JSONC comments and trailing commas without shifting line positions', () => {
    const jsonc = '{\n // comment\n "enabled": true,\n}\n'
    expect(JSON.parse(sanitizeJsonc(jsonc))).toEqual({ enabled: true })
    expect(diagnoseDocument('settings.jsonc', jsonc)).toEqual([])
  })

  it('does not diagnose unrelated languages', () => {
    expect(diagnoseDocument('file.ts', 'const invalid =')).toEqual([])
  })
})
