# Contributing

## Workflow

1. Start from an up-to-date branch based on `main`.
2. Use a focused branch name such as `feature/...`, `fix/...`, `chore/...`, `refactor/...`, or `docs/...`.
3. Keep each commit to one logical unit of work.
4. Push each commit so the remote branch stays current.
5. Open a pull request against `main`.

## Local Validation

Run the validation path before opening or updating a pull request:

```bash
npm run check
npm test
```

## Release Validation

Before publishing a tagged release, update `package.json`, `package-lock.json`, and `CHANGELOG.md`, then run the relevant release checks:

```bash
npm run check
npm run build
npm run electron:package
```

Publish releases from `main` with a `v*` tag. The GitHub release workflow builds and publishes the Windows installer and portable artifact.
