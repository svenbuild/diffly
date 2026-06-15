const STORAGE_KEY = 'diffly:compareTiming'
const RUN_TIMEOUT_MS = 120000

interface CompareTimingMark {
  detail: Record<string, unknown> | undefined
  elapsedMs: number
  name: string
  timestamp: number
}

interface CompareTimingRun {
  finished: boolean
  id: number
  label: string
  marks: CompareTimingMark[]
  seenMarks: Set<string>
  start: number
  timeout: number | null
}

let activeRun: CompareTimingRun | null = null
let nextRunId = 1

export function compareTimingEnabled() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    const flag = window.localStorage.getItem(STORAGE_KEY)
    return flag === '1' || flag === 'true'
  } catch {
    return false
  }
}

export function startCompareTiming(label: string, detail?: Record<string, unknown>) {
  if (!compareTimingEnabled()) {
    clearActiveRunTimeout()
    activeRun = null
    return
  }

  clearActiveRunTimeout()
  const run: CompareTimingRun = {
    finished: false,
    id: nextRunId,
    label,
    marks: [],
    seenMarks: new Set(),
    start: performance.now(),
    timeout: null,
  }
  nextRunId += 1
  activeRun = run
  performance.mark(markName(run, 'start'))
  console.info(`[Diffly timing #${run.id}] ${label} started`, detail ?? {})
  markCompareTiming('compare-start', detail)
  run.timeout = window.setTimeout(() => {
    if (activeRun === run && !run.finished) {
      console.warn(`[Diffly timing #${run.id}] still waiting for first rendered diff`, timingRows(run))
    }
  }, RUN_TIMEOUT_MS)
}

export function markCompareTiming(
  name: string,
  detail?: Record<string, unknown>,
) {
  const run = activeRun
  if (!run || run.finished) {
    return
  }

  addMark(run, name, detail)
}

export function markCompareTimingOnce(
  name: string,
  detail?: Record<string, unknown>,
) {
  const run = activeRun
  if (!run || run.finished || run.seenMarks.has(name)) {
    return
  }

  run.seenMarks.add(name)
  addMark(run, name, detail)
}

export function finishCompareTimingOnNextFrame(
  name: string,
  detail?: Record<string, unknown>,
) {
  const run = activeRun
  if (!run || run.finished || run.seenMarks.has(name)) {
    return
  }

  run.seenMarks.add(name)
  window.requestAnimationFrame(() => {
    if (activeRun === run && !run.finished) {
      finishCompareTiming(name, detail)
    }
  })
}

export function finishCompareTiming(
  name: string,
  detail?: Record<string, unknown>,
) {
  const run = activeRun
  if (!run || run.finished) {
    return
  }

  addMark(run, name, detail)
  run.finished = true
  clearActiveRunTimeout()

  const totalMs = performance.now() - run.start
  performance.measure(measureName(run, 'total'), markName(run, 'start'), markName(run, name))
  console.info(`[Diffly timing #${run.id}] ${run.label} first diff ready in ${formatMs(totalMs)}`)
  console.table(timingRows(run))
  activeRun = null
}

function addMark(
  run: CompareTimingRun,
  name: string,
  detail?: Record<string, unknown>,
) {
  const timestamp = performance.now()
  const elapsedMs = timestamp - run.start
  run.marks.push({
    detail,
    elapsedMs,
    name,
    timestamp,
  })
  performance.mark(markName(run, name))
  console.info(`[Diffly timing #${run.id}] +${formatMs(elapsedMs)} ${name}`, detail ?? {})
}

function timingRows(run: CompareTimingRun) {
  let previousElapsedMs = 0
  return run.marks.map((mark) => {
    const row = {
      mark: mark.name,
      elapsedMs: Math.round(mark.elapsedMs),
      deltaMs: Math.round(mark.elapsedMs - previousElapsedMs),
      detail: mark.detail ? JSON.stringify(mark.detail) : '',
    }
    previousElapsedMs = mark.elapsedMs
    return row
  })
}

function clearActiveRunTimeout() {
  const run = activeRun
  if (run && run.timeout !== null) {
    window.clearTimeout(run.timeout)
    run.timeout = null
  }
}

function markName(run: CompareTimingRun, name: string) {
  return `diffly.compare.${run.id}.${name}`
}

function measureName(run: CompareTimingRun, name: string) {
  return `diffly.compare.${run.id}.${name}`
}

function formatMs(value: number) {
  return `${Math.round(value)}ms`
}
