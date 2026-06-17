import { describe, expect, it } from 'vitest'
import {
  resolveDiffWorkerPoolSize,
  resolveDirectoryDiffLoadConcurrency,
} from './diff-concurrency'

describe('diff concurrency', () => {
  it('keeps Pierre render workers adaptive and bounded', () => {
    expect(resolveDiffWorkerPoolSize(1)).toBe(2)
    expect(resolveDiffWorkerPoolSize(4)).toBe(2)
    expect(resolveDiffWorkerPoolSize(8)).toBe(4)
    expect(resolveDiffWorkerPoolSize(16)).toBe(6)
  })

  it('keeps directory detail loads parallel but conservative', () => {
    expect(resolveDirectoryDiffLoadConcurrency(1)).toBe(2)
    expect(resolveDirectoryDiffLoadConcurrency(4)).toBe(2)
    expect(resolveDirectoryDiffLoadConcurrency(8)).toBe(4)
    expect(resolveDirectoryDiffLoadConcurrency(16)).toBe(4)
  })
})
