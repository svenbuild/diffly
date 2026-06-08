import { contextBridge, ipcRenderer } from 'electron'
import type {
  CompareOptions,
  DiffEntryFilter,
  DiffSource,
  PathKind,
  PersistedSession,
  RecentSources,
  UpdateChannel,
} from '../src/lib/types'

const invoke = <T>(channel: string, payload?: unknown) =>
  ipcRenderer.invoke(channel, payload) as Promise<T>

contextBridge.exposeInMainWorld('diffly', {
  choosePath: (kind: PathKind) =>
    invoke('diffly:choosePath', { kind }),
  listRoots: () =>
    invoke('diffly:listRoots'),
  listDirectory: (path: string) =>
    invoke('diffly:listDirectory', { path }),
  pathInfo: (path: string) =>
    invoke('diffly:pathInfo', { path }),
  loadSessionState: () =>
    invoke('diffly:loadSessionState'),
  loadLaunchContext: () =>
    invoke('diffly:loadLaunchContext'),
  onLaunchContext: (callback: (context: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, context: unknown) => {
      callback(context)
    }
    ipcRenderer.on('diffly:launchContext', listener)
    return () => {
      ipcRenderer.removeListener('diffly:launchContext', listener)
    }
  },
  saveSessionState: (session: PersistedSession) =>
    invoke('diffly:saveSessionState', { session }),
  loadRecentSources: () =>
    invoke<RecentSources>('diffly:loadRecentSources'),
  addRecentSource: (
    source: DiffSource,
    metadata?: unknown,
  ) =>
    invoke<RecentSources>('diffly:addRecentSource', { source, metadata }),
  removeRecentSource: (id: string) =>
    invoke<RecentSources>('diffly:removeRecentSource', { id }),
  getAppVersion: () =>
    invoke('diffly:getAppVersion'),
  checkForUpdates: (channel: UpdateChannel) =>
    invoke('diffly:checkForUpdates', { channel }),
  downloadUpdate: (channel: UpdateChannel) =>
    invoke('diffly:downloadUpdate', { channel }),
  installUpdate: (channel: UpdateChannel) =>
    invoke('diffly:installUpdate', { channel }),
  comparePaths: (
    leftPath: string,
    rightPath: string,
    mode: 'file' | 'directory',
    options: CompareOptions,
  ) =>
    invoke('diffly:comparePaths', { leftPath, rightPath, mode, options }),
  startDirectoryCompare: (
    leftPath: string,
    rightPath: string,
    options: CompareOptions,
  ) =>
    invoke('diffly:startDirectoryCompare', { leftPath, rightPath, options }),
  pollDirectoryCompare: (jobId: string) =>
    invoke('diffly:pollDirectoryCompare', { jobId }),
  cancelDirectoryCompare: (jobId: string) =>
    invoke('diffly:cancelDirectoryCompare', { jobId }),
  openCompareItem: (
    leftBase: string,
    rightBase: string,
    relativePath: string,
    options: CompareOptions,
  ) =>
    invoke('diffly:openCompareItem', {
      leftBase,
      rightBase,
      relativePath,
      options,
    }),
  createDiffSession: (
    source: DiffSource,
    options: CompareOptions,
  ) =>
    invoke('diffly:createDiffSession', { source, options }),
  listDiffEntries: (
    sessionId: string,
    filter?: DiffEntryFilter,
  ) =>
    invoke('diffly:listDiffEntries', { sessionId, filter }),
  openDiffEntry: (
    sessionId: string,
    entryId: string,
    options: CompareOptions,
  ) =>
    invoke('diffly:openDiffEntry', { sessionId, entryId, options }),
  refreshDiffSession: (sessionId: string) =>
    invoke('diffly:refreshDiffSession', { sessionId }),
  disposeDiffSession: (sessionId: string) =>
    invoke('diffly:disposeDiffSession', { sessionId }),
})
