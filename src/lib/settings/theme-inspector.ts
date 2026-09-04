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
  ['surface', ['--surface', '--panel-bg', '--sidebar-panel-bg', '--pane-bg', '--list-bg', '--app-bar-bg']],
  ['raised', ['--surface-alt', '--surface-strong', '--panel-bg-raised', '--card-bg', '--list-header-bg']],
  ['overlay', ['--overlay-surface', '--panel-surface']],
  ['text', ['--text', '--title', '--strong-text', '--panel-title', '--active-text']],
  ['muted', ['--muted', '--muted-text', '--subtitle', '--secondary-text', '--panel-meta']],
  ['border', ['--border', '--border-color', '--border-subtle', '--border-strong', '--toolbar-divider']],
  ['input', ['--input-surface']],
  ['accent', ['--accent', '--accent-strong', '--active-border', '--status-modified-text']],
  ['added', ['--success', '--success-bg', '--diff-added', '--insert-highlight-bg']],
  ['removed', ['--danger', '--danger-bg', '--diff-removed', '--delete-highlight-bg']],
  ['syntax', ['--skill', '--accent-alt', '--syntax-keyword', '--diffs-token-keyword', '--diffs-token-function']],
]

export function themeRoleFromCssValue(value: string): InspectableThemeRole | null {
  for (const match of value.toLowerCase().matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
    const entry = VARIABLE_ROLES.find(([, variables]) => variables.includes(match[1]))
    if (entry) return entry[0]
  }
  return null
}
