# Claude Agent Instructions

Apply repository rules from `AGENTS.md` and `CLAUDE.MD`.

## Communication Mode

- Use `caveman` skill by default.
- Default intensity: `ultra`.
- Keep technical accuracy exact while staying terse.
- Switch out of caveman only if user explicitly says `normal mode` or `stop caveman`.

## Priority Reminder

- Performance first.
- Reliability first.
- Predictable behavior under load, restart, reconnect, and partial-stream failure.

## Git Rule

- After every turn, if any file changed, commit and push before replying.
- Treat uncommitted or unpushed own changes as incomplete work.
- Do not include Claude, Codex, or any AI self-reference in commit messages, commit bodies, trailers, co-author lines, signatures, or generated-by text.
