# Desktop Comparison Tool Capabilities

A desktop application for comparing files, directory trees, and code changes from local repositories or public GitHub sources. Its built-in functions cover difference analysis, text editing, selective change application, code review, search and replacement, and Git conflict resolution.

The application is intended for developers reviewing changes and anyone reconciling different versions of local files or folders. The requirements below describe functional scope without prescribing screen layouts or a particular sequence of interactions.

## File and directory comparison

- Compare two local text files or recursively compare two directory trees.
- Identify modified content, files present on only one side, and optionally unchanged files.
- Reverse the comparison direction for local sources.
- Support comparison options for ignoring whitespace and letter case.
- Calculate file counts, additions, deletions, and line statistics, with partial totals distinguished from completed results.
- Retain file paths, relative directory structure, and available size information.
- Detect binary content, images, oversized text, missing files, and read errors. Report these explicitly when a text diff cannot be produced.

Image comparison and hexadecimal inspection are outside the text comparison scope.

## Git and GitHub support

| Source | Built-in capabilities |
| --- | --- |
| Local Git working tree | Compare all, staged, unstaged, or untracked changes; edit supported working files or index content; stage, unstage, or discard eligible changes |
| Git history | Compare a single commit or a range of branches, tags, or commit references; support direct two-dot and merge-base three-dot comparisons |
| Public GitHub sources | Load pull requests, commit comparisons, and individual commits from supported URLs without requiring a local clone |

Repository and reference validation are included. Git comparisons distinguish added, deleted, modified, renamed, copied, type-changed, untracked, and conflicted entries where reported by the source.

Local Git functions work offline against the repository's available data. GitHub access requires a network connection and supports public repositories without authentication. Invalid URLs, unavailable content, rate limits, and network failures must produce specific errors.

Historical commits and GitHub snapshots remain read-only originals. Editing their content creates a separate draft that can be saved as a local file. The application does not commit or push repository changes, merge pull requests, or publish GitHub reviews.

## Difference analysis

The application supports both unified and side-by-side text comparisons, syntax highlighting, and word- or character-level change highlighting. Unchanged context can be limited or expanded, including full-file context when supported. Long-line wrapping and optional syntax-token hover information are available.

File and path filtering help narrow large comparisons. Differences can be analyzed at file, hunk, or individual changed-block level. A hunk is a group of nearby changes with surrounding context; separate changed blocks within it can be acted on independently where supported.

## Text editing and selective changes

- Edit supported local text on either side of a comparison.
- Edit eligible Git working files or index content according to the selected comparison scope.
- Create editable draft copies of historical or remote content and save them separately.
- Save individual documents or all modified documents; track unsaved changes.
- Undo and redo text edits, or reset content to its saved version.
- Preserve supported text encoding, line endings, and trailing-newline information when saving.
- Copy supported hunks or changed blocks between local files in either direction.
- Stage, unstage, or discard eligible Git changes at file and supported partial-change levels.
- Undo the last supported change-application operation when the underlying file state still permits it.

Partial operations must affect only the selected changes. Before writing, the application checks whether the target has changed since it was loaded. Stale edits or patches must fail without silently overwriting newer content or unrelated changes.

## Review comments and decisions

The application stores local review notes associated with a comparison and specific old or new lines. Comment threads support replies, editing, deletion, resolution, reopening, and filtering by state.

Comments are anchored using revision and surrounding text information. When changes invalidate an anchor, a thread can be marked outdated and reattached to an appropriate location.

Read-only comparisons support local Accepted, Rejected, and Needs changes decisions for hunks, with block-level decisions where available. Review records persist independently of the original content. Reviews can be exported as JSON or Markdown, and JSON review bundles can be imported.

These functions support personal review and exchanging review files. Live collaborative editing and automatic synchronization with GitHub review comments are outside the scope.

## Search and replacement

Search operates across the active comparison and supports plain text, regular expressions, case sensitivity, and whole-word matching. Searches can be restricted by path pattern or to changed, added, deleted, or context lines. Matches include file, side, line, and text context.

Multi-file replacement includes a preview with replacement counts and file selection. Replacement is limited to supported writable targets. Revision checks prevent a preview based on older content from overwriting intervening changes. Search results can arrive incrementally, with progress and errors reported explicitly.

## Merge conflict resolution

The application detects conflicted Git entries and supports resolving eligible text conflicts by keeping current content, incoming content, both, or a manually edited result. Resolution can operate on individual conflict blocks or all supported blocks in a file.

Resolution drafts can be saved or reset. Final resolution validates the conflict state, writes the chosen result, and updates the Git index. Applicable non-text and deletion conflicts support choosing a side or resolving through deletion. Unsupported conflict types must be reported clearly.

The last supported conflict resolution can be undone when no intervening changes make reversal unsafe.

## Persistence, customization, and maintenance

- Remember recent comparison sources, local locations, comparison preferences, and appearance settings.
- Restore supported local comparison state across restarts.
- Persist unsaved document drafts for recovery, inspection, saving as separate copies, or explicit disposal.
- Protect unsaved edits when closing or replacing active work, and retain drafts after failed saves.
- Support system, light, and dark appearance modes, customizable and importable themes, fonts, and text sizes.
- Configure diff context, highlighting, rendering limits, and directory filtering behavior.
- Reset preferences or remembered selections independently, with a separate full-reset option.
- Check for application updates manually or at launch, select stable or prerelease releases, and download and install updates where supported by the build.

Desktop distribution targets Windows, macOS, and Linux. Local file comparison and local Git operations remain usable without a network connection.

## Performance and reliability

Large directory trees and long text comparisons require incremental loading, virtualized rendering, and bounded background processing. Navigation and editing should remain responsive while comparison work continues.

Partial results, cancellation, stale responses, and failed operations must remain distinct from successful completion. Repeated initialization and repeated commands must not duplicate writes or corrupt state. Failures must preserve recoverable work and enough context to retry safely.

Performance targets should be established through measurements on representative files and repositories. No fixed latency or unlimited file-size guarantee is implied.

## Suitable supporting libraries

[The Pierre Computer Company](https://pierre.computer/) provides two open-source libraries that are particularly well suited to this type of application:

- **[`@pierre/diffs`](https://diffs.com/):** diff and code rendering, syntax highlighting, unified and split comparisons, virtualization, editing support, and extension points for annotations and conflict resolution.
- **[`@pierre/trees`](https://trees.software/):** virtualized file trees with path search, Git status information, keyboard navigation, and customization.

Together, they are a strong foundation for the code comparison and file navigation capabilities described here. Application-specific filesystem access, Git operations, revision validation, persistence, and recovery still need to be implemented around them. Library features should be checked against the selected versions rather than assumed to provide every application function automatically.
