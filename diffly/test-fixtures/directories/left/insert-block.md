# Diffly Insert Block Fixture

## Baseline Summary

The left-side version acts as the pre-change document. It keeps the shared
header, the stable overview, and the compact notes section. The right-side file
adds an entire section in the middle so the compare can exercise a pure insert
block instead of a pairwise line substitution.

## Shared Overview

- The compare workspace starts from a pair of selected roots.
- The sidebar tree groups changed items by nested folder path.
- Status chips represent modified, left-only, right-only, binary, and too-large states.
- The viewer offers side-by-side and unified layouts.
- Inline highlights can be toggled without rerunning the compare.
- Scroll positions stay synchronized across the split view.

## Shared Notes

The wording in this section remains the same on both sides. That keeps the
surrounding context stable while the inserted section on the right creates a
clean hunk boundary. A single scenario with a clean insertion is useful when
you want to visually confirm that the viewer does not invent a matching delete
block when none exists.

The fixture also gives the sidebar something realistic to show when users test
multi-select status filters, refresh behavior, and tree-collapse persistence.

## Footer

This file is intentionally longer than two kilobytes so it can stay in the
fixture set without violating the minimum-size rule for test files.

## Appendix

This appendix reinforces the scenario with extra stable text. The compare view
should keep these paragraphs unchanged on both sides while the right-side file
adds a large checklist section. That lets you visually confirm that insert-only
hunks behave differently from block rewrites, block deletions, and punctuation
changes that rely on token-level highlighting inside a single line.

Additional notes keep the markdown fixture above the minimum required size and
provide more realistic prose around the insertion. The content stays identical
on both sides here so the inserted checklist remains the only structural delta.
