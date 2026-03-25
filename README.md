# Diffly

Diffly is a desktop file and directory diff tool built with Svelte, TypeScript, and Tauri. It focuses on fast local comparisons, folder-aware result browsing, inline token highlights, and persistent compare sessions.

## Highlights

- Compare two files directly or compare two directory trees.
- Browse drives and folders from inside the app before choosing compare targets.
- Filter changed directory entries by status.
- Switch between side-by-side and unified diff views.
- Ignore whitespace and case differences during compare.
- Persist the current workspace, theme, and navigation state between launches.

## Quick Start

Install dependencies:

```bash
npm install
```

Start the desktop app in development mode:

```bash
npm run tauri:dev
```

## Development

Run the frontend checks:

```bash
npm run check
```

Run the Rust test suite:

```bash
npm test
```

Build a fast desktop binary for local verification:

```bash
npm run tauri:build
```

Build a release binary without packaging installers:

```bash
npm run tauri:build:release
```

Build the standard Windows installer:

```bash
npm run tauri:package
```

Build every configured installer target:

```bash
npm run tauri:package:all
```

## Project Structure

- `src/App.svelte`: app-level state and screen orchestration.
- `src/lib/PickerPane.svelte`: explorer and target-selection pane UI.
- `src/lib/DirectoryBrowser.svelte`: changed-file browser for directory compares.
- `src/lib/DiffViewer.svelte`: side-by-side and unified diff rendering.
- `src/lib/api.ts`: frontend bridge to Tauri commands.
- `src-tauri/src/lib.rs`: filesystem access, compare logic, session persistence, and diff generation.
- `test-fixtures/`: reusable fixtures for directory and diff behavior tests.

## Validation

The current validation path is:

- `npm run check`
- `npm test`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`

## Notes

- `npm run tauri:build` now uses a debug, no-bundle path to keep local desktop builds fast.
- `npm run tauri:package` keeps installer generation separate so packaging does not slow down every build.
- Release Rust builds keep incremental artifacts enabled and use `opt-level = 2` to cut compile time without falling all the way back to debug codegen.
- Large text diffs are capped at 1 MB per file.
- Binary files are detected automatically and shown as status-only entries.
