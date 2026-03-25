## Real Asset Provenance

These binary fixtures are based on files downloaded on 2026-03-25 and checked into
the repository so binary and image comparison tests exercise real-world payloads.

### `real-jq.exe`

- Source URL: `https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-windows-amd64.exe`
- Left fixture: exact downloaded file
- Right fixture: copied from the same download, then bytes were toggled at offsets `512`,
  `4096`, `8192`, `16384`, and `32768` to produce a stable binary diff without bloating
  the fixture size

### `real-topic.png`

- Left source URL: `https://raw.githubusercontent.com/github/explore/main/topics/rust/rust.png`
- Right source URL: `https://raw.githubusercontent.com/github/explore/main/topics/typescript/typescript.png`
