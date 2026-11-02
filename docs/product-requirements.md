# Diffly Product Description and Requirements

Diffly is a desktop application for comparing files, folders, and code changes. It brings local comparisons, Git working trees, commit history, and public GitHub changes into one workspace where users can inspect differences, leave review notes, edit text, and apply supported changes.

Its central promise is straightforward: help users understand what changed and act on those changes without losing their work or their place.

This document describes the current product scope and the behavior it should preserve. Requirements express expected product behavior; they are not a claim that every failure case has been verified. Future features are outside this scope unless explicitly identified.

## Users and primary jobs

- **Developers preparing changes:** inspect staged, unstaged, and untracked files; stage selected changes; discard unwanted edits; resolve merge conflicts.
- **People comparing local content:** compare two versions of a file or folder and copy selected text changes between them.
- **Code reviewers:** inspect commits or public GitHub changes, attach comments to specific lines, and record review decisions.

The product should make large comparisons practical while keeping the common workflow short: choose a source, find the relevant change, inspect it, and take an appropriate action.

## Product structure

Diffly has three main screens:

1. **Setup:** choose Local, Git, or GitHub and open a comparison. Recent sources help users return to previous work.
2. **Compare:** browse files, read diffs, search, review, edit, or resolve conflicts. Actions depend on the selected source and file.
3. **Settings:** configure appearance, diff rendering, the directory tree, updates, and local preference resets.

The compare workspace combines a resizable file tree with the main content area. Search and review panels provide supporting tools. File counts and addition/deletion statistics help users assess the comparison; statistics that are still being calculated must remain visibly incomplete.

## Comparison sources

| Source | What users open | Available work |
| --- | --- | --- |
| Local | Two files or directory trees | Inspect, edit supported text on either side, and copy selected changes between sides |
| Git working tree | A local repository, filtered to all, staged, unstaged, or untracked changes | Inspect, edit eligible working files or index content, stage, unstage, discard, and resolve conflicts |
| Git history | A single commit or a range between refs | Inspect snapshots, comment, record review decisions, and edit draft copies |
| GitHub | A public pull request, compare URL, or commit URL | Inspect remote changes, comment locally, record review decisions, and edit draft copies |

Local setup must support path entry, filesystem browsing, navigation history, and file or folder selection. Invalid or incompatible selections must produce a clear explanation before comparison begins. Users can swap the sides of a local comparison.

Git setup must validate the repository and refs. Advanced comparisons support branches, tags, commit references, direct two-dot comparisons, and merge-base three-dot comparisons. The selected comparison and working-tree scope must remain clear in the workspace.

GitHub setup must validate supported URLs and explain network, access, and rate-limit failures. A remote comparison can be opened in the browser. The current integration uses unauthenticated access to public repositories.

## Reading and navigating changes

The viewer must provide side-by-side and unified text diffs, with clear additions, deletions, file labels, and line numbers. Users can adjust context, expand unchanged sections, collapse file diffs, wrap long lines, and configure syntax and inline change highlighting. Optional Token Hover provides syntax-token context.

Directory comparisons must preserve folder structure and identify modified files and files present on only one side. Git comparisons additionally distinguish statuses such as renamed, untracked, and conflicted. Tree search, configurable expansion, and an option to include unchanged local files help users narrow the view.

Selecting a tree entry should navigate to its corresponding diff. Reloading or changing presentation settings should preserve selection and viewing context where the underlying content allows it. Comparison-rule changes that require recalculation must make the need to reload visible.

Unsupported content must have an explicit state showing the reason and available path and size information. The current viewer uses this fallback for images, binary files, oversized text, missing files, and read failures. Image previews and hex inspection are not part of the active viewer flow.

## Editing and applying changes

Users must be able to switch supported text into an editor and choose a diff or full-file editing surface. The editor provides undo, redo, reset to saved contents, save, and a visible unsaved state. Save All handles multiple dirty documents.

The destination must always be clear: left local file, right local file, Git working file, Git index, or draft copy. Historical and GitHub snapshots remain unchanged; edits to those sources create drafts that can be saved as separate files.

Local review actions can copy a supported hunk, or an individual changed block within it, in either direction. Git review actions can stage, unstage, or discard eligible changes. Controls must reflect the actual operation scope and file capabilities. Applying one changed block must preserve unrelated changes in the same surrounding hunk.

Before writing, Diffly must detect when the target has changed since it was loaded. It must preserve the user's edits and offer recovery rather than silently overwrite newer content. Saves should preserve supported encoding and line-ending information. Supported review mutations provide an action to undo the last change; undo must also respect intervening file changes.

## Review comments and decisions

Users can attach persistent comment threads to old or new diff lines, reply, edit or delete comments, resolve or reopen threads, and navigate between them. The file tree shows comment counts, and the review panel filters thread states.

When content changes, comments should remain attached to the correct text where possible. Threads that cannot be reliably matched become outdated and can be reattached explicitly.

Read-only comparisons support Accepted, Rejected, and Needs changes decisions for hunks, with block-level decisions where available. These are local review records. Comments can be exported as JSON or Markdown, and JSON review bundles can be imported. GitHub comments, approvals, and merge actions are not published by this workflow.

## Search and replacement

Users can search across a comparison with case-sensitive, whole-word, and regular-expression options. Search can be restricted by path or to changed, added, deleted, or context lines. Results show file and line context and navigate to the matching content.

Search must report progress while results arrive. Replacement requires a preview with match counts and file selection before applying. Only supported writable targets may be modified, and revisions must be checked before replacement so a stale preview cannot overwrite newer content.

## Conflict resolution

Conflicted Git entries open a dedicated resolution view. For supported text conflicts, users can choose current, incoming, or both content, resolve individual blocks, or edit the result manually. They can reset the resolution draft or save a draft before finishing.

The workspace must distinguish editing a proposed resolution from marking the conflict resolved. Resolution checks the current conflict state before writing and updating the index. Binary, deletion, and other non-text conflicts expose applicable side-selection or deletion choices. Unsupported cases must explain their limits. The last supported resolution can be undone when the underlying state still permits it.

## Continuity and settings

Diffly remembers setup locations, recent sources, comparison preferences, and appearance across restarts. Local comparisons and saved app state support returning to previous work. Unsaved document drafts have a recovery flow with restore, individual review, save-copy, and discard choices.

Leaving work with unsaved edits must offer Save All, Discard All, Review Files, or Cancel. A failed save must keep the work available and explain the failure.

Appearance supports system, light, and dark modes; theme selection and customization; theme import; fonts; and text sizes. Diff and tree settings include live previews. Reset controls distinguish preferences from remembered selections and a full reset.

Updates support manual checks, optional launch checks, stable or prerelease channels, download status, and installation when supported by the installed build. Update failures must leave comparison work usable.

## Quality requirements and boundaries

- **Responsiveness:** large trees and long diffs must use bounded loading and rendering. Scrolling, navigation, and input should remain usable while background work continues.
- **Correctness:** partial results, cancellation, stale responses, and failed operations must never appear as a successfully completed comparison or write.
- **Recovery:** errors must retain user context and provide a clear next action. Repeated initialization or commands must not duplicate work or corrupt state.
- **Local operation:** local file and Git workflows work offline. GitHub loading and release checks require network access.
- **Platform scope:** desktop builds target Windows, macOS, and Linux. Windows is the primary tested platform; macOS and Linux need broader validation.

Diffly's scope is comparison, review, editing, and targeted change application. A full Git hosting client, private GitHub authentication, live collaborative review, and automatic folder synchronization are outside the current scope. No numeric performance guarantee is defined here; performance targets require measurements against representative files and repositories.

## Acceptance examples

1. Comparing two folders shows changed and one-sided entries, and selecting a file opens the correct diff without resetting the tree unnecessarily.
2. Copying one changed block between local files preserves unrelated blocks; an intervening disk edit causes a visible failure instead of an overwrite.
3. Staging an eligible Git change updates the relevant scopes, while historical comparisons offer draft editing and local review decisions.
4. A public GitHub PR opens from its URL, and access or rate-limit failures produce actionable feedback.
5. Closing with unsaved edits offers a decision; recovered drafts can be inspected or saved separately after restart.
6. Resolving a text conflict lets the user inspect the result before marking it resolved and refuses a stale resolution.
7. An image, binary, or oversized file shows its explicit fallback state while the rest of the comparison remains navigable.
