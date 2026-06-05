# Maintenance Review Points

This note records structural risk areas found during the focused maintainability audit.
These paths should not be removed or simplified without targeted regression coverage.

## Fallbacks To Preserve

- Directory compare retry, polling, cancellation, and stale-job handling.
  These paths protect long-running compares, partial results, and user cancellation.
- Session restore and malformed persisted state recovery.
  Startup must tolerate missing, stale, or corrupt session data without blocking the app.
- Startup folder override and launch-context handling.
  These paths support desktop open-with workflows and repeated launch events.
- Directory traversal and filesystem stat fallbacks.
  Missing files, inaccessible drives, and changing directories are expected desktop states.
- Development-build update fallbacks.
  Update commands intentionally return unavailable payloads in unpackaged builds.
- File read and binary/text detection fallbacks.
  Read errors, large files, binary samples, and unsupported file types must remain visible and deterministic.

## Refactor Order

1. Add behavioral tests around session restore, startup override handling, and directory compare polling.
2. Split explorer listing and launch-context services from `src-electron/services/backend.ts`.
3. Split file-diff and directory-compare services only after cache-key and cancellation tests exist.
4. Split `src/App.svelte` orchestration further only after tests cover run-compare, selection restore, and stale async responses.
5. Keep virtual scrolling, worker lifecycle, and CodeView item patching in `PierreDirectoryVirtualDiffView.svelte` until rendering regression coverage exists.
