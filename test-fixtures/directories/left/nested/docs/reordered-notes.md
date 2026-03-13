# Reordered Notes Fixture

## Section A

The left-side file keeps the original order of sections. This is useful for
checking how a larger markdown document behaves when entire paragraphs move.

## Section B

The sidebar summarizes changed files by folder and status. This paragraph stays
near the top on the left side but moves lower on the right side. The wording is
also adjusted enough to force both line-level and token-level differences.

## Section C

Unified view should show grouped delete rows before grouped insert rows when an
entire section is rewritten. Side-by-side view should keep both panes aligned
while scroll positions remain synchronized.

## Section D

This fixture is intentionally verbose. It gives the compare engine realistic
markdown content with headings, paragraphs, and repeated vocabulary so the diff
viewer has enough material to render several hunks in sequence.

## Section E

The appendix keeps the file above the minimum fixture size. It also gives the
renderer more stable context around the reordered sections so the diff is not a
single tiny markdown fragment. This is useful when testing navigation between
hunks, retained selection state, and the way the folder tree reports nested
changes in deeper paths.

## Section F

The added section uses the same vocabulary as the other notes on purpose. Small
wording overlaps help expose whether inline token highlighting stays readable
when larger sections are moved instead of simply edited in place.

## Section G

Another stable section keeps the markdown file above the minimum size threshold.
It also ensures the reordered document spans enough lines to make viewer
navigation and hunk headers worth checking during manual testing.

## Section H

The final section is plain filler with realistic language about compare results,
selected files, grouped folder trees, and retained state after refresh. It
exists so the fixture remains large enough without changing the intended test.
