import { spawn } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const DEFAULT_GIT_TIMEOUT_MS = 15_000
const DEFAULT_GIT_STDOUT_LIMIT_BYTES = 1024 * 1024 * 8
const DEFAULT_GIT_STDERR_LIMIT_BYTES = 1024 * 1024
const MAX_GIT_STDIN_BYTES = 64 * 1024 * 1024

export interface GitRunOptions {
  timeoutMs?: number
  maxStdoutBytes?: number
  maxStderrBytes?: number
  allowNonZeroExit?: boolean
  stdin?: Uint8Array | string
}

export interface GitRunResult {
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
}

export interface GitRunBytesResult {
  stdout: Uint8Array
  stderr: string
  exitCode: number
  timedOut: boolean
}

interface NormalizedGitRunOptions {
  timeoutMs: number
  maxStdoutBytes: number
  maxStderrBytes: number
  allowNonZeroExit: boolean
  stdin?: Uint8Array | string
}

export interface ValidatedGitRunner {
  run(args: string[], options?: GitRunOptions): Promise<GitRunResult>
  runBytes(args: string[], options?: GitRunOptions): Promise<GitRunBytesResult>
}

export async function runGit(
  repoPath: string,
  args: string[],
  options?: GitRunOptions,
): Promise<GitRunResult> {
  const runner = await createGitRunner(repoPath)
  return runner.run(args, options)
}

export async function runGitBytes(
  repoPath: string,
  args: string[],
  options?: GitRunOptions,
): Promise<GitRunBytesResult> {
  const runner = await createGitRunner(repoPath)
  return runner.runBytes(args, options)
}

export async function createGitRunner(repoPath: string): Promise<ValidatedGitRunner> {
  return new GitRunner(await validateGitRepoPath(repoPath))
}

class GitRunner implements ValidatedGitRunner {
  private readonly canonicalRepoPath: string

  constructor(canonicalRepoPath: string) {
    this.canonicalRepoPath = canonicalRepoPath
  }

  async run(args: string[], options?: GitRunOptions): Promise<GitRunResult> {
    const result = await this.runBytes(args, options)
    return {
      stdout: Buffer.from(
        result.stdout.buffer,
        result.stdout.byteOffset,
        result.stdout.byteLength,
      ).toString('utf8'),
      stderr: result.stderr,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
    }
  }

  runBytes(args: string[], options?: GitRunOptions): Promise<GitRunBytesResult> {
    const gitArgs = validateGitArgs(args)
    const runOptions = normalizeGitRunOptions(options)

    return new Promise<GitRunBytesResult>((resolveRun, rejectRun) => {
      const child = spawn('git', gitArgs, {
        cwd: this.canonicalRepoPath,
        shell: false,
        windowsHide: true,
      })

      if (runOptions.stdin !== undefined) {
        child.stdin.end(runOptions.stdin)
      }

      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []
      let stdoutBytes = 0
      let stderrBytes = 0
      let timedOut = false
      let failure: Error | null = null
      let closeHandled = false

      const timeoutId = setTimeout(() => {
        if (failure) {
          return
        }

        timedOut = true
        failure = new Error(`Git command timed out after ${runOptions.timeoutMs}ms.`)
        child.kill()
      }, runOptions.timeoutMs)

      child.stdout.on('data', (chunk: Buffer) => {
        if (failure) {
          return
        }

        stdoutBytes += chunk.byteLength
        if (stdoutBytes > runOptions.maxStdoutBytes) {
          failure = new Error('Git command exceeded stdout buffer limit.')
          child.kill()
          return
        }

        stdoutChunks.push(chunk)
      })

      child.stderr.on('data', (chunk: Buffer) => {
        if (failure) {
          return
        }

        stderrBytes += chunk.byteLength
        if (stderrBytes > runOptions.maxStderrBytes) {
          failure = new Error('Git command exceeded stderr buffer limit.')
          child.kill()
          return
        }

        stderrChunks.push(chunk)
      })

      child.on('error', (error: NodeJS.ErrnoException) => {
        if (failure) {
          return
        }

        failure = error.code === 'ENOENT'
          ? new Error('Git executable was not found. Ensure Git is installed and available on PATH.')
          : new Error(`Failed to start Git command: ${error.message}`)
      })

      child.on('close', (code, signal) => {
        if (closeHandled) {
          return
        }
        closeHandled = true
        clearTimeout(timeoutId)

        const stdout = Buffer.concat(stdoutChunks)
        const stderr = Buffer.concat(stderrChunks).toString('utf8')

        if (failure) {
          rejectRun(failure)
          return
        }

        if (code === 0) {
          resolveRun({
            stdout: Uint8Array.prototype.slice.call(stdout, 0),
            stderr,
            exitCode: code,
            timedOut,
          })
          return
        }

        if (typeof code === 'number') {
          if (runOptions.allowNonZeroExit) {
            resolveRun({
              stdout: Uint8Array.prototype.slice.call(stdout, 0),
              stderr,
              exitCode: code,
              timedOut,
            })
            return
          }

          rejectRun(new Error(`Git command failed with exit code ${code}: ${gitErrorOutput(stdout.toString('utf8'), stderr)}`))
          return
        }

        if (signal) {
          rejectRun(new Error(`Git command was terminated by signal ${signal}.`))
          return
        }

        rejectRun(new Error('Git command failed before producing an exit code.'))
      })
    })
  }
}

async function validateGitRepoPath(repoPath: string) {
  if (typeof repoPath !== 'string' || !repoPath.trim()) {
    throw new Error('Git repository path is required.')
  }

  if (repoPath.includes('\0')) {
    throw new Error('Git repository path contains an invalid character.')
  }

  let canonicalPath: string
  try {
    canonicalPath = await realpath(resolve(repoPath))
  } catch {
    throw new Error('Git repository path does not exist or cannot be accessed.')
  }

  let pathInfo
  try {
    pathInfo = await stat(canonicalPath)
  } catch {
    throw new Error('Git repository path does not exist or cannot be accessed.')
  }

  if (!pathInfo.isDirectory()) {
    throw new Error('Git repository path must be a directory.')
  }

  return canonicalPath
}

function validateGitArgs(args: string[]) {
  if (!Array.isArray(args)) {
    throw new Error('Git arguments must be provided as an array.')
  }

  if (args.length === 0) {
    throw new Error('Git arguments must not be empty.')
  }

  for (const [index, arg] of args.entries()) {
    if (typeof arg !== 'string') {
      throw new Error(`Git argument at index ${index} must be a string.`)
    }

    if (arg.includes('\0')) {
      throw new Error(`Git argument at index ${index} contains an invalid character.`)
    }
  }

  return [...args]
}

function normalizeGitRunOptions(options?: GitRunOptions): NormalizedGitRunOptions {
  if (
    options?.stdin !== undefined &&
    Buffer.byteLength(options.stdin) > MAX_GIT_STDIN_BYTES
  ) {
    throw new Error('Git stdin exceeds the supported size limit.')
  }
  return {
    timeoutMs: normalizePositiveNumber(
      options?.timeoutMs,
      DEFAULT_GIT_TIMEOUT_MS,
      'Git timeout must be a positive number.',
    ),
    maxStdoutBytes: normalizePositiveNumber(
      options?.maxStdoutBytes,
      DEFAULT_GIT_STDOUT_LIMIT_BYTES,
      'Git stdout buffer limit must be a positive number.',
    ),
    maxStderrBytes: normalizePositiveNumber(
      options?.maxStderrBytes,
      DEFAULT_GIT_STDERR_LIMIT_BYTES,
      'Git stderr buffer limit must be a positive number.',
    ),
    allowNonZeroExit: options?.allowNonZeroExit === true,
    stdin: options?.stdin,
  }
}

function normalizePositiveNumber(
  value: number | undefined,
  defaultValue: number,
  errorMessage: string,
) {
  if (value === undefined) {
    return defaultValue
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(errorMessage)
  }

  return Math.trunc(value)
}

function gitErrorOutput(stdout: string, stderr: string) {
  return stderr.trim() || stdout.trim() || 'No error output was produced.'
}
