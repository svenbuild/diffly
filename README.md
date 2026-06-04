# Diffly

Diffly is a desktop diff tool for local file and folder comparisons. It is built with Svelte, TypeScript, and Electron, with a focus on fast navigation, readable diffs, and a straightforward desktop workflow.

Current release: `v0.2.0`

## Features

- Compare individual files or whole directory trees.
- Browse changed entries with directory-aware filtering.
- Switch between side-by-side and unified diff views.
- Merge text hunks selectively when resolving file differences.
- Preview images visually and inspect binary files in a hex view.
- Open one directory diff file at a time while the remaining file diffs load in the background cache.
- Use virtual rendering for large text diffs, directory diffs, and binary previews.
- Persist the current compare session and app state locally.
- Check for signed app updates from GitHub releases.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the desktop app in development mode:

```bash
npm run electron:dev
```

## Validation

Run the standard validation path before pushing changes:

```bash
npm run check
npm test
```

## Build

Build a fast local desktop binary:

```bash
npm run electron:build
```

Build the Windows installer:

```bash
npm run electron:package
```

Build installers for all supported local targets:

```bash
npm run electron:package:all
```

Tagged releases are published through GitHub Actions and provide the updater artifacts used by the app.

## Releases

Release notes are tracked in [CHANGELOG.md](CHANGELOG.md). The `v0.2.0` release includes the full change history since `v0.1.5`, including the Electron migration, Compare view performance work, virtualized directory and binary diff rendering, updater fixes, and Windows installer/portable packaging.

## Project Links

- Changelog: [CHANGELOG.md](CHANGELOG.md)
- Contribution workflow: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security reporting: [SECURITY.md](SECURITY.md)
