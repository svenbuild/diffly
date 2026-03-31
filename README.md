# Diffly

Diffly is a desktop diff tool for local file and folder comparisons. It is built with Svelte, TypeScript, and Tauri, with a focus on fast navigation, readable diffs, and a straightforward desktop workflow.

## Features

- Compare individual files or whole directory trees.
- Browse changed entries with directory-aware filtering.
- Switch between side-by-side and unified diff views.
- Merge text hunks selectively when resolving file differences.
- Preview images visually and inspect binary files in a hex view.
- Persist the current compare session and app state locally.
- Check for signed app updates from GitHub releases.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the desktop app in development mode:

```bash
npm run tauri:dev
```

## Validation

Run the standard validation path before pushing changes:

```bash
npm run check
npm test
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## Build

Build a fast local desktop binary:

```bash
npm run tauri:build
```

Build a release binary without packaging:

```bash
npm run tauri:build:release
```

Build the Windows installer:

```bash
npm run tauri:package
```

Tagged releases are published through GitHub Actions and provide the updater artifacts used by the app.

## Project Links

- Contribution workflow: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security reporting: [SECURITY.md](SECURITY.md)
