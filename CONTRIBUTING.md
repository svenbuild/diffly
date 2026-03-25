# Contributing

## Workflow

1. Start from an up-to-date branch based on `main`.
2. Use a focused branch name such as `feature/...`, `fix/...`, `chore/...`, `refactor/...`, or `docs/...`.
3. Keep changes scoped to one logical unit of work per commit.
4. Push each commit so the remote branch stays current.
5. Open a pull request against `main`.

## Local Validation

Run the full validation path before opening or updating a pull request:

```bash
npm run check
npm test
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## Repository Hygiene

- Check `git status` before and after meaningful work.
- Do not commit generated build outputs or scratch files.
- Keep `main` aligned with `origin/main`.
- Delete stale branches after they are merged or abandoned.
