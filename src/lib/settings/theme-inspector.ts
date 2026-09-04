export type InspectableThemeRole =
  | 'background'
  | 'surface'
  | 'raised'
  | 'overlay'
  | 'text'
  | 'muted'
  | 'border'
  | 'input'
  | 'accent'
  | 'added'
  | 'removed'
  | 'syntax'

const VARIABLE_ROLES: ReadonlyArray<readonly [InspectableThemeRole, readonly string[]]> = [
  ['background', ['--canvas', '--canvas-alt', '--app-bg', '--editor-bg']],
  ['surface', ['--surface', '--panel-bg', '--sidebar-panel-bg', '--pane-bg']],
  ['raised', ['--surface-alt', '--panel-bg-raised', '--card-bg', '--list-bg']],
  ['overlay', ['--surface-strong', '--elevated-surface', '--list-header-bg']],
  ['text', ['--text', '--title', '--strong-text', '--panel-title', '--active-text']],
  ['muted', ['--muted', '--subtitle', '--secondary-text', '--panel-meta']],
  ['border', ['--border', '--border-subtle', '--border-strong', '--toolbar-divider']],
  ['input', ['--input-surface']],
  ['accent', ['--accent', '--accent-strong', '--active-border', '--status-modified-text']],
  ['added', ['--success', '--success-bg', '--diff-added', '--insert-highlight-bg']],
  ['removed', ['--danger', '--danger-bg', '--diff-removed', '--delete-highlight-bg']],
  ['syntax', ['--skill', '--accent-alt', '--accent-olive']],
]

export function themeRoleFromCssValue(value: string): InspectableThemeRole | null {
  const referencedVariables = new Set(
    Array.from(value.toLowerCase().matchAll(/var\(\s*(--[a-z0-9-]+)/g), (match) => match[1]),
  )
  for (const [role, roleVariables] of VARIABLE_ROLES) {
    if (roleVariables.some((variable) => referencedVariables.has(variable))) return role
  }
  return null
}
