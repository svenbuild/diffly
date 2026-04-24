import { contextBridge, ipcRenderer } from 'electron'
import { pathToFileURL } from 'node:url'
import type {
  CompareOptions,
  PathKind,
  PersistedSession,
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
  saveSessionState: (session: PersistedSession) =>
    invoke('diffly:saveSessionState', { session }),
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
  loadBinaryPreview: (
    leftPath: string,
    rightPath: string,
    options: CompareOptions,
  ) =>
    invoke('diffly:loadBinaryPreview', { leftPath, rightPath, options }),
  fileUrl: (path: string) => pathToFileURL(path).toString(),
})
