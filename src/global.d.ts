import type {
  BinaryDiffPayload,
  CompareOptions,
  CompareResponse,
  DirectoryListing,
  ExplorerEntry,
  FileDiffResult,
  LaunchContext,
  PathInfo,
  PathKind,
  PersistedSession,
  PollDirectoryCompareResponse,
  StartDirectoryCompareResponse,
  UpdateActionResult,
  UpdateChannel,
  UpdateCheckResult,
} from './lib/types'

declare global {
  interface Window {
    diffly: {
      choosePath(kind: PathKind): Promise<string | null>
      listRoots(): Promise<ExplorerEntry[]>
      listDirectory(path: string): Promise<DirectoryListing>
      pathInfo(path: string): Promise<PathInfo>
      loadSessionState(): Promise<PersistedSession | null>
      loadLaunchContext(): Promise<LaunchContext | null>
      onLaunchContext(callback: (context: LaunchContext) => void): () => void
      saveSessionState(session: PersistedSession): Promise<void>
      getAppVersion(): Promise<string>
      checkForUpdates(channel: UpdateChannel): Promise<UpdateCheckResult>
      downloadUpdate(channel: UpdateChannel): Promise<UpdateActionResult>
      installUpdate(channel: UpdateChannel): Promise<UpdateActionResult>
      comparePaths(
        leftPath: string,
        rightPath: string,
        mode: 'file' | 'directory',
        options: CompareOptions,
      ): Promise<CompareResponse>
      startDirectoryCompare(
        leftPath: string,
        rightPath: string,
        options: CompareOptions,
      ): Promise<StartDirectoryCompareResponse>
      pollDirectoryCompare(jobId: string): Promise<PollDirectoryCompareResponse>
      openCompareItem(
        leftBase: string,
        rightBase: string,
        relativePath: string,
        options: CompareOptions,
      ): Promise<FileDiffResult>
      loadBinaryPreview(
        leftPath: string,
        rightPath: string,
        options: CompareOptions,
      ): Promise<BinaryDiffPayload>
      fileUrl(path: string): string
    }
  }
}

export {}
