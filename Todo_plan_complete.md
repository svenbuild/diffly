# Vollständiger Plan für die offenen Diffly-Todos

## Grundentscheidung

Diffly sollte **weiter klar auf `@pierre/diffs` und `@pierre/trees` aufbauen**. Dein Repo nutzt diese Libraries bereits direkt: `@pierre/diffs` und `@pierre/trees` sind Dependencies in `package.json`, und die App rendert Trees über `FileTree` sowie Diffs über `FileDiff`/`CodeView`.    

Die Regel sollte sein:

| Bereich                                                                            | Entscheidung                                                                           |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Diff-Rendering, Header-Hooks, Gutter, Annotations, Selection                       | **`@pierre/diffs` verwenden**                                                          |
| Tree-Rendering, Icons, Selection, Virtualisierung, Search, DnD/Renaming-Optionen   | **`@pierre/trees` verwenden**                                                          |
| echte Dateioperationen, Git-Mutationen, GitHub-Workflow, Electron-Fenstersteuerung | **eigene Diffly-Backend-/UI-Logik**                                                    |
| Icons aus Website-Code                                                             | nur übernehmen, wenn sie sauber exportiert/lizenziert sind; sonst eigene Icon-Registry |

Die offenen Repo-Todos sind Custom Diff Header, Windows Top Bar, Settings-Namen, Tree-Features, Review Mode, Icons und Git Workflow. Deine zusätzliche Liste ergänzt noch GitHub-UI-Rework und den Gutter-Comment-Bug. 

---

# Priorität

|   Prio | Task                                                        | Warum                                                        |
| -----: | ----------------------------------------------------------- | ------------------------------------------------------------ |
| **P0** | Gutter Utility: keine mehrfachen offenen Kommentar-Editoren | kleiner Bug, direkt störend, wenig Risiko                    |
| **P0** | Custom Diff Header                                          | Kern-UX; passt direkt zu `@pierre/diffs` Header-Hooks        |
| **P1** | Settings-Namen an Pierre-Webseite angleichen                | wenig Risiko, macht UI sauberer                              |
| **P1** | Icons vereinheitlichen                                      | visuelles Upgrade, wichtig für Header und Tree               |
| **P1** | `trees: show unmodified`                                    | sinnvoll, aber Datenmodell muss sauber erweitert werden      |
| **P1** | Custom Windows Top Bar                                      | UI-polish, aber Electron-Risiko                              |
| **P2** | Tree Context Menu                                           | sinnvoll, aber Actions müssen je Mode sauber begrenzt werden |
| **P2** | Drag & Drop / Rename                                        | nur mit Sicherheitsmodell einbauen                           |
| **P2** | Review Mode Accept/Reject                                   | wichtig, aber gefährlich wegen Datei-/Git-Mutationen         |
| **P2** | Git Workflow rework                                         | grösserer UX-Umbau                                           |
| **P2** | GitHub Mode UI rework                                       | nach Git-Rework, weil gleiche Vergleichslogik betroffen ist  |

---

# 1. Gutter Utility: keine mehrfachen offenen Kommentar-Editoren

## Ziel

Wenn bei einer Diff-Zeile schon ein leerer/offener Kommentar-Editor existiert, darf ein weiterer Klick auf das Plus **keinen zweiten Editor** öffnen. Erst nach **Save**, **Cancel** oder **Delete** darf wieder ein neuer Kommentar an gleicher Stelle entstehen.

## Aktueller Ansatz

`PierreDiffViewer.svelte` und `PierreDirectoryVirtualDiffView.svelte` hängen an `@pierre/diffs` die Gutter-Utility- und Annotation-Logik. Das passt grundsätzlich; der Bug liegt in Difflys Kommentar-State, nicht in der Library. Die File- und Directory-Diff-Renderer verwenden schon die Pierre-Diff-Komponenten und eigene Kommentar-Renderer.  

## Umsetzung

**Neue gemeinsame Helper-Datei:**

```txt
src/lib/compare/comment-drafts.ts
```

Funktionen:

```ts
commentDraftKey(itemId, side, lineNumber)
findOpenDraft(...)
upsertDraftOrFocusExisting(...)
markDraftSaved(...)
removeDraft(...)
```

## Datenmodell

Kommentar-Metadata erweitern:

```ts
interface DifflyCommentAnnotation {
  id: string
  text: string
  draft?: boolean
  savedAt?: string
}
```

## Verhalten

| Aktion                                                | Ergebnis                               |
| ----------------------------------------------------- | -------------------------------------- |
| Plus-Klick, kein Draft vorhanden                      | neuen Draft erstellen                  |
| Plus-Klick, Draft an gleicher Datei/Seite/Zeile offen | bestehenden Editor fokussieren/flashen |
| Save                                                  | `draft = false`, persistieren          |
| Delete/Cancel bei leerem Draft                        | Annotation entfernen                   |
| Plus-Klick nach Save                                  | neuer Kommentar erlaubt                |

## Dateien

```txt
src/lib/compare/PierreDiffViewer.svelte
src/lib/compare/PierreDirectoryVirtualDiffView.svelte
src/lib/compare/directory-code-view-comments.ts
src/lib/compare/comment-drafts.ts
```

## Acceptance Criteria

* Mehrfaches Plus-Klicken erzeugt **maximal einen offenen Editor**.
* Bereits gespeicherte Kommentare blockieren neue Kommentare nicht.
* Verhalten ist identisch in File Mode und Directory Mode.
* Kommentare werden weiterhin korrekt persistiert.

---

# 2. Diffs Custom Header

## Ziel

Header ähnlich wie auf der diffs.com-Webseite:

* Dateityp-Icon links
* Icon/Toggle klickbar zum Einklappen
* Dateiname prominent
* Pfad/Status/Metadaten kompakt
* gleiche Optik in Directory-Diffs und File-Diffs
* keine eigene Diff-Engine bauen

Der aktuelle Directory-Header hat bereits Custom-Renderer für Collapse Button und Header Metadata in `directory-code-view-renderers.ts`.  

## Pierre-Nutzung

**Nutzen:** `@pierre/diffs` Header-Hooks:

* `renderHeaderPrefix`
* `renderHeaderMetadata`
* optional `onPostRender`
* `getFiletypeFromFileName`

**Nicht bauen:** eigene Header ausserhalb des Pierre-CodeViews, weil das Sticky Header, Virtualisierung und Scroll-Position unnötig kaputt machen kann.

## Umsetzung

### 2.1 Header-Renderer neu strukturieren

Neue Datei:

```txt
src/lib/compare/diff-header-renderers.ts
```

Exportiert:

```ts
renderDiffHeaderPrefix(...)
renderDiffHeaderMetadata(...)
renderFileTypeIcon(...)
```

### 2.2 Directory Mode

`PierreDirectoryVirtualDiffView.svelte` nutzt bereits `renderHeaderPrefix` und `renderHeaderMetadata` über eigene Renderer. Diese sollen ersetzt/erweitert werden:

```ts
renderHeaderPrefix: renderDiffHeaderPrefix
renderHeaderMetadata: renderDiffHeaderMetadata
```

### 2.3 File Mode

`PierreDiffViewer.svelte` bekommt denselben Header-Renderer, damit einzelne File-Diffs nicht anders aussehen.

### 2.4 Collapse-Verhalten

* Klick auf Icon/chevron klappt Datei ein/aus.
* `aria-expanded` korrekt setzen.
* Tooltip: `Collapse file diff` / `Expand file diff`.
* Keyboard: Button fokussierbar, Enter/Space funktionieren.

### 2.5 Header-Aufbau

```txt
[chevron/file-icon]  filename.ext      M / Added / Deleted / Renamed
                    path/to/file.ext   +123 -45
```

## Dateien

```txt
src/lib/compare/diff-header-renderers.ts
src/lib/compare/directory-code-view-renderers.ts
src/lib/compare/PierreDirectoryVirtualDiffView.svelte
src/lib/compare/PierreDiffViewer.svelte
src/lib/compare/directory-code-view.css
src/lib/styles.css oder relevante CSS-Datei
```

## Acceptance Criteria

* Header ist optisch einheitlich in File und Directory Mode.
* Icon-Klick klappt Datei ein/aus.
* Sticky Header funktioniert weiter.
* Kein Scroll-Jump beim Collapse/Expand.
* Binary/Unsupported/Loading States sehen sauber aus.

---

# 3. Settings-Namen gleich wie Pierre `diffs`/`trees` Website

## Ziel

Die Settings sollen exakt nach den Pierre-Optionen benannt sein, statt freie Diffly-Bezeichnungen zu verwenden. Intern sollen die bestehenden Persistenz-Keys aber **nicht unnötig geändert** werden.

Aktuell gibt es schon viele Pierre-nahe Settings: Viewer-Settings wie `diffStyle`, `codeOverflow`, `diffIndicators`, `lineDiffType`, `hunkSeparators`, `expandUnchanged`, `tokenHover` und Tree-Settings wie `density`, `flattenEmptyDirectories`, `stickyFolders`, `dragAndDrop`, `renaming`, `iconSet`, `coloredIcons`.  

## Umsetzung

Neue zentrale Metadata-Datei:

```txt
src/lib/settings/pierre-setting-labels.ts
```

Beispiel:

```ts
export const diffSettingLabels = {
  diffStyle: {
    label: 'diffStyle',
    description: 'Split or unified diff layout.',
  },
  lineDiffType: {
    label: 'lineDiffType',
    description: 'Controls word/char inline highlighting.',
  },
}
```

## Settings-Gruppierung

### Diffs

* `diffStyle`
* `codeOverflow`
* `diffIndicators`
* `lineDiffType`
* `hunkSeparators`
* `expandUnchanged`
* `collapsedContextThreshold`
* `expansionLineCount`
* `disableLineNumbers`
* `disableFileHeader`
* `disableBackground`
* `disableVirtualizationBuffers`
* `stickyHeader`
* `syntaxMode`
* `preferredHighlighter`
* `useCSSClasses`
* `tokenizeMaxLineLength`
* `tokenizeMaxLength`
* `maxLineDiffLength`
* `lineHoverHighlight`
* `enableTokenInteractionsOnWhitespace`
* `enableGutterUtility`
* `enableLineSelection`
* `controlledSelection`
* `tokenHover`

### Trees

* `density`
* `customDensity`
* `flattenEmptyDirectories`
* `stickyFolders`
* `initialExpansion`
* `initialExpansionDepth`
* `initialExpandedPaths`
* `sortMode`
* `searchMode`
* `search`
* `searchFakeFocus`
* `searchBlurBehavior`
* `initialSearchQuery`
* `initialVisibleRowCount`
* `itemHeight`
* `overscan`
* `dragAndDrop`
* `renaming`
* `iconSet`
* `coloredIcons`
* `showUnmodified` neu

## Acceptance Criteria

* Labels entsprechen den Option-Namen.
* Tooltips erklären trotzdem verständlich, was die Option macht.
* Persistierte Sessions bleiben kompatibel.
* Alte User-Settings werden nicht resetet.

---

# 4. `trees: show unmodified`

## Ziel

In der Tree-Sidebar sollen optional auch unveränderte Dateien sichtbar sein.

## Wichtige Entscheidung

Das ist **nicht nur ein UI-Toggle**. Aktuell arbeitet der Diff-Tree primär mit Diff-Einträgen. `EntryStatus` kennt momentan nur veränderte/fehlende/unsupported Zustände wie `modified`, `leftOnly`, `rightOnly`, `unsupported`. 

Darum braucht es ein Datenmodell für unveränderte Dateien.

## Empfehlung

`showUnmodified` nur dort aktivieren, wo es technisch sauber ist:

| Mode                    | Empfehlung                                          |
| ----------------------- | --------------------------------------------------- |
| Local Directory Compare | **Ja**                                              |
| Git Working Tree        | **Ja, optional**, über `git ls-files` + Diff-Status |
| Git Branch/Commit Diff  | eher **Nein** oder nur mit Pfadlimit                |
| GitHub PR/Compare       | **Nein**, ausser später mit GitHub Tree API/Auth    |

## Umsetzung

### 4.1 Typ erweitern

```ts
export type EntryStatus =
  | 'modified'
  | 'leftOnly'
  | 'rightOnly'
  | 'unsupported'
  | 'unchanged'
```

### 4.2 Tree Settings erweitern

```ts
interface CompareTreeSettings {
  showUnmodified: boolean
}
```

Default:

```ts
showUnmodified: false
```

### 4.3 Local Provider

Directory-Compare bekommt Option:

```ts
includeUnchanged: boolean
```

Unveränderte Dateien werden als:

```ts
{
  relativePath,
  status: 'unchanged',
  leftPath,
  rightPath,
  leftSize,
  rightSize,
}
```

zurückgegeben.

### 4.4 Tree Sidebar

`@pierre/trees` bekommt weiterhin einfach `paths`. Unchanged-Dateien haben:

* kein Status-Badge
* andere Text-Opacity
* nicht diffbar
* Klick zeigt entweder “No changes” oder scrollt nicht zu Diff

### 4.5 Diff-Liste

`DirectoryDiffList` darf `unchanged` **nicht** als renderbaren Diff anzeigen.

## Acceptance Criteria

* Toggle in Settings sichtbar.
* Bei `off`: Verhalten wie heute.
* Bei `on`: Tree zeigt unveränderte Dateien.
* Diff-Liste bleibt auf echte Diffs beschränkt.
* Keine Performance-Katastrophe bei grossen Repos.

---

# 5. Tree Context Menu Composition

## Ziel

Rechtsklick auf Tree-Eintrag öffnet sinnvolle Aktionen.

## Entscheidung

Ja, einbauen. Aber nur Aktionen anzeigen, die im aktuellen Mode Sinn machen.

## Pierre-Nutzung

**Primär:** Falls `@pierre/trees` saubere Context-Menu-Composition-Hooks anbietet, diese verwenden.

**Fallback:** Eigene Svelte-Overlay-Context-Menu-Komponente, aber ohne fragile Shadow-DOM-Hacks, wenn möglich.

Der aktuelle Tree ist bereits über `FileTree` aus `@pierre/trees` gekapselt. 

## Actions

| Action                    |    Local | Git Working Tree |               Git Ref/Commit | GitHub |
| ------------------------- | -------: | ---------------: | ---------------------------: | -----: |
| Open file                 |       ja |               ja | read-only temp/export später |   nein |
| Reveal in Explorer        |       ja |               ja |                         nein |   nein |
| Copy relative path        |       ja |               ja |                           ja |     ja |
| Copy absolute path        |       ja |               ja |                         nein |   nein |
| Collapse/Expand directory |       ja |               ja |                           ja |     ja |
| Stage file                |     nein |               ja |                         nein |   nein |
| Unstage file              |     nein |               ja |                         nein |   nein |
| Discard changes           | optional |  ja, mit Confirm |                         nein |   nein |
| Rename                    | optional |         optional |                         nein |   nein |
| Move                      | optional |         optional |                         nein |   nein |

## Backend IPC

Neue Methoden:

```ts
openPath(path)
revealPath(path)
copyPath? // kann renderer-only sein
renamePath(oldPath, newPath)
movePath(oldPath, newPath)
stagePath(repo, path)
unstagePath(repo, path)
discardPath(repo, path)
```

## Acceptance Criteria

* Context Menu zeigt keine gefährlichen Aktionen im falschen Mode.
* Destruktive Actions brauchen Bestätigung.
* Nach Dateioperation wird Compare automatisch refreshed.
* Keyboard/Focus nicht kaputt.

---

# 6. Tree Drag & Drop / Rename

## Direkte Antwort

**Nein, standardmässig soll Drag & Drop/Rename nicht still echte Dateien auf der Disk verschieben.**

Sinnvoller Plan:

1. Default: **aus**
2. Setting: `Enable tree file operations`
3. Bei echten Dateioperationen: immer Confirm oder Undo-Möglichkeit
4. GitHub/Commit/Branch-Range: read-only
5. Local/Git Working Tree: erlaubt, aber sicher begrenzt

Die Tree-Settings enthalten bereits `dragAndDrop` und `renaming`, aktuell default `false`. 

## Zwei Modi

### A. Preview Mode

Verschieben/Umbenennen verändert nur eine geplante Operationsliste:

```txt
Rename planned:
src/a.ts -> src/b.ts
```

Noch keine Disk-Änderung. User muss “Apply” drücken.

### B. Real File Mode

Nur wenn explizit aktiviert:

* Local Compare: echte Datei umbenennen/verschieben
* Git Working Tree: echte Dateioperation, Git erkennt Rename später selbst
* optional später: `git mv`

## Sicherheitsregeln

* Pfad muss unter Compare-Root oder Repo-Root bleiben.
* Keine Overwrite-Operation ohne Confirm.
* Keine Symlink-Tricks.
* Keine Operation in GitHub/Commit/RefRange.
* Bei Fehler: Compare-State nicht teilweise refreshen.

## Acceptance Criteria

* Drag/Rename funktioniert nur, wenn Setting aktiv ist.
* Kein stilles Verschieben.
* Nach Operation wird Compare refreshed.
* Git erkennt Rename als Rename/Modify sauber.

---

# 7. Review Mode: Accept/Reject Changes

## Ziel

Review Mode in Compare View, aber je Mode unterschiedlich.

## Wichtige Entscheidung

`@pierre/diffs` soll hier **nur UI, Selection, Gutter, Header Buttons und Annotation Hooks** liefern. Die eigentlichen Änderungen an Dateien/Git müssen über Difflys Backend laufen. Die Renderer sind bereits Pierre-basiert; die App routet Directory-Mode über `DirectoryDiffList` und File-Text-Diffs über `PierreDiffViewer`. 

## Mode-Matrix

| Mode                       | Accept/Reject sinnvoll? | Umsetzung                           |
| -------------------------- | ----------------------: | ----------------------------------- |
| Local File                 |                      ja | Whole-file zuerst, Hunk später      |
| Local Directory            |                      ja | Whole-file pro Datei zuerst         |
| Git Working Tree: Unstaged |                      ja | discard/apply/stage optional        |
| Git Working Tree: Staged   |                      ja | unstage/stage/discard kontrolliert  |
| Git Working Tree: All      |         ja, aber heikel | Actions je Scope anzeigen           |
| Git Commit                 |                    nein | read-only, Export Patch             |
| Git Ref Range              |                    nein | read-only, Export Patch             |
| GitHub PR/Compare          |       nein für Mutation | Review Notes/Comments, Export Patch |

## Implementierungsstufen

### Stufe 1: Review Toggle

In Compare Topbar:

```txt
[Review Mode: off/on]
```

Bei aktivem Review Mode:

* Header zeigt Actions
* Gutter kann Review-Actions zeigen
* Kommentare bleiben aktiv

### Stufe 2: Whole-file Actions

Pro Datei:

```txt
Accept left
Accept right
Reject file
Open external
Copy patch
```

Bei Local Compare:

* “Accept right” kopiert rechte Datei auf linke Datei.
* “Accept left” kopiert linke Datei auf rechte Datei.
* Delete/Added-Fälle separat bestätigen.

### Stufe 3: Git Actions

Für Git Working Tree:

```txt
Stage file
Unstage file
Discard unstaged file
Restore from HEAD
```

### Stufe 4: Hunk-Level

Erst später:

* ausgewählten Hunk extrahieren
* Patch anwenden/reversen
* Konflikte sauber anzeigen

## Backend

Neue Commands:

```ts
applyFileChange(...)
discardFileChange(...)
stagePath(...)
unstagePath(...)
discardWorkingTreePath(...)
applyPatch(...)
reversePatch(...)
```

`preload.ts` exponiert aktuell bereits Compare- und Diff-Session-APIs; für echte Review-Actions müssen dort neue IPC-Funktionen ergänzt werden. 

## Acceptance Criteria

* Review Mode ist standardmässig aus.
* Read-only Quellen zeigen keine mutierenden Buttons.
* Jede destruktive Action hat Confirm.
* Nach Action wird Diff-Session refreshed.
* Keine Mutation in GitHub Mode.

---

# 8. Icons verbessern

## Ziel

Ein konsistentes Icon-System für:

* Tree
* Diff Header
* Setup Mode
* Git/GitHub
* Status Badges
* Window Topbar

## Entscheidung

Nicht überall Inline-SVGs verteilen. Besser:

```txt
src/lib/icons/
  file-icons.ts
  app-icons.ts
  git-icons.ts
  status-icons.ts
```

## Pierre-Nutzung

* Tree: weiterhin `@pierre/trees` Icon-Set nutzen, wo passend.
* Diff Header: Dateityp über `getFiletypeFromFileName` bestimmen und Icon aus eigener Registry holen.
* Website-SVGs nur übernehmen, wenn sie aus dem Package sauber exportiert oder lizenzrechtlich klar nutzbar sind.

## Acceptance Criteria

* Tree-Icons und Diff-Header-Icons passen zusammen.
* Kein mehrfach kopierter SVG-Code.
* Icons funktionieren im Light/Dark Theme.
* Unknown file fallback vorhanden.

---

# 9. Custom Windows Top Bar

## Ziel

Eigene Topbar statt nativer Windows-Leiste, aber ohne App-Toolbar und Window-Drag-Zone zu vermischen.

Aktuell erstellt `main.ts` ein normales `BrowserWindow` ohne `frame: false`, versteckt aber die Menüleiste.  Außerdem ist `AppTopBar.svelte` bereits eine eigene App-Bar mit Brand, Context, Middle und Actions. 

## Empfehlung

Nicht `AppTopBar` komplett ersetzen. Besser:

```txt
WindowTitleBar
  AppTopBar / CommandBar darunter oder integriert
```

## Umsetzung

### 9.1 Electron

In `BrowserWindow`:

```ts
frame: false
titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined
```

Erst Windows sauber machen, macOS später feiner.

### 9.2 IPC

Neue Preload-API:

```ts
windowControls: {
  minimize()
  maximize()
  restore()
  toggleMaximize()
  close()
  isMaximized()
  onMaximizedChange(callback)
}
```

### 9.3 UI

Neue Komponente:

```txt
src/lib/window/WindowTitleBar.svelte
```

Enthält:

* App Icon
* Titel / Repo / aktueller Kontext
* Drag Region
* Minimize
* Maximize/Restore
* Close

CSS:

```css
.window-titlebar {
  app-region: drag;
}

.window-titlebar button,
.window-titlebar input,
.window-titlebar select {
  app-region: no-drag;
}
```

## Acceptance Criteria

* Fenster kann gezogen werden.
* Doppelklick maximiert/restored.
* Minimize/Maximize/Close funktionieren.
* Buttons in AppTopBar bleiben klickbar.
* Keine kaputten Hitboxes bei Setup/GitHub/Git Mode.

---

# 10. Git Mode Workflow neu denken

## Aktueller Stand

Die App hat `local`, `git`, `github` als Setup Modes, und Git kennt bereits Working Tree, Branch/Ref Range und Single Commit im Typmodell.   

Das Git-Setup hält bereits State für `selectionKind`, `workingTreeScope`, `baseRef`, `headRef`, `notation` und `commitRef`. 

## Ziel

Der User soll nicht Git-Begriffe raten müssen. Die UI soll klar zeigen:

```txt
Was wird links verglichen?
Was wird rechts verglichen?
Welchem git diff entspricht das?
```

## Neue Git-Setup-Struktur

### Linke Spalte

* Recent repos
* Repo picker
* Branch/HEAD/dirty summary

### Hauptbereich: Compare Cards

| Card               | Semantik                | Command-Hinweis                      |
| ------------------ | ----------------------- | ------------------------------------ |
| Working Tree       | HEAD ↔ Working Tree     | `git diff HEAD`                      |
| Staged             | HEAD ↔ Index            | `git diff --cached`                  |
| Unstaged           | Index ↔ Working Tree    | `git diff`                           |
| Untracked          | Empty ↔ Untracked files | `git ls-files --others`              |
| Branch / Ref       | Base ↔ Head             | `git diff base..head`                |
| Pull Request Style | Merge-base ↔ Head       | `git diff base...head`               |
| Single Commit      | Parent ↔ Commit         | `git show`/`git diff commit^ commit` |
| Two Commits        | Commit A ↔ Commit B     | `git diff A B`                       |

## Compare View

Bei Git Working Tree:

* Scope Tabs bleiben sinnvoll: All/Staged/Unstaged/Untracked.
* Zusätzlich oben klarer Source Header:

```txt
repo-name · main · HEAD ↔ Working Tree
```

## Backend-Erweiterung

Falls noch nicht vorhanden:

```ts
GitSelection =
  | workingTree
  | refRange
  | commit
  | commitRange // neu, falls explizit zwei Commits nötig
  | pathHistory // später
```

## Acceptance Criteria

* User sieht immer klar, was verglichen wird.
* Git-Diff-Semantik ist im UI sichtbar.
* Working Tree bleibt der schnellste Default.
* Branch/Ref/Commit Auswahl ist nicht in einem engen Form-Block versteckt.
* GitHub PR-style `base...head` ist klar getrennt von `base..head`.

---

# 11. GitHub Mode UI überdenken

## Aktueller Stand

GitHub Setup hat aktuell Recent PRs und ein URL-Input/Metadata-Preview; die URL wird live geparst und treibt den Compare Button.   

## Ziel

GitHub Mode sollte nicht nur ein URL-Feld sein, sondern ein klarer PR/Compare-Workflow.

## Neue Struktur

### Tab/Card 1: Pull Request

Input:

```txt
https://github.com/owner/repo/pull/123
```

Preview:

```txt
owner/repo #123
Title
State
base -> head
changed files
[Open on GitHub]
```

### Tab/Card 2: Compare URL

Input:

```txt
https://github.com/owner/repo/compare/base...head
```

Preview:

```txt
owner/repo
base...head
PR-style / merge-base diff
```

### Recents

Aktuell nur PRs. Besser:

```ts
RecentGithubDiff =
  | RecentGithubPullRequest
  | RecentGithubCompare
```

## Keine Accept/Reject-Mutation

GitHub Mode bleibt read-only:

* Kommentare lokal
* Export Patch
* Open on GitHub
* später optional Auth/token/private repos

## Acceptance Criteria

* PR und Compare URL sind sichtbar getrennt.
* Recent-Liste kann PRs und Compare URLs anzeigen.
* Fehlerzustände sind klar: private repo, rate limit, invalid URL.
* Kein “Accept/Reject” für remote GitHub.

---

# 12. Tree Context + Review Actions zusammenführen

Context Menu und Review Mode sollten nicht getrennt wild wachsen. Es braucht eine zentrale Action-Registry:

```txt
src/lib/actions/compare-actions.ts
```

Beispiel:

```ts
interface CompareAction {
  id: string
  label: string
  icon: string
  danger?: boolean
  enabled(source, entry): boolean
  run(context): Promise<void>
}
```

Dann können dieselben Actions genutzt werden in:

* Tree Context Menu
* Diff Header
* Review Toolbar
* Keyboard Shortcuts

## Vorteil

* keine doppelte Logik
* GitHub bekommt automatisch keine mutierenden Actions
* Local/Git bekommen nur passende Actions
* Settings können Actions später gezielt aktivieren/deaktivieren

---

# Konkrete Implementierungs-Reihenfolge

## PR 1 — Gutter Comment Guard

**Ziel:** Bug sofort fixen.

Dateien:

```txt
PierreDiffViewer.svelte
PierreDirectoryVirtualDiffView.svelte
directory-code-view-comments.ts
comment-drafts.ts
```

Tests:

* Draft doppelt klicken
* Save danach neu klicken
* Delete danach neu klicken

---

## PR 2 — Custom Diff Header

**Ziel:** sichtbarer UX-Fortschritt.

Dateien:

```txt
diff-header-renderers.ts
directory-code-view-renderers.ts
PierreDirectoryVirtualDiffView.svelte
PierreDiffViewer.svelte
directory-code-view.css
```

Nutzen:

* `@pierre/diffs` Header Hooks
* `getFiletypeFromFileName`

---

## PR 3 — Settings Labels + Struktur

**Ziel:** Settings sauber machen.

Dateien:

```txt
pierre-setting-labels.ts
SettingsRoute.svelte / Settings Components
settings-normalizers.ts
types.ts
```

Keine Persistenz-Breaks.

---

## PR 4 — Icon Registry

**Ziel:** Icons zentralisieren.

Dateien:

```txt
src/lib/icons/file-icons.ts
src/lib/icons/app-icons.ts
src/lib/icons/status-icons.ts
diff-header-renderers.ts
PierreDirectoryTree.svelte
```

---

## PR 5 — `showUnmodified`

**Ziel:** Tree kann vollständigen Baum anzeigen.

Dateien:

```txt
types.ts
settings-normalizers.ts
LocalProvider / directory compare service
PierreDirectoryTree.svelte
DirectoryDiffList.svelte
```

Erst Local Directory. Git später.

---

## PR 6 — Custom Windows Top Bar

**Ziel:** App wirkt wie richtige Desktop-App.

Dateien:

```txt
src-electron/main.ts
src-electron/preload.ts
src/lib/api.ts
src/lib/window/WindowTitleBar.svelte
App.svelte oder AppTopBar.svelte
```

Erst Windows stabil machen.

---

## PR 7 — Tree Context Menu

**Ziel:** produktivere Tree-Navigation.

Dateien:

```txt
PierreDirectoryTree.svelte
compare-actions.ts
context-menu component
preload/backend IPC für open/reveal
```

Nur sichere Actions zuerst.

---

## PR 8 — Drag/Rename Preview

**Ziel:** testen, ohne Dateien direkt zu verändern.

Dateien:

```txt
PierreDirectoryTree.svelte
file-operation-preview.ts
CompareDirectorySidebar.svelte
```

Real FS erst danach.

---

## PR 9 — Review Mode Skeleton

**Ziel:** UI und Source-Matrix aufbauen, noch keine riskanten Hunk-Patches.

Dateien:

```txt
types.ts
CompareScreen.svelte
diff-header-renderers.ts
compare-actions.ts
review-mode.ts
```

Whole-file Actions zuerst.

---

## PR 10 — Git Workflow Rework

**Ziel:** Git Setup verständlicher machen.

Dateien:

```txt
GitSetupPanel.svelte
GitRepositoryPicker.svelte
GitScopeTabs.svelte
types.ts
git-provider.ts
```

---

## PR 11 — GitHub UI Rework

**Ziel:** PR/Compare sauber darstellen.

Dateien:

```txt
GithubSetupPanel.svelte
GithubPrInput.svelte
github-url.ts
recents-store
types.ts
```

---

# Was ich bewusst nicht sofort einbauen würde

| Idee                                                   | Entscheidung                                |
| ------------------------------------------------------ | ------------------------------------------- |
| GitHub Accept/Reject                                   | Nein, remote mutation/Auth zu gross         |
| `showUnmodified` für GitHub PRs                        | Nein, zu teuer/unklar ohne Tree API/Auth    |
| Native Window Frame auf allen OS gleichzeitig ersetzen | Nein, erst Windows                          |

---

# Definition of Done

Für jeden PR:

* `npm run check` muss laufen.
* `npm run test` muss laufen. 
* Kein Scroll-Regression bei grossen Directory-Diffs.
* Kein kaputter Sticky Header.
* Keine mutierende Action ohne explizite Bestätigung.
* GitHub/Commit/RefRange bleiben read-only.
* Settings sind rückwärtskompatibel.
* Neue Features sind standardmässig konservativ eingestellt.

---

