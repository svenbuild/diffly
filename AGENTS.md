# Workspace Rules

## Git Workflow

### Commit And Push

- Manage git proactively.
- Create branches for non-trivial work instead of working directly on `main`.
- Commit logical units of work as they complete.
- Push each commit after creating it.

### Merge Back To Main

- When branch work is complete and verified, proactively evaluate whether it should be landed on the repository's real default branch.
- Before merging, verify the git toplevel, the remote default branch, the current branch ancestry, and the repository tree layout.
- If the working branch shares history and layout with the real default branch, merge it and push `main` yourself.
- If histories are unrelated, roots differ, or the merge would relocate the project tree, do not force a direct merge.
- In that case, create a fresh integration branch from the real default branch, transplant the finished changes into the correct tree layout, verify them there, and then push that result to `main`.
- If the repository state is ambiguous or unsafe for an automatic landing, report that explicitly instead of stopping silently at branch-only commits.


## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.
