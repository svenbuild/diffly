import { describe, expect, it } from 'vitest'
import { themeRoleFromCssValue } from './theme-inspector'

describe('theme inspector role mapping', () => {
  it('maps direct and nested theme variables to editor roles', () => {
    expect(themeRoleFromCssValue('var(--canvas)')).toBe('background')
    expect(themeRoleFromCssValue('color-mix(in srgb, var(--muted) 80%, transparent)')).toBe('muted')
    expect(themeRoleFromCssValue('0 0 0 1px var(--border-subtle)')).toBe('border')
  })

  it('maps semantic diff and syntax variables', () => {
    expect(themeRoleFromCssValue('var(--success)')).toBe('added')
    expect(themeRoleFromCssValue('var(--danger-bg)')).toBe('removed')
    expect(themeRoleFromCssValue('var(--accent-alt)')).toBe('syntax')
  })

  it('ignores declarations without a supported theme variable', () => {
    expect(themeRoleFromCssValue('rgba(0, 0, 0, 0.5)')).toBeNull()
    expect(themeRoleFromCssValue('var(--unknown-token)')).toBeNull()
  })
})
