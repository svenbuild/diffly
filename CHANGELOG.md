# Changelog

## Diffly v0.2.2

### What's Changed

- Added compare sidebar Diff Stats and System Monitor panels.
- Added one-page directory diff scrolling with faster visible-diff promotion.
- Reported active directory diff rendering and directory diff work in the system monitor.
- Capped the diff render cache size to keep memory use predictable.
- Loaded visible directory diffs while scrolling.
- Replaced native selects with a custom dropdown that avoids layout shift and keeps inner scrolling stable.
- Compact buttons, switches, and controls with follow-up alignment fixes.
- Cleaned up the README and marked completed TODO items for the release work.

**Full Changelog**: https://github.com/svenbuild/diffly/compare/v0.2.1...v0.2.2

## Diffly v0.2.2-rc.2

### What's Changed

- Show directory diffs in one scroll view
- Promote visible directory diffs faster
- Report active directory diff rendering
- Cap diff render cache size
- Report directory diff work in monitor
- Load visible directory diffs while scrolling
- Mark one-page directory diffs as complete in the TODO list

**Full Changelog**: https://github.com/svenbuild/diffly/compare/v0.2.2-rc.1...v0.2.2-rc.2

## Diffly v0.2.2-rc.1

Released: 2026-06-07

This is a prerelease for testing the Diff Stats and System Monitor work before the next stable release.

### Highlights

- Added compare sidebar Diff Stats and System Monitor panels.
- Added sidebar metrics toggles and polished their spacing, alignment, and collapsed states.
- Animated metric panels while keeping closed panels fully collapsed.
- Cleaned up the README around a shorter product, download, development, and links structure.
- Marked Diff Stats and System Monitor as complete in the project TODO list.

### Validation

- `npm run check`
- `npm run build`
- GitHub Actions release workflow on tag `v0.2.2-rc.1`

### Complete Commit List Since v0.2.1

- Clean up README (`07e0d5f`)
- Add compare sidebar stats monitor (`e22d1f3`)
- Polish sidebar metrics toggles (`58f9960`)
- Clean up sidebar Diff Stats and System Monitor styling (`0f5bbd9`)
- Force left-aligned sidebar metric headers (`f065e09`)
- Animate sidebar metric panels open and closed (`526d8e7`)
- Fully collapse sidebar metric panels when closed (`f3ef58f`)

## Diffly v0.2.1

Released: 2026-06-07

This release covers all changes from `v0.2.0` through `v0.2.1`.

### Highlights

- Added persistent diff comments across single-file and folder comparisons, including gutter actions, delete support, named portraits, and larger randomized avatars.
- Added Token Hover for bundled syntax-token knowledge tooltips, with sticky popouts, darker cards, underline affordances, and `.h` file support.
- Reworked settings and appearance previews around real Pierre diff/tree rendering, cleaner sidebar navigation, compact controls, and more accurate light/dark preview behavior.
- Simplified directory tree and compare rendering by removing legacy fallbacks, benchmark harnesses, custom wheel handling, and structural dead code.
- Improved directory tree reliability, viewport sizing, native scrolling, virtualizer line-height matching, and setup/compare layout polish.
- Updated Electron from 39 to 42 and adjusted GPU/compositing behavior for newer Chromium desktop rendering.
- Updated the project license to GPLv3 and refreshed release metadata.

### Validation

- `npm run check`
- `npm run build`
- GitHub Actions release workflow on tag `v0.2.1`

### Complete Commit List Since v0.2.0

- Add subtle compare transition feedback (`d57dfa3`)
- Remove scroll and benchmark harnesses (`182fe1c`)
- Fix directory tree viewport sizing (`c6de6ea`)
- Stabilize directory tree mounting (`f70d236`)
- Update repository commit guidance (`d45e637`)
- Ensure directory sidebar renders entries (`3d2c54e`)
- Force GPU compositing; pin colored file-tree icons (`49572be`)
- Match virtualizer line-height metric to rendered row height (`9e66e41`)
- Try forcing D3D11 ANGLE + dropping GPU sandbox (`896181c`)
- Upgrade Electron 39 -> 42 for newer Chromium GPU support (`ca11ebe`)
- Drop forced GPU switches; write GPU status to userData (`ea8d09c`)
- Default lineDiffType to 'none' to cut per-line span count (`8508255`)
- Remove custom wheel/scroll machinery; use native scrolling (`0834085`)
- Add delete button to diff comments (`19f285e`)
- Tree: configurable built-in icon set; drop status text labels (`81677bc`)
- Persist diff comments across reloads (per comparison) (`6d3682e`)
- Settings: keep select chevron on hover (`c1efa89`)
- Tree: remove fallback list, always use the @pierre/trees FileTree (`7bdac75`)
- Clean up structural dead code (`5b37ee9`)
- Extract focused structural helpers (`c52f049`)
- Split startup and explorer helpers (`d576b05`)
- Split renderer structure and remove legacy diff fallbacks (`60b50d0`)
- Restyle settings sidebar, appearance preview, and compare layout (`e1de6f3`)
- Polish compare toolbar, settings sidebar, and picker contrast (`d87366a`)
- Narrow compare sidebar and tighten tree padding (`44de5d6`)
- Use neutral gray for settings sidebar and picker selection (`c5e1cf5`)
- Use runtime-safe neutral tokens for sidebar and picker selection (`66fd090`)
- Track theme surface for panel/app/editor backgrounds; revert selection graying (`753e847`)
- Give the setup warning banner a uniform border (`fd41057`)
- Lay light and dark theme editors side by side in System mode (`b3d2e23`)
- Redesign compare settings as a section rail with focused panels (`66c9cc3`)
- Tweak compare settings: prominent group labels, smaller view-mode button, taller fixed paths textarea (`fdde9f2`)
- Add live interactive previews to compare diff and tree settings (`75aa23c`)
- Render appearance theme previews with real @pierre/diffs (`29d29ee`)
- Refine settings previews: per-variant theming, richer diff, tree beside settings (`c899475`)
- Fix settings previews: real syntax toggle, light scrollbar, drop compare rules and section headers (`7fb6d9c`)
- Fix light theme preview: reflect theme on Pierre host and theme preview scrollbars (`9037946`)
- Diffshub-style gutter comment button and comment UI with distinct SVG icons (`2a3841d`)
- Diff comments: portrait avatars, working save/delete, gutter button off the line number (`775e1a1`)
- Unify diff comments across single-file and folder compare; named portraits; built-in gutter button (`46b66d3`)
- Gender-specific comment names, bigger random avatars, drop line-click toast (`bd425e1`)
- Add TODO list (`aad5c3f`)
- Add Token Hover: bundled syntax-token knowledge tooltips (`09822e8`)
- Refine Token Hover: underline, sticky popout, .h support, darker card (`99391a6`)
- Mark token hover as done in TODO (`3b12895`)
- Update project license to GPLv3 (`3a7a0ab`)

## Diffly v0.2.0

Released: 2026-06-04

This release covers all changes from `v0.1.5` through `v0.2.0`.

### Highlights

- Migrated Diffly to a dedicated Electron desktop runtime and release pipeline.
- Reworked Compare view rendering around Pierre diff/tree components.
- Added file-level directory diff rendering with background loading and caching.
- Made directory diff navigation open one selected file diff page at a time while loading the rest in the background.
- Added virtualized rendering paths for large text diffs, directory diffs, and binary previews.
- Improved scrolling stability, scroll anchoring, pane synchronization, and large-directory responsiveness.
- Added regression checks for scroll correction and Electron directory scrolling behavior.
- Reworked binary previews to avoid blocking the main viewer and to support virtual hex rendering.
- Added Windows installer and portable packaging support with GitHub release publishing.
- Updated app icons, workbench layout, settings density, sidebar navigation, minimap styling, and compare controls.
- Improved updater behavior, update state persistence, GitHub API caching, and GitHub rate-limit fallback handling.
- Improved Explorer context-menu startup behavior and multi-window launch handling.
- Reduced diff cache memory use and made startup/loading paths more responsive.

### Compare View, Diff Rendering, And Scrolling

- Prioritized size guards before binary detection.
- Fixed pane wheel smoothing overshoot and scroll oscillation.
- Stabilized visible compare diffs during refresh.
- Improved large full-file diff rendering and performance.
- Limited background diff preload to a bounded radius.
- Restored split full-file gap row rendering.
- Kept split pane headers aligned with draft badges.
- Reworked split viewer header alignment and split pane widths.
- Fixed split diff pane alignment and scroll marker layout.
- Kept syntax highlighting visible on large files.
- Improved compare detail loading responsiveness.
- Cached directory compares and sped up file scans.
- Streamed directory compare progress.
- Prioritized explicit file opens over background compare work.
- Sped up large text replacement alignment.
- Primed adjacent compare files during auto-open.
- Added the Pierre text compare view.
- Fixed Pierre compare remount rendering.
- Added Pierre diff and tree settings pages.
- Refined compare settings and diff loading.
- Restored interactive Pierre settings.
- Added a scrollable directory diff list.
- Used Pierre diff headers in the directory list.
- Fixed robust directory diff loading, interactions, expansion, row toggles, retries, and CodeView rendering.
- Opened directory diffs by default.
- Rendered selected directory diffs as a single file page.
- Hid redundant Pierre and directory host scrollbars.
- Stabilized directory diff scrolling and lazy loading.
- Improved compare view rendering.
- Added file-level virtualized directory diffs.
- Used CodeView worker rendering for directory diffs.
- Optimized compare performance and startup loading.
- Improved directory compare and Explorer responsiveness.
- Cached file diffs and streamlined directory aggregation.
- Streamlined directory diff list updates.
- Added a worker pool for file diff rendering.
- Loaded directory diffs in the background.
- Fixed directory diff scroll anchoring.
- Hardened directory diff scroll handling.
- Added scroll guard verification.
- Optimized directory diff loading and scrolling.

### Binary Preview And Large File Handling

- Refactored binary hex preview data flow to send raw bytes and render with virtual scrolling.
- Deferred binary preview loading in the viewer.
- Added binary preview base64 lockfile support.
- Added a diff minimap and refreshed compare fixtures.
- Fixed merged binary viewer template nesting and DiffViewer typing/template blocks.
- Reinstated the large-file plain fragment fallback.
- Stopped reading whole files for binary classification and hashing.
- Combined binary preview/hash work into a single pass and bounded loading state.
- Loaded binary previews from selected entry paths.
- Kept binary preview loading nonblocking.
- Simplified binary hex preview rendering.
- Restored virtual scrolling for binary previews.
- Added a binary preview scrollbar and minimap.
- Restyled binary diffs to match the main viewer.
- Showed too-large file details.
- Reduced diff cache memory footprint.

### Desktop Runtime, Packaging, And Updates

- Migrated the desktop runtime to Electron.
- Fixed packaged renderer startup blocking.
- Built portable Windows app artifacts.
- Kept portable release output clean.
- Built installer and portable release outputs.
- Fixed electron-builder config flags.
- Improved build and startup performance.
- Hid the Electron application menu bar.
- Fixed updater flow and sidebar selection styling.
- Persisted app window position.
- Added Explorer open-here startup flow.
- Fixed Explorer context menu launch handling.
- Opened launch contexts in separate windows.
- Allowed open-here to start separate app instances.
- Fixed Explorer context startup lag.
- Used supplied app icons for Windows builds.
- Added a portable cleanup path that works without an installer.
- Persisted GitHub API cache to disk across app restarts.
- Added GitHub API ETag caching.
- Added a 5-minute cooldown between GitHub API calls and 403 cache fallback.
- Limited GitHub cache file size when loading from disk.
- Fixed GitHub cooldown timestamp handling on 403 fallback.
- Persisted update availability across restarts so the update button is visible on startup.
- Fixed startup update indicator visibility.

### UI, Settings, And Workflow

- Increased and restored baseline theme typography/font sizing.
- Improved focus states, transitions, and visual feedback across themes.
- Moved the update button in the app shell.
- Modernized the compare sidebar navigator.
- Compact sidebar file rows and refined the sidebar resizer.
- Preserved diff position on refresh.
- Improved UI font readability and unified UI text sizing.
- Polished sidebar tree alignment and the desktop diff workbench UI.
- Redesigned app icon assets.
- Unified the workbench and app shell layout.
- Used screen space more densely.
- Refined compare pane emphasis.
- Polished minimap and theme preset controls.
- Refined minimap viewport styling.
- Tightened settings layout density.
- Fixed appearance color swatches.
- Compact setup target header and kept setup rows consistent.
- Tidied settings layout and rationalized the grid.
- Reworked picker flow with a top-bar Compare action, removed the mode toggle, and supported multi-select.
- Compared selected folder pairs separately and paired multi-folder compares by basename.
- Added a settings panel transition.
- Moved setup warning into the top bar and fixed Ctrl deselect setup warning behavior.

### Merge And Session Handling

- Added merge text session utilities.
- Added compact merge backend support and compact merge mode UI.
- Polished merge hunk highlighting.
- Refined merge mode UX and hunk focus.
- Used backend-issued sessions for compare saves.
- Removed merge mode after the experimental flow was retired.

### Repository And Documentation

- Cleaned up project docs and repo metadata.
- Strengthened agent workspace rules and commit/push rules.
- Added and later reverted Claude-specific documentation changes where needed.
- Improved local ignore rules.
- Integrated reviewed Diffly PR fixes.
- Updated release workflow publishing to build and publish both the Windows installer and portable artifact.

### Validation

- `npm run check`
- `npm run build`
- `npm run electron:package`

### Complete Commit List Since v0.1.5

- Prioritize size guard before binary detection (`d3ef723`)
- Fix pane wheel smoothing overshoot oscillation (`9794439`)
- Fix legacy türkis label encoding (`ee00b27`)
- Stabilize compare diffs until refresh (`0d16db7`)
- Increase baseline theme typography (`ef6eb4d`)
- Restore baseline theme font sizing (`7027731`)
- Add Explorer open-here startup flow (`511b6d4`)
- Bump version to 0.1.6 (`44fe4b2`)
- Update Cargo.lock for 0.1.6 (`b75c0cc`)
- Fix startup update indicator visibility (`0392fde`)
- Improve large full-file diff rendering (`e493fa3`)
- Improve large full-file diff performance (`69e205c`)
- Limit background diff preload to bounded radius (`1cf6ead`)
- Add merge text session utilities (`50d296b`)
- Add compact merge backend support (`868cbd8`)
- Add compact merge mode UI flow (`48d6643`)
- Polish merge hunk highlighting (`5071cc1`)
- Merge PR #15: Honor MAX_TEXT_BYTES before binary detection (`dee408c`)
- Merge PR #16: Fix pane wheel smoothing oscillation (`d1a616b`)
- Merge PR #17: Fix legacy theme label mojibake (`8432b6b`)
- Merge PR #18: Limit background diff preload radius (`b1ff1a2`)
- Refine merge mode UX and hunk focus (`7ad8833`)
- Clean up project docs and repo metadata (`8d23132`)
- Merge feature/compact-merge-mode into main (`7cb0614`)
- Restore split full-file gap row pattern (`1f4ae3a`)
- Keep split pane headers aligned with draft badge (`77d47b2`)
- UI refinements: improve focus states, transitions, and visual feedback across themes (`422d2eb`)
- Use backend-issued sessions for compare saves (`33c5b9f`)
- Remove merge mode feature (`f5a36ab`)
- Refactor binary hex view: send raw bytes, render with virtual scrolling (`645c650`)
- Bump version to 0.1.6-rc.2 for prerelease updater compatibility (`1f00cab`)
- Bump version to 0.1.6-rc.3 (`a88a64c`)
- Move Update button next to Settings in toolbar, add GitHub API ETag caching (`fe0c8c3`)
- Bump version to 0.1.6-rc.4 (`f4cb480`)
- Bump version to 0.1.6-rc.5 (`6b0b7e1`)
- Persist GitHub API cache to disk across app restarts (`1958a1c`)
- Move Update button next to Diffly logo in all screen brand groups (`0a1d850`)
- Bump version to 0.1.6-rc.6 (`3f4051b`)
- Persist update availability across restarts so button shows on startup (`0759d09`)
- Add 5-min cooldown between GitHub API calls and 403 cache fallback (`e1792c3`)
- Bump version to 0.1.6-rc.7 (`61b9cbe`)
- Merge branch 'fix/remove-merge-feature' into main (`d4cfd3e`)
- Refresh Cargo.lock for 0.1.6-rc.7 (`cd5ee53`)
- Fix split diff pane alignment and scroll marker layout (`a1a7032`)
- Bump version to 0.1.6-rc.8 (`2c7f30c`)
- Keep syntax highlighting visible on large files and fix split pane alignment (`0570670`)
- Fix compare detail loading responsiveness (`66f5bbe`)
- Cache directory compares and speed file scans (`2ae06ca`)
- Stream directory compare progress (`0a30903`)
- Prioritize explicit file opens over background compare (`7fd86a5`)
- Speed up large text replace alignment (`9299b1f`)
- Prime adjacent compare files during auto-open (`2adee9d`)
- docs: strengthen agent workspace rules (`191e038`)
- docs: add claude workspace guide (`054753e`)
- docs: add claude agent caveman guidance (`4285be8`)
- docs: remove testing guidance from agent docs (`487e56f`)
- docs: require commit and push every turn (`9f1ff12`)
- docs: forbid assistant self-reference in commits (`b412d00`)
- Limit GitHub cache file size when loading from disk (`55cb82a`)
- Fix GitHub cooldown timestamp on 403 fallback (`20aba86`)
- Defer binary preview loading in viewer (`641fffe`)
- Add binary preview base64 dependency lockfile (`6c87085`)
- Add diff minimap and refresh compare fixtures (`b6656e9`)
- Fix merged binary viewer template nesting (`e65da37`)
- Fix merged DiffViewer typing and template blocks (`40e8ffb`)
- Reinstate large-file plain fragment fallback (`daf7927`)
- docs: remove Claude-specific repo files (`fb5180c`)
- Revert "docs: remove Claude-specific repo files" (`44a0e18`)
- Merge large-file fragment fallback (`8b30f50`)
- Migrate desktop runtime to Electron (`6b0b4ef`)
- Bump version to 0.1.6-rc.9 (`1d4d96a`)
- Fix renderer startup blocking packaged launch (`941565e`)
- Build portable Windows app artifact (`4280df8`)
- Keep portable release output clean (`b87cfd5`)
- Build installer and portable release outputs (`ac978f2`)
- Persist app window position (`71036f8`)
- Modularize diff viewer rendering helpers (`c88ea26`)
- Modularize diff viewer rendering helpers (`84a3f54`)
- Modernize compare sidebar navigator (`b015592`)
- Compact compare sidebar file rows (`86a1ccf`)
- Refine compare sidebar resizer (`db5ab2d`)
- Improve build and startup performance (`e155aee`)
- Fix electron builder config flags (`afcc5e5`)
- Equalize split diff pane widths (`627a9bb`)
- Align split viewer headers (`a7fb1d6`)
- Merge refactor codebase cleanup (`9ea0e66`)
- Fix DiffSegment type import (`c94c950`)
- Bump version to 0.1.6-rc.10 (`cee55c2`)
- Hide Electron application menu bar (`3798a12`)
- Fix updater flow and sidebar selection styling (`2d07c81`)
- Show too-large file details (`5125405`)
- Preserve diff position on refresh (`2a2f582`)
- Improve UI font readability (`e0bfaad`)
- Unify UI text sizing (`78c5370`)
- Polish sidebar tree alignment (`d40060b`)
- Polish desktop diff workbench UI (`976b77a`)
- Redesign app icon assets (`60b96ff`)
- Polish unified workbench UI (`2d547b6`)
- Unify app shell layout (`47554c5`)
- Use screen space more densely (`d0655a7`)
- Refine compare pane emphasis (`005728d`)
- Polish minimap and theme preset control (`0914493`)
- Refine minimap viewport styling (`dbb036d`)
- Tighten settings layout density (`33c810e`)
- Fix appearance color swatches (`f69a078`)
- Compact setup target header (`b346862`)
- Keep setup list rows consistent (`1300541`)
- Tidy settings layout and rationalize grid (`85f21a5`)
- Restructure settings layout for better balance (`43447d4`)
- Revert "Restructure settings layout for better balance" (`affb49b`)
- Rework picker: top-bar Compare, drop mode toggle, multi-select (`381eea0`)
- Compare each selected folder pair separately (`a9c56b0`)
- Pair multi-folder compares by basename, not selection index (`9771ac5`)
- Stop reading whole files for binary classification and hashing (`bc32eae`)
- Single-pass binary preview/hash and bound the loading state (`6bf581d`)
- Add settings panel transition (`f03e259`)
- Allow portable cleanup without installer (`69c4019`)
- Load binary previews with selected diffs (`0e788ff`)
- Remove lazy binary preview loading (`c8508b0`)
- Load binary preview from selected entry paths (`13d29bc`)
- Keep binary preview loading nonblocking (`7673209`)
- Simplify binary hex preview rendering (`95c0e7b`)
- Restore virtual scrolling for binary previews (`4cb1860`)
- Add binary preview scrollbar and minimap (`4f027f4`)
- Restyle binary diff to match viewer (`3e60477`)
- Prepare v0.1.6-rc.11 prerelease (`0b70821`)
- Use supplied app icons for Windows builds (`857c808`)
- Fix Explorer context menu launch handling (`5668382`)
- Reduce diff cache memory footprint (`c868e9b`)
- Improve local ignore rules (`a11a921`)
- Open launch contexts in separate windows (`c75dcd8`)
- Allow open-here to start separate app instances (`eee5c61`)
- Integrate reviewed Diffly PR fixes (`38c6bac`)
- Fix Explorer context startup lag (`3f5bbdd`)
- Move setup warning into top bar (`5da5b25`)
- Fix ctrl deselect setup warning (`234a3d6`)
- Integrate Pierre text compare view (`1ceeeba`)
- Fix Pierre compare remount rendering (`a006c49`)
- Add Pierre diff and tree settings pages (`f9d1b6e`)
- Refine compare settings and diff loading (`b54488b`)
- Restore interactive Pierre settings (`191131a`)
- Add scrollable directory diff list (`3ffe531`)
- Use Pierre diff headers in directory list (`50bbbbf`)
- Fix robust directory diff loading (`168841c`)
- Fix directory diff interactions (`10d5a56`)
- Fix reliable directory diff expansion (`2fd17ea`)
- Fix directory diff row toggles and retries (`bbe58ee`)
- Fix directory CodeView rendering (`07caa3a`)
- Open directory diffs by default (`8d1caf7`)
- Render selected directory diff only (`447d3fa`)
- Hide Pierre diff scrollbars (`f555fb7`)
- Hide directory diff host scrollbars (`68ad886`)
- Stabilize directory diff scrolling (`9e04a6b`)
- Improve compare view rendering (`077bc2c`)
- Use file-level virtualized directory diffs (`55d2b99`)
- Use CodeView worker rendering for directory diffs (`834eb5b`)
- Stabilize directory diff scrolling (`5081168`)
- Stabilize directory diff lazy loading (`e9faae4`)
- Optimize compare performance and startup loading (`6b294e0`)
- Improve directory compare responsiveness (`46e7b45`)
- Improve explorer responsiveness (`f31a57a`)
- Cache file diffs and streamline directory aggregation (`d0786f3`)
- Streamline directory diff list updates (`d637e0e`)
- Remove performance benchmark harnesses (`ba9cad6`)
- Optimize compare view diff rendering (`91981f5`)
- Use worker pool for file diff rendering (`d30919d`)
- Optimize compare diff loading responsiveness (`26d0b69`)
- Load directory diffs in background (`7fda167`)
- Fix directory diff scroll anchoring (`3a19c63`)
- Harden directory diff scroll handling (`7ae6895`)
- Add scroll guard verification (`ba0ddf5`)
- Optimize directory diff loading and scrolling (`f62adb5`)
- Render selected directory diff only (`b9e6e7f`)
