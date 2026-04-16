# Diffly Workspace Rules

## Scope

These rules apply to the whole repository. `AGENTS.md` and `CLAUDE.MD` must stay identical unless a task explicitly requires different content.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures.

That includes session restore, reconnects, partial streams, repeated commands, and large file or directory comparisons.

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Product Context

Diffly is a desktop local file and directory diff tool built with Svelte, TypeScript, and Tauri. Optimize for:

- fast navigation across large directory trees
- stable rendering for large diffs and binary previews
- deterministic merge and compare behavior
- desktop workflows that survive restarts and failed operations cleanly

## Architecture Expectations

- Prefer one clear source of truth for compare state, selection state, and long-running operation state.
- Keep UI state derived when possible. Avoid duplicating the same state across components, stores, and controller layers.
- Make restart and reconnect paths idempotent. Replaying initialization or resume logic must not corrupt state or duplicate work.
- Treat partial results as first-class states. Never assume streams complete cleanly.
- Fail closed and visibly. If an operation cannot finish safely, preserve current state, surface the failure, and keep recovery paths obvious.

## Performance Rules

- Assume files, diffs, and directory trees can be large.
- Avoid accidental `O(n^2)` work in hot paths such as diff painting, scroll syncing, minimap generation, filtering, and tree traversal.
- Do not recompute expensive derived data on every render when it can be cached, streamed, or incrementally updated.
- Avoid unnecessary DOM churn. Preserve stable keys and avoid resetting scroll or selection without a strong reason.
- Measure impact when changing rendering, syntax highlighting, diff chunking, or minimap logic.

## Maintainability

Long-term maintainability is a core priority.

- Extract shared logic instead of copying behavior into multiple components or controllers.
- Prefer changing existing abstractions over adding one-off local exceptions.
- Keep modules focused. Split files once they start mixing unrelated responsibilities.
- Add comments only where intent is not obvious from the code.
- Keep naming literal and boring. Do not invent vague abstractions for concrete diff behavior.

## Frontend And Desktop Guardrails

- Preserve existing UX patterns unless there is a clear product reason to change them.
- Keep loading, empty, error, and cancellation states explicit.
- Do not silently discard user context such as selected file, expanded tree state, scroll position, or merge intent unless required for correctness.
- When wiring frontend to Tauri commands, handle timeout, cancellation, malformed payloads, and stale responses deliberately.
- Keep desktop-specific behavior predictable across restart, update, and offline use.

## Git Workflow

### Branching

- Manage git proactively.
- Create a branch for non-trivial work instead of working directly on `main`.
- Check `git status` before editing anything.
- Never mix unrelated user changes into your commit. Stage only the files relevant to your work.

### Commit And Push

- If any file changed during a turn, commit and push before ending that turn.
- Treat commit plus push as mandatory completion criteria, not optional cleanup.
- Commit logical units of work as they complete.
- Push each commit after creating it.
- Do not leave local unpushed work from your own changes at the end of a turn.
- Keep commit messages specific to behavior or scope changed.
- If the tree is dirty, verify your staged diff before every commit.

### Merge Back To Main

- When branch work is complete and verified, proactively evaluate whether it should be landed on the repository's real default branch.
- Before merging, verify the git toplevel, the remote default branch, the current branch ancestry, and the repository tree layout.
- If the working branch shares history and layout with the real default branch, merge it and push `main` yourself.
- If histories are unrelated, roots differ, or the merge would relocate the project tree, do not force a direct merge.
- In that case, create a fresh integration branch from the real default branch, transplant the finished changes into the correct tree layout, verify them there, and then push that result to `main`.
- If the repository state is ambiguous or unsafe for an automatic landing, report that explicitly instead of stopping silently at branch-only commits.

## Doc Sync Rule

When editing this file, copy the final content to `CLAUDE.MD` in the same task unless the user explicitly says not to.
