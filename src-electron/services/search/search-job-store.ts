import type { SearchBatch, SearchMatch } from '../../../src/lib/search-types'

const POLL_BATCH_SIZE = 200
const MAX_BUFFERED_RESULTS = 5_000

export interface SearchJob {
  matches: SearchMatch[]
  scannedDocuments: number
  totalDocuments: number
  totalMatches: number
  done: boolean
  cancelled: boolean
  error: string | null
  drainWaiters: Array<() => void>
}

export class SearchJobStore {
  private readonly jobs = new Map<string, SearchJob>()

  add(id: string, totalDocuments: number) {
    const job: SearchJob = {
      matches: [],
      scannedDocuments: 0,
      totalDocuments,
      totalMatches: 0,
      done: false,
      cancelled: false,
      error: null,
      drainWaiters: [],
    }
    this.jobs.set(id, job)
    return job
  }

  get(id: string) {
    const job = this.jobs.get(id)
    if (!job) throw new Error('Search job was not found.')
    return job
  }

  poll(id: string): SearchBatch {
    const job = this.get(id)
    const matches = job.matches.splice(0, POLL_BATCH_SIZE)
    if (job.matches.length < MAX_BUFFERED_RESULTS / 2) {
      for (const resolve of job.drainWaiters.splice(0)) resolve()
    }
    const result = {
      matches,
      scannedDocuments: job.scannedDocuments,
      totalDocuments: job.totalDocuments,
      totalMatches: job.totalMatches,
      done: job.done && job.matches.length === 0,
      cancelled: job.cancelled,
      error: job.error,
    }
    if (result.done) this.jobs.delete(id)
    return result
  }

  cancel(id: string) {
    const job = this.get(id)
    job.cancelled = true
    job.done = true
    job.matches = []
    for (const resolve of job.drainWaiters.splice(0)) resolve()
  }

  async waitForCapacity(job: SearchJob) {
    if (job.matches.length < MAX_BUFFERED_RESULTS || job.cancelled) return
    await new Promise<void>((resolve) => job.drainWaiters.push(resolve))
  }
}
