import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { resolveVariant } from './lib/theme'
import { normalizeAppearanceSettings, resolveThemeCssVariables } from './lib/theme/runtime'

const systemPrefersDark =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : true
const initialAppearance = normalizeAppearanceSettings(
  undefined,
  undefined,
  undefined
)
const initialThemeVariant = resolveVariant(initialAppearance.mode, systemPrefersDark)
const root = document.documentElement

root.dataset.theme = initialThemeVariant
root.style.colorScheme = initialThemeVariant

for (const [name, value] of Object.entries(
  resolveThemeCssVariables(initialAppearance, systemPrefersDark),
)) {
  root.style.setProperty(name, value)
}

const app = mount(App, {
  target: document.getElementById('app')!,
  props: {
    initialSession: null,
    startupFolderPath: null,
  },
})

export default app
