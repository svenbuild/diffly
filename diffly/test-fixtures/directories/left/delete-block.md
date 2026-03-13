# Diffly Delete Block Fixture

## Shared Intro

This fixture is the inverse of the insert-block document. The left-side version
contains a dedicated section that disappears entirely on the right. That gives
the unified diff a clean delete-only hunk to render.

## Legacy Review Notes

- The original layout used compact toolbar buttons with fixed text labels.
- Refresh operations temporarily replaced button text with a loading string.
- Sidebar status tags worked like a single-choice mode switch rather than a filter.
- The moon icon in the theme toggle sat slightly off-center in dark mode.
- The unified renderer alternated delete and insert rows when an entire section changed.
- Scrollbars relied on the operating system defaults instead of panel-aware styling.
- Collapsed folder groups were recreated from scratch after each compare refresh.
- The selected file could be lost when the result set changed under a single active tag.

## Shared Outro

The remaining paragraphs stay aligned across both sides so the compare result
produces a single removed block. This is useful when visually testing that a
delete-only hunk does not create placeholder insert rows.

This file is also sized above two kilobytes to stay compatible with the fixture
minimum requested for the repository.

## Audit Appendix

- Deleted sections should appear as minus rows without synthetic insert placeholders.
- Context rows before and after the removed block should stay visible in unified view.
- The side-by-side viewer should show blank space on the right for removed content.
- Status filters in the sidebar should not affect the active diff once the file is open.
- Refresh should preserve the current file selection while reloading the directory tree.
- Scrollbars should stay themed and proportional even when the content is mostly markdown.
- This appendix exists to keep the fixture above the minimum size floor for all test files.

## Verification Notes

This verification block adds stable prose so the fixture remains large enough
for repository rules. The important behavior is still the same: the right-side
document removes a contiguous section, and the compare result should render that
as a pure delete block with enough surrounding context to inspect navigation,
selection retention, and status filter behavior.
