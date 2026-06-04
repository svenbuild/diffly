import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import {
  applySuppressedScrollCorrection,
  clearScrollCorrectionTargets,
  shouldSuppressManualScrollCorrection,
} from '../src/lib/compare/scroll-correction-guard.ts'

function makeView() {
  return {
    pendingLayoutAnchor: { index: 10 },
    pendingScrollTarget: { id: 'old/file.ts' },
    renderState: {
      scrollTop: 0,
    },
    scrollAnimation: { active: true },
    scrollDirty: true,
    scrollPageOffset: 1200,
    scrollTop: 0,
  }
}

function measure(name, iterations, fn) {
  const started = performance.now()
  for (let index = 0; index < iterations; index += 1) {
    fn(index)
  }
  const elapsed = performance.now() - started
  return {
    elapsed,
    iterations,
    name,
    perOperation: elapsed / iterations,
  }
}

const now = 1000
const iterations = Number.parseInt(process.env.DIFFLY_SCROLL_GUARD_ITERATIONS ?? '1000000', 10)

const manualSuppression = shouldSuppressManualScrollCorrection({
  now,
  programmaticScrollAllowedUntil: 0,
  syncedScrollTop: 5000,
  targetScrollTop: 1400,
  userScrollCorrectionSuppressedUntil: now + 9000,
})
assert.equal(manualSuppression, true)

const programmaticScroll = shouldSuppressManualScrollCorrection({
  now,
  programmaticScrollAllowedUntil: now + 900,
  syncedScrollTop: 5000,
  targetScrollTop: 1400,
  userScrollCorrectionSuppressedUntil: now + 9000,
})
assert.equal(programmaticScroll, false)

const tinyCorrection = shouldSuppressManualScrollCorrection({
  now,
  programmaticScrollAllowedUntil: 0,
  syncedScrollTop: 5000,
  targetScrollTop: 5000.25,
  userScrollCorrectionSuppressedUntil: now + 9000,
})
assert.equal(tinyCorrection, false)

const expiredManualWindow = shouldSuppressManualScrollCorrection({
  now,
  programmaticScrollAllowedUntil: 0,
  syncedScrollTop: 5000,
  targetScrollTop: 1400,
  userScrollCorrectionSuppressedUntil: now - 1,
})
assert.equal(expiredManualWindow, false)

const view = makeView()
const keptScrollTop = applySuppressedScrollCorrection(view, 3800)
assert.equal(keptScrollTop, 5000)
assert.equal(view.scrollTop, 5000)
assert.equal(view.renderState.scrollTop, 5000)
assert.equal(view.scrollDirty, false)
assert.equal(view.pendingLayoutAnchor, undefined)
assert.equal(view.pendingScrollTarget, undefined)
assert.equal(view.scrollAnimation, undefined)

const clearView = makeView()
clearScrollCorrectionTargets(clearView)
assert.equal(clearView.pendingLayoutAnchor, undefined)
assert.equal(clearView.pendingScrollTarget, undefined)
assert.equal(clearView.scrollAnimation, undefined)

const suppressMeasure = measure('suppression predicate', iterations, (index) => {
  shouldSuppressManualScrollCorrection({
    now: now + index,
    programmaticScrollAllowedUntil: 0,
    syncedScrollTop: 5000,
    targetScrollTop: 1400,
    userScrollCorrectionSuppressedUntil: now + index + 9000,
  })
})

const applyMeasure = measure('suppressed correction apply', iterations, (index) => {
  const measuredView = {
    renderState: { scrollTop: 0 },
    scrollDirty: true,
    scrollPageOffset: index % 4096,
    scrollTop: 0,
  }
  applySuppressedScrollCorrection(measuredView, 3800)
})

console.log('scroll guard verification passed')
for (const result of [suppressMeasure, applyMeasure]) {
  console.log([
    result.name.padEnd(30),
    `iterations ${result.iterations}`.padStart(22),
    `total ${result.elapsed.toFixed(2)} ms`.padStart(18),
    `per op ${(result.perOperation * 1000).toFixed(4)} us`.padStart(18),
  ].join('  '))
}
