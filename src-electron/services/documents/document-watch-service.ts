import { watch, type FSWatcher } from 'node:fs'

const WATCH_DEBOUNCE_MS = 120

interface WatchRecord {
  watcher: FSWatcher
  timeout: NodeJS.Timeout | null
}

export class DocumentWatchService {
  private readonly watches = new Map<string, WatchRecord>()

  watch(id: string, path: string, onChange: () => void) {
    this.unwatch(id)
    const record: WatchRecord = {
      watcher: watch(path, { persistent: false }, () => {
        if (record.timeout !== null) clearTimeout(record.timeout)
        record.timeout = setTimeout(() => {
          record.timeout = null
          onChange()
        }, WATCH_DEBOUNCE_MS)
      }),
      timeout: null,
    }
    this.watches.set(id, record)
  }

  unwatch(id: string) {
    const record = this.watches.get(id)
    if (!record) return
    if (record.timeout !== null) clearTimeout(record.timeout)
    record.watcher.close()
    this.watches.delete(id)
  }

  dispose() {
    for (const id of this.watches.keys()) this.unwatch(id)
  }
}
