# Diffly Delete Block Fixture

## Shared Intro

This fixture is the inverse of the insert-block document. The left-side version
contains a dedicated section that disappears entirely on the right. That gives
the unified diff a clean delete-only hunk to render.

## Shared Outro

The remaining paragraphs stay aligned across both sides so the compare result
produces a single removed block. This is useful when visually testing that a
delete-only hunk does not create placeholder insert rows.

This file is also sized above two kilobytes to stay compatible with the fixture
minimum requested for the repository.

## Audit Appendix

- The right-side file omits the legacy notes section entirely.
- Unified view should therefore show only removed rows from the left-side version.
- Context rows before and after the missing block should remain intact and readable.
- Side-by-side view should keep blank space on the right without inventing replacement text.
- The sidebar tree should still count this file as modified rather than right-only.
- Refresh and status-filter state should not disturb the viewer once this file is selected.
- This appendix exists to keep the fixture above the minimum size floor for all test files.

## Verification Notes

This verification block adds stable prose so the fixture remains large enough
for repository rules. The important behavior is still the same: the right-side
document omits a contiguous section, and the compare result should render that
as a pure delete block sourced from the left-side content with readable context.

The rest of this appendix is intentionally steady markdown prose. It gives the
fixture enough size to clear the repository floor while keeping the semantic
difference the same: the right-side file lacks the legacy notes section.

The final paragraph repeats the intent once more so the fixture remains above
two kilobytes: this is a delete-only markdown case with stable surrounding
context and no synthetic insertion block on the right side.
