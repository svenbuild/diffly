# Diffly

Diffly is a desktop diff viewer for comparing files and directories on Windows.

It pairs a Svelte frontend with a Tauri backend and focuses on fast local comparisons, side-by-side review, and practical directory browsing instead of a Git-centric workflow.

## Features

- Compare two files directly or compare two directories recursively.
- Browse folders from a dual-pane setup screen with back, forward, and up navigation.
- Review diffs in side-by-side or unified view.
- Jump between diff hunks with `Previous difference` and `Next difference`.
- Toggle full-file rendering, inline highlights, ignore-whitespace, and ignore-case options.
- Filter directory results by status such as modified, left only, right only, binary, and too large.
- Preserve session state for compare mode, theme, and viewer preferences between launches.
- Fall back to status-only output for binary files and large text files.

## Tech Stack

- Svelte 5
- TypeScript
- Vite
- Tauri 2
- Rust

## Development

### Prerequisites

- Node.js 20+
- Rust toolchain
- Tauri build prerequisites for your platform

On Windows, install the Visual Studio C++ build tools and WebView2 runtime if they are not already present.

### Install dependencies

```bash
npm install
```

### Run the desktop app in development

```bash
npm run tauri:dev
```

### Run checks

```bash
npm run check
```

### Build the web bundle

```bash
npm run build
```

### Build the desktop application

```bash
npm run tauri:build
```

Tauri outputs the packaged artifacts under `src-tauri/target/release/bundle/`.

## Repository Notes

- `src/` contains the Svelte application.
- `src-tauri/` contains the native commands, file-system access, and application packaging config.
- `test-fixtures/` contains local compare fixtures used to exercise directory and diff behavior.

## License

MIT. See [LICENSE](./LICENSE).
