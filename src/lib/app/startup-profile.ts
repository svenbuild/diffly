interface StartupProfileMark {
  name: string
  elapsedMs: number
  deltaMs: number
  detail?: Record<string, unknown>
}

export interface StartupProfileSnapshot {
  marks: StartupProfileMark[]
  ready: boolean
  readyAtMs: number | null
  readyLabel: string
  timeOriginMs: number
  wallReadyAtMs: number | null
}

interface StartupProfileState {
  enabled: boolean
  marks: StartupProfileMark[]
  ready: boolean
  readyAtMs: number | null
  readyLabel: string
  wallReadyAtMs: number | null
}

let startupProfileState: StartupProfileState | null = null

export function startupProfilingEnabled() {
  return getStartupProfileState().enabled
}

export function markStartupProfile(name: string, detail?: Record<string, unknown>) {
  const state = getStartupProfileState()
  if (!state.enabled || state.ready) {
    return
  }

  const elapsedMs = performance.now()
  const previous = state.marks[state.marks.length - 1]
  const mark: StartupProfileMark = {
    name,
    elapsedMs,
    deltaMs: previous ? elapsedMs - previous.elapsedMs : elapsedMs,
    detail,
  }

  state.marks.push(mark)
  performance.mark(`diffly-startup:${name}`)
  publishStartupProfile()
}

export function finishStartupProfile(name: string, detail?: Record<string, unknown>) {
  const state = getStartupProfileState()
  if (!state.enabled || state.ready) {
    return
  }

  markStartupProfile(name, detail)
  state.ready = true
  state.readyAtMs = performance.now()
  state.readyLabel = name
  state.wallReadyAtMs = Date.now()
  publishStartupProfile()
  logStartupProfile()
}

export function finishStartupProfileAfterPaint(name: string, detail?: Record<string, unknown>) {
  if (!startupProfilingEnabled()) {
    return
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      finishStartupProfile(name, detail)
    })
  })
}

function getStartupProfileState() {
  if (startupProfileState) {
    return startupProfileState
  }

  startupProfileState = {
    enabled: readStartupProfileFlag(),
    marks: [],
    ready: false,
    readyAtMs: null,
    readyLabel: '',
    wallReadyAtMs: null,
  }
  publishStartupProfile()
  return startupProfileState
}

function readStartupProfileFlag() {
  if (typeof window === 'undefined') {
    return false
  }

  return new URLSearchParams(window.location.search).get('difflyStartupProfile') === '1'
}

function publishStartupProfile() {
  if (!startupProfileState || typeof window === 'undefined') {
    return
  }

  window.__difflyStartupProfile = {
    marks: [...startupProfileState.marks],
    ready: startupProfileState.ready,
    readyAtMs: startupProfileState.readyAtMs,
    readyLabel: startupProfileState.readyLabel,
    timeOriginMs: performance.timeOrigin,
    wallReadyAtMs: startupProfileState.wallReadyAtMs,
  }
}

function logStartupProfile() {
  if (!startupProfileState || typeof console === 'undefined') {
    return
  }

  console.log(`[diffly-startup-renderer] ${JSON.stringify({
    marks: startupProfileState.marks,
    ready: startupProfileState.ready,
    readyAtMs: startupProfileState.readyAtMs,
    readyLabel: startupProfileState.readyLabel,
    timeOriginMs: performance.timeOrigin,
    wallReadyAtMs: startupProfileState.wallReadyAtMs,
  })}`)
}
