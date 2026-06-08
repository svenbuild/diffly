# Roadmap: A = UI, B = Backend/Types/State/Tests

## Grundstruktur

Du baust es als zwei getrennte Tracks:

```txt
A-Track = UI / UX / Svelte Components / Screens
B-Track = Types / IPC / Backend / Git / GitHub / Storage / Tests
```

Die App soll am Ende so funktionieren:

```txt
Setup Mode:
  Local  -> lokale Files/Folders vergleichen
  Git    -> lokales Git Repo auswählen und Git-Diffs anzeigen
  GitHub -> PR-Link eingeben und GitHub-PR-Diff anzeigen

Compare View:
  bekommt immer normalisierte Diff-Daten
  egal ob Quelle Local, Git oder GitHub ist
```

Wichtig: `Local/Git/GitHub` darf **nicht** in `CompareMode` rein. `CompareMode` bleibt `file | directory`; neu kommt `SetupMode = 'git' | 'local' | 'github'`. In deinem Code existiert `CompareMode` bereits als `file | directory`, und `CompareSource` geht schon in Richtung `localPaths`, `gitRepository`, `githubPullRequest`. Das sollte ausgebaut, nicht vermischt werden.

---

# A-Track: UI / Frontend

# B-Track: Backend / Types / Storage / Git / GitHub / Tests

---

# Empfohlene Umsetzung in echter Reihenfolge

Nicht erst den ganzen A-Track und dann den ganzen B-Track bauen. Besser so:

```txt
B1  Types
B2  IPC/API
B3  DiffSessionService
B4  LocalProvider
A1  SetupModeSlider
A2  SetupScreen splitten
A3  LocalSetupPanel
B6  Recents Store
B7  Git Runner
B8  Git Repo Validation
A4  GitSetupPanel Grundlayout
A5  GitRepositoryPicker
B9  Git Refs
A6  Git Working Tree UI
B10 Git Parser
B11 Git Working Tree Entries
B5  Snapshot FileDiff
B12 Git Working Tree File Details
A10 SourceHeader
A11 Git Scope Tabs
A12 Status Badges
A13 Source Buttons
A14 Empty/Error States
A7  Branch/Ref UI
B13 Branch/Ref Backend
A8  Commit UI
B14 Commit Backend
B15 GitHub URL Parser
B16 GitHub Metadata/Files
A9  GitHubSetupPanel
B17 GitHubProvider
B18 Session Restore
B19 Parser/Storage Tests
B20 Git Integration Tests
B21 E2E Tests
```

---

# Sortierte Detailplanung

## B1 — Types sauber erweitern

### Ziel

Sauberes Source-Modell.

### Datei

```txt
src/lib/types.ts
```

### Neue Types

```ts
export type SetupMode = 'git' | 'local' | 'github'

export type DiffSource =
  | LocalDiffSource
  | GitDiffSource
  | GithubPullRequestSource

export interface LocalDiffSource {
  kind: 'local'
  leftPath: string
  rightPath: string
  compareMode: 'file' | 'directory'
}

export interface GitDiffSource {
  kind: 'git'
  repoPath: string
  repositoryRoot: string
  selection: GitSelection
}

export type GitSelection =
  | {
      kind: 'workingTree'
      initialScope: GitWorkingTreeScope
    }
  | {
      kind: 'refRange'
      baseRef: string
      headRef: string
      notation: 'twoDot' | 'threeDot'
    }
  | {
      kind: 'commit'
      commitRef: string
    }

export type GitWorkingTreeScope =
  | 'all'
  | 'staged'
  | 'unstaged'
  | 'untracked'

export interface GithubPullRequestSource {
  kind: 'githubPullRequest'
  owner: string
  repo: string
  pullNumber: number
  url: string
}
```

### Diff Entry Types

```ts
export type DiffEntryStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'typeChanged'
  | 'untracked'
  | 'conflicted'
  | 'unsupported'

export interface DiffEntry {
  id: string
  path: string
  oldPath?: string | null
  displayPath: string
  status: DiffEntryStatus
  scope?: GitWorkingTreeScope
  leftSize: number | null
  rightSize: number | null
  binary?: boolean
}
```

### Session erweitern

```ts
export interface PersistedSession {
  setupMode?: SetupMode
  source?: DiffSource
  // bestehende Felder bleiben
}
```

Aktuell speichert `PersistedSession` bereits `source?: CompareSource`, aber noch nicht sauber für das neue Mode-System.

### Akzeptanz

* Alte Sessions crashen nicht.
* TypeScript check läuft.
* Bestehender Local-Code kompiliert.

---

## B2 — Renderer API + IPC erweitern

### Ziel

Nicht mehr alles über `comparePaths(left, right, mode)` lösen.

Aktuell ist die Renderer-API stark Local-Pfad-basiert: `comparePaths`, `startDirectoryCompare`, `pollDirectoryCompare`, `openCompareItem`. Das bleibt für Local erst bestehen, aber Git/GitHub bekommen eine Source-neutrale Session-API.

### Dateien

```txt
src/global.d.ts
src/lib/api.ts
src-electron/preload.ts
src-electron/services/backend.ts
```

### Neue API

```ts
createDiffSession(source: DiffSource, options: CompareOptions): Promise<CreateDiffSessionResponse>
listDiffEntries(sessionId: string, filter?: DiffEntryFilter): Promise<DiffEntry[]>
openDiffEntry(sessionId: string, entryId: string, options: CompareOptions): Promise<FileDiffResult>
refreshDiffSession(sessionId: string): Promise<CreateDiffSessionResponse>
disposeDiffSession(sessionId: string): Promise<void>
```

### Filter

```ts
export interface DiffEntryFilter {
  scope?: GitWorkingTreeScope
  search?: string
}
```

### Akzeptanz

* IPC ist in `global.d.ts`, `api.ts`, preload und backend registriert.
* Alte Local-API bleibt noch funktional.
* Neue API kann mit LocalProvider testweise Local-Diffs liefern.

---

## B3 — DiffSessionService

### Ziel

Zentrale Backend-Schicht für alle Quellen.

### Datei

```txt
src-electron/services/diff/diff-session-service.ts
```

### Struktur

```ts
interface DiffSession {
  id: string
  source: DiffSource
  createdAt: number
  updatedAt: number
  entries: DiffEntry[]
  metadata: DiffSessionMetadata
}
```

```ts
class DiffSessionService {
  create(source, options)
  listEntries(sessionId, filter)
  openEntry(sessionId, entryId, options)
  refresh(sessionId)
  dispose(sessionId)
}
```

### Provider-Auswahl

```ts
switch (source.kind) {
  case 'local':
    return localProvider
  case 'git':
    return gitProvider
  case 'githubPullRequest':
    return githubProvider
}
```

### Akzeptanz

* Session ID wird erstellt.
* Entries können gelesen werden.
* File Detail kann geöffnet werden.
* Sessions werden aufgeräumt.

---

## B4 — LocalProvider als Kompatibilitätsschicht

### Ziel

Local funktioniert über die neue Provider-Struktur.

### Datei

```txt
src-electron/services/providers/local-provider.ts
```

### Verhalten

* Nutzt bestehende lokale Logik:

  * Directory walk
  * File diff
  * Binary detection
  * Cache
* Mapped alte `DirectoryEntryResult` auf neue `DiffEntry`.

Aktuell existiert die lokale Compare-Logik direkt in `backend.ts`, inklusive Directory-Jobs und Cache. Das sollte schrittweise in den LocalProvider wandern.

### Akzeptanz

* Local Compare läuft über `createDiffSession`.
* Alte Directory-/File-Compare-Funktionen können danach intern Wrapper sein.
* Keine sichtbare Änderung für Local-Nutzer.

---

## A1 — SetupModeSlider in Topbar

### Ziel

Im Setup-Screen kommt oben mittig ein Slider:

```txt
[ Local | Git | GitHub ]
```

Standardmässig ist `Git` aktiv.

### Dateien

```txt
src/lib/setup/SetupModeSlider.svelte
src/lib/screens/SetupScreen.svelte
src/App.svelte
src/lib/types.ts
```

### UI-Verhalten

```txt
Diffly  Setup        [ Local | Git | GitHub ]                   [ Compare ] [ Settings ]
```

### Tasks

1. `SetupModeSlider.svelte` erstellen.
2. `setupMode` in `App.svelte` als State führen:

```ts
let setupMode: SetupMode = initialSession?.setupMode ?? 'git'
```

3. Slider bekommt:

```ts
export let mode: SetupMode
export let onChange: (mode: SetupMode) => void
```

4. `SetupScreen.svelte` rendert im `middle`-Slot des `AppTopBar` den Slider.
5. Beim Wechsel:

   * Fehlerbanner löschen
   * Compare-Button neu validieren
   * Setup-Panel wechseln
   * keine Compare-Daten löschen, solange User nur im Setup-Screen ist

### Akzeptanz

* App startet im Git Setup.
* Slider ist sichtbar.
* Wechsel zwischen Local/Git/GitHub funktioniert ohne Reload.
* Settings-Button bleibt rechts.
* Compare-Button ist rechts und reagiert je nach aktivem Modus.

---

## A2 — SetupScreen in Shell + Panels splitten

### Ziel

`SetupScreen.svelte` soll nicht mehr direkt die ganze Picker-Logik enthalten, sondern nur noch Shell sein.

Aktuell rendert `SetupScreen.svelte` direkt die PickerPanes in einer `picker-workspace`. Diese Struktur wird für mehrere komplett unterschiedliche Modi zu starr.

### Neue Struktur

```txt
src/lib/screens/SetupScreen.svelte
src/lib/setup/LocalSetupPanel.svelte
src/lib/setup/GitSetupPanel.svelte
src/lib/setup/GithubSetupPanel.svelte
src/lib/setup/SetupModeSlider.svelte
src/lib/setup/RecentSourceList.svelte
```

### SetupScreen nach Umbau

```svelte
<AppTopBar context="Setup">
  {#snippet middle()}
    <SetupModeSlider mode={setupMode} onChange={setSetupMode} />
  {/snippet}

  {#snippet actions()}
    <button disabled={!canCompare || loading}>Compare</button>
    <button>Settings</button>
  {/snippet}
</AppTopBar>

{#if setupMode === 'local'}
  <LocalSetupPanel ... />
{:else if setupMode === 'git'}
  <GitSetupPanel ... />
{:else if setupMode === 'github'}
  <GithubSetupPanel ... />
{/if}
```

### Akzeptanz

* SetupScreen ist nur noch Layout/Shell.
* Local-UI sieht noch gleich aus wie vorher.
* Git/GitHub können unabhängig entwickelt werden.
* Kein Modus-spezifischer Code mehr direkt im SetupScreen ausser Panel-Auswahl.

---

## A3 — LocalSetupPanel

### Ziel

Bestehende App-Funktionalität vollständig erhalten.

### UI

```txt
Left target                                      Right target
┌────────────────────────────────────┐           ┌────────────────────────────────────┐
│ Explorer wie bisher                │           │ Explorer wie bisher                │
└────────────────────────────────────┘           └────────────────────────────────────┘
```

### Files

```txt
src/lib/setup/LocalSetupPanel.svelte
src/lib/PickerPane.svelte
src/App.svelte
```

### Tasks

1. Bestehende `pickerSides`-Logik aus `SetupScreen` in `LocalSetupPanel` verschieben.
2. Beide PickerPanes bleiben:

   * left
   * right
3. `Compare` bleibt nur aktiv wenn:

   * left target gesetzt
   * right target gesetzt
   * beide existieren
   * beide gleicher Typ sind oder sinnvoll vergleichbar
   * nicht exakt dieselbe Datei/derselbe Ordner
4. Long-term optional: Local `2+ targets` vorbereiten, aber nicht im ersten Schritt erzwingen.

### Akzeptanz

* Aktueller Local Folder Compare funktioniert.
* Aktueller Local File Compare funktioniert.
* Alte Session mit Local-Pfaden lädt korrekt.
* Kein UI-Regression im aktuellen Hauptfeature.

---

## B6 — Recents Store

### Ziel

Git-Repos und GitHub-PRs als Schnellwahl speichern.

### Datei

```txt
src-electron/services/recents-store.ts
```

### Speicherort

```txt
app.getPath('userData')/recent-sources.json
```

`session-store.ts` speichert bereits atomar nach `userData/session.json`; denselben Stil verwenden.

### Schema

```ts
export interface RecentSources {
  defaultSetupMode: SetupMode
  gitRepositories: RecentGitRepository[]
  githubPullRequests: RecentGithubPullRequest[]
  localTargets: RecentLocalTarget[]
}

export interface RecentGitRepository {
  id: string
  repoPath: string
  repositoryRoot: string
  name: string
  lastBranch: string | null
  lastUsedAt: string
}

export interface RecentGithubPullRequest {
  id: string
  url: string
  owner: string
  repo: string
  pullNumber: number
  title: string | null
  lastUsedAt: string
}
```

### Regeln

* Maximal 20 Git-Repos.
* Maximal 20 GitHub PRs.
* Duplikate nach `repositoryRoot` beziehungsweise `owner/repo/pullNumber`.
* Neu verwendete Quellen nach oben.
* Entfernen per UI möglich.
* Keine Tokens speichern.

### API

```ts
loadRecentSources(): Promise<RecentSources>
addRecentSource(source: DiffSource, metadata?: unknown): Promise<RecentSources>
removeRecentSource(id: string): Promise<RecentSources>
```

### Akzeptanz

* Recent Git Repos erscheinen nach erneutem App-Start.
* Recent GitHub PRs erscheinen nach erneutem App-Start.
* Doppelte Einträge werden gemerged.

---

## B7 — GitService: sicherer Git Runner

### Ziel

Alle Git-Kommandos laufen über eine sichere zentrale Funktion.

### Datei

```txt
src-electron/services/git/git-service.ts
```

### Funktion

```ts
runGit(repoPath: string, args: string[], options?: GitRunOptions): Promise<GitRunResult>
```

### Regeln

* `execFile` oder `spawn`, kein Shell-String.
* Timeout, z.B. 15 Sekunden.
* Max stdout/stderr Buffer.
* Args immer Array.
* Fehler sauber mappen.
* Repo-Pfad vor Benutzung validieren.

### Beispiel

```ts
await runGit(repoPath, ['rev-parse', '--show-toplevel'])
```

### Akzeptanz

* Kein Git-Kommando wird als String zusammengebaut.
* Fehler enthalten verständliche Message.
* Timeout blockiert UI nicht endlos.

---

## B8 — Git Repository Validation

### Ziel

Nur echte Git-Repos dürfen ausgewählt werden.

### Datei

```txt
src-electron/services/git/git-repository.ts
```

### API

```ts
validateGitRepository(path: string): Promise<GitRepositoryValidation>
```

### Rückgabe

```ts
export interface GitRepositoryValidation {
  valid: boolean
  inputPath: string
  repositoryRoot: string | null
  gitDir: string | null
  currentBranch: string | null
  headSha: string | null
  isBare: boolean
  isWorktree: boolean
  error: string | null
}
```

### Git-Kommandos

```txt
git -C <path> rev-parse --is-inside-work-tree
git -C <path> rev-parse --show-toplevel
git -C <path> rev-parse --git-dir
git -C <path> rev-parse --abbrev-ref HEAD
git -C <path> rev-parse HEAD
```

### Akzeptanz

* Normales Repo valid.
* Git Worktree valid.
* Subfolder innerhalb Repo validiert auf Root.
* Nicht-Git-Ordner invalid.
* Bare Repo vorerst invalid oder unsupported.

---

## A4 — GitSetupPanel: Grundlayout

### Ziel

Git Setup bekommt eine komplett andere Oberfläche als Local.

### UI

```txt
┌──────────────────────────────┐   ┌──────────────────────────────────────────────┐
│ Recent Git repositories      │   │ Git repository                               │
│                              │   │ Path: D:\...\diffly                          │
│ diffly                       │   │ [ Browse folder... ]                         │
│ firmware-tool                │   │                                              │
│ test-repo                    │   │ Status: Valid Git repository                 │
└──────────────────────────────┘   │ Root: D:\...\diffly                          │
                                   │ Branch: main                                 │
                                   │ HEAD: abc1234                                │
                                   │                                              │
                                   │ Compare type                                 │
                                   │ (•) Working tree                             │
                                   │ ( ) Branch / ref                             │
                                   │ ( ) Single commit                            │
                                   └──────────────────────────────────────────────┘
```

### Files

```txt
src/lib/setup/GitSetupPanel.svelte
src/lib/setup/RecentSourceList.svelte
src/lib/setup/GitRepositoryPicker.svelte
```

### UI-State

```ts
interface GitSetupState {
  inputPath: string
  repositoryRoot: string
  validationStatus: 'idle' | 'validating' | 'valid' | 'invalid'
  validationError: string
  currentBranch: string
  headSha: string
  selectionKind: 'workingTree' | 'refRange' | 'commit'
  workingTreeScope: 'all' | 'staged' | 'unstaged' | 'untracked'
  baseRef: string
  headRef: string
  notation: 'twoDot' | 'threeDot'
  commitRef: string
}
```

### Tasks

1. Linke Spalte: Recent Git repositories.
2. Rechte Spalte: Repo-Auswahl und Validierungsstatus.
3. `Browse folder...` Button.
4. Path Input optional direkt editierbar.
5. Compare-Type Radio-Gruppe.
6. Compare Button nur aktiv bei validem Repo.
7. Fehler einfach anzeigen:

```txt
This folder is not a Git repository.
```

### Akzeptanz

* Git-Panel ist default sichtbar.
* Noch ohne echten Diff möglich, aber Repo-Auswahl UI steht.
* Compare ist disabled, wenn Repo invalid ist.
* Recent-Liste ist vorbereitet.

---

## A5 — GitRepositoryPicker: ein Explorer statt zwei

### Ziel

Für Git Mode nicht zwei Explorer-Panes, sondern ein einzelner Repo-Picker.

### UI

```txt
Repository folder
┌──────────────────────────────────────────────────────────────┐
│ D:\Users\sven\Documents                                      │
├──────────────────────────────────────────────────────────────┤
│ 📁 normal-folder                                             │
│ 📁 diffly                                      Git repo       │
│ 📁 other-project                               Git repo       │
│ 📄 file.txt                                                   │
└──────────────────────────────────────────────────────────────┘
```

### Verhalten

* Ordner mit `.git` oder Git-validem Root bekommen Badge `Git repo`.
* Dateien sind nicht auswählbar.
* Normale Ordner sind navigierbar, aber nicht als Compare-Target auswählbar.
* `Use current folder` nur aktiv, wenn aktueller Ordner Git Repo ist.
* Bei Klick auf Git Repo:

  * markieren
  * validieren
  * Details laden

### Akzeptanz

* Kein nicht-Git-Ordner kann als Repo übernommen werden.
* `.git`-Ordner oder `.git`-Datei wird markiert.
* Worktree-Repos funktionieren, weil Backend über `git rev-parse` validiert, nicht nur über `.git`-Ordner.

---

## B9 — Git Refs listen

### Ziel

Branch/Ref UI bekommt echte Daten.

### API

```ts
listGitRefs(repoPath: string): Promise<GitRefsResponse>
```

### Response

```ts
export interface GitRefsResponse {
  currentBranch: string | null
  headSha: string | null
  localBranches: GitRef[]
  remoteBranches: GitRef[]
  tags: GitRef[]
  recentCommits: GitCommitSummary[]
}
```

### Kommandos

```txt
git for-each-ref refs/heads refs/remotes refs/tags --format=...
git log --oneline --decorate -n 100
```

### Akzeptanz

* Branch Dropdown hat lokale Branches.
* Remote Branches sind auswählbar.
* Commit UI zeigt letzte Commits.
* Detached HEAD wird verständlich angezeigt.

---

## A6 — GitSetupPanel: Working Tree Optionen

### Ziel

Git Working Tree als erster echter Git-Modus.

### UI

```txt
Compare type
(•) Working tree

Initial view
[ All | Staged | Unstaged | Untracked ]
```

### Verhalten

* Diese Auswahl ist nur die **Initial View**.
* In der Compare View gibt es später dieselben Tabs.
* Setup wählt nur, womit gestartet wird.

### Source, die UI erzeugt

```ts
const source: GitDiffSource = {
  kind: 'git',
  repoPath,
  repositoryRoot,
  selection: {
    kind: 'workingTree',
    initialScope: workingTreeScope,
  },
}
```

### Akzeptanz

* User kann Repo + Working Tree auswählen.
* Compare erstellt eine Git Source.
* Recent Repo wird gespeichert.

---

## B10 — Git name-status Parser

### Ziel

Robuster Parser für Git-Dateilisten.

### Datei

```txt
src-electron/services/git/git-parser.ts
```

### Input-Beispiele

Mit `-z` kommen NUL-separierte Werte.

Modified:

```txt
M\0src/file.ts\0
```

Added:

```txt
A\0src/new.ts\0
```

Deleted:

```txt
D\0src/old.ts\0
```

Renamed:

```txt
R100\0old.ts\0new.ts\0
```

### Output

```ts
interface GitNameStatusEntry {
  status: DiffEntryStatus
  score?: number
  oldPath: string | null
  path: string
}
```

### Akzeptanz

* Pfade mit Leerzeichen funktionieren.
* Unicode-Pfade funktionieren.
* Rename funktioniert.
* Delete funktioniert.
* Parser hat Unit Tests.

---

## B11 — GitProvider: Working Tree Entries

### Ziel

Dateiliste für Working Tree erzeugen.

### Datei

```txt
src-electron/services/providers/git-provider.ts
```

### Kommandos

```txt
staged:
git diff --cached --name-status -z --find-renames

unstaged:
git diff --name-status -z --find-renames

untracked:
git ls-files --others --exclude-standard -z
```

### Entry-Mapping

```ts
scope: 'staged'    -> HEAD vs Index
scope: 'unstaged'  -> Index vs Working tree
scope: 'untracked' -> Empty vs Working tree
scope: 'all'       -> HEAD vs Working tree + untracked
```

### Merge-Regel für All

Wenn Datei staged und unstaged ist:

```txt
All: einmal anzeigen
Staged: anzeigen
Unstaged: anzeigen
```

Für `All` wird rechts der Working Tree genommen und links `HEAD`.

### Akzeptanz

* Staged Datei ist im Staged Tab.
* Unstaged Datei ist im Unstaged Tab.
* Untracked Datei ist im Untracked Tab.
* All zeigt alles zusammen.
* Clean Repo zeigt Empty State.

---

## B5 — FileDiff auf Snapshots umbauen

### Ziel

File-Diff darf nicht mehr zwingend echte lokale Pfade brauchen.

Aktuell lädt `file-diff.ts` Dateien über Pfade und `stat/readFile`. Für Git/GitHub brauchst du aber virtuelle Inhalte wie `HEAD:path`, `:path`, GitHub base/head blobs oder leere Snapshots.

### Neue Abstraktion

```ts
export interface DiffSnapshot {
  exists: boolean
  label: string
  logicalPath: string
  cacheKey: string | null
  bytes: Uint8Array | null
  text: string | null
  size: number | null
  lineEnding: 'lf' | 'crlf' | null
  hasTrailingNewline: boolean | null
  kind: 'text' | 'binary' | 'image' | 'tooLarge' | 'missing' | 'readError'
}
```

### Neue Funktion

```ts
buildFileDiffFromSnapshots(
  left: DiffSnapshot,
  right: DiffSnapshot,
  options: CompareOptions,
): Promise<FileDiffResult>
```

### Wrapper behalten

```ts
buildFileDiffFromPaths(...)
buildFileDiffFromGit(...)
buildFileDiffFromGithub(...)
```

### Akzeptanz

* Local File Diff funktioniert weiter.
* Git kann Inhalte ohne temporäre Dateien diffen.
* GitHub kann Inhalte ohne lokale Clone diffen.
* Cache-Key enthält Source, Ref, Path, SHA.

---

## B12 — GitProvider: Working Tree File Details

### Ziel

Klick auf Git-Datei öffnet echten Diff.

### Snapshot Mapping

| Scope           | Links       | Rechts            |
| --------------- | ----------- | ----------------- |
| `staged`        | `HEAD:path` | `:path`           |
| `unstaged`      | `:path`     | Working tree file |
| `untracked`     | empty       | Working tree file |
| `all` tracked   | `HEAD:path` | Working tree file |
| `all` untracked | empty       | Working tree file |

### Git-Kommandos für Blob Content

```txt
git show HEAD:path
git show :path
```

Working Tree:

```ts
readFile(join(repositoryRoot, path))
```

### Sonderfälle

| Fall           | Verhalten                               |
| -------------- | --------------------------------------- |
| Datei gelöscht | rechts empty                            |
| Datei neu      | links empty                             |
| Binary         | unsupported                             |
| zu gross       | tooLarge                                |
| conflict       | status conflicted, Diff optional später |

### Akzeptanz

* Text-Diff rendert in bestehendem Viewer.
* Deleted file zeigt linke Seite mit Inhalt, rechte leer.
* Added file zeigt links leer, rechts Inhalt.
* Untracked file zeigt links leer, rechts Inhalt.

---

## A10 — Compare View: SourceHeader

### Ziel

Compare View zeigt immer klar, was verglichen wird.

### Local Header

```txt
left folder  ↔  right folder
```

### Git Working Tree Header

```txt
diffly • main • Working tree
```

### Git Branch Header

```txt
diffly • main...feature
```

### Git Commit Header

```txt
diffly • commit abc1234
```

### GitHub Header

```txt
owner/repo #123 • PR title
```

### Files

```txt
src/lib/compare/SourceHeader.svelte
src/lib/screens/CompareScreen.svelte
```

### Akzeptanz

* Header ist modusabhängig.
* Keine unklaren linken/rechten Pfadlabels bei Git/GitHub.
* Tooltip zeigt vollständige Details.

---

## A11 — Compare View: Git Scope Tabs

### Ziel

Bei Git Working Tree gibt es oben in Compare View Tabs:

```txt
[ All | Staged | Unstaged | Untracked ]
```

### Sichtbarkeit

Nur anzeigen wenn:

```ts
source.kind === 'git'
source.selection.kind === 'workingTree'
```

### Verhalten

* Tab-Wechsel filtert Sidebar.
* Aktiver File-Diff wird neu geladen, wenn Datei im neuen Scope anders ist.
* `Refresh` lädt Git-Status neu.

### Akzeptanz

* `Staged` zeigt nur staged Dateien.
* `Unstaged` zeigt nur unstaged Dateien.
* `Untracked` zeigt nur neue untracked Dateien.
* `All` zeigt alles gemerged.

---

## A12 — Compare View: Status Badges

### Ziel

Sidebar zeigt Git-/GitHub-Status sauber.

### Badges

```txt
M  modified
A  added
D  deleted
R  renamed
C  copied
T  type changed
?  untracked
U  conflicted
```

### Files

```txt
src/lib/compare/DiffStatusBadge.svelte
src/lib/compare/CompareDirectorySidebar.svelte
src/lib/compare/PierreDirectoryTree.svelte
```

### Akzeptanz

* Local kann weiter `leftOnly/rightOnly/modified` anzeigen.
* Git/GitHub zeigt Git-Status.
* Rename zeigt:

```txt
R old/path.ts → new/path.ts
```

---

## A13 — Buttons pro Source korrigieren

### Ziel

Keine falschen Aktionen anzeigen.

### Button-Matrix

| Source           |     Swap | Scope Tabs |        Open external |
| ---------------- | -------: | ---------: | -------------------: |
| Local            |       ja |       nein |                 nein |
| Git Working Tree |     nein |         ja | optional `Open repo` |
| Git Branch/Ref   | optional |       nein | optional `Open repo` |
| Git Commit       |     nein |       nein | optional `Open repo` |
| GitHub PR        |     nein |       nein |         ja `Open PR` |

### Akzeptanz

* GitHub zeigt `Open PR`.
* Git Working Tree zeigt kein `Swap`.
* Local zeigt weiterhin `Swap`.

---

## A14 — Empty/Error/Loading States pro Modus

### Ziel

Jeder Modus hat passende Meldungen.

### Beispiele

Git Setup:

```txt
Select a local Git repository.
```

Git invalid:

```txt
This folder is not a Git repository.
```

Git clean:

```txt
No changes in working tree.
```

GitHub invalid:

```txt
Enter a GitHub pull request URL.
```

GitHub private/rate limit:

```txt
GitHub could not load this PR. It may be private or rate-limited.
```

### Akzeptanz

* Kein leerer Screen.
* Keine generischen Local-Fehler bei Git/GitHub.
* Ladezustände blockieren doppelte Requests.

---

## A7 — GitSetupPanel: Branch/Ref UI

### Ziel

Branches, Tags, Remote-Branches und beliebige Refs auswählbar machen.

### UI

```txt
Compare type
( ) Branch / ref

Base ref
[ main                         v ]

Head ref
[ feature/new-ui               v ]

Diff mode
[ three-dot: base...head ] [ two-dot: base..head ]
```

### Verhalten

* Default:

  * baseRef = `main` oder aktueller upstream/default branch
  * headRef = current branch
  * notation = `threeDot`
* Dropdown enthält:

  * lokale Branches
  * remote Branches
  * Tags
  * HEAD
  * manuelle Eingabe möglich

### Source

```ts
{
  kind: 'git',
  repoPath,
  repositoryRoot,
  selection: {
    kind: 'refRange',
    baseRef,
    headRef,
    notation: 'threeDot',
  },
}
```

### Akzeptanz

* User kann `main...feature` starten.
* User kann `main..feature` starten.
* Ungültige Refs blockieren Compare oder zeigen klaren Fehler.

---

## B13 — GitProvider: Branch/Ref Diff

### Ziel

Branch oder Ref Range vergleichen.

### Kommandos

Three-dot:

```txt
git diff --name-status -z --find-renames base...head
```

Two-dot:

```txt
git diff --name-status -z --find-renames base head
```

### Snapshot Mapping

```txt
left:  baseRef:path
right: headRef:path
```

Bei three-dot intern:

```txt
left:  merge-base(base, head):path
right: head:path
```

Optional kann Git selbst die Diff-Liste machen, aber für Inhalte sollte klar gelabelt werden.

### Akzeptanz

* `main...feature` zeigt PR-ähnlichen Diff.
* `main..feature` zeigt direkten Ref-Diff.
* Rename wird korrekt angezeigt.
* Branch-Namen mit Slash funktionieren.

---

## A8 — GitSetupPanel: Commit UI

### Ziel

Ein einzelner Commit kann angezeigt werden.

### UI

```txt
Compare type
( ) Single commit

Commit
[ abc123 / branch / tag / HEAD~1 ]

Recent commits
abc1234 fix setup panel
def5678 add git provider
...
```

### Verhalten

* Commit Input akzeptiert SHA, Branch, Tag, `HEAD~1`.
* Backend validiert mit Git.
* Diff ist `commit^` gegen `commit`.

### Akzeptanz

* Einzelner Commit kann geöffnet werden.
* Ungültiger Commit zeigt Fehler.
* Merge-Commit wird vorerst als `commit^1..commit` behandelt.

---

## B14 — GitProvider: Single Commit Diff

### Ziel

Ein Commit anzeigen.

### Kommandos

```txt
git diff-tree --no-commit-id --name-status -r -z --find-renames <commit>
```

Oder:

```txt
git diff --name-status -z --find-renames <commit>^ <commit>
```

### Snapshot Mapping

```txt
left:  commit^:path
right: commit:path
```

### Merge Commit Regel

MVP:

```txt
commit^1 gegen commit
```

Später optional Parent-Auswahl.

### Akzeptanz

* Normaler Commit funktioniert.
* Merge Commit funktioniert mit erstem Parent.
* Root Commit wird als empty vs commit behandelt.

---

## B15 — GitHub URL Parser

### Ziel

PR-Link sauber parsen.

### Datei

```txt
src-electron/services/github/github-url.ts
```

### Akzeptierte Inputs

```txt
https://github.com/owner/repo/pull/123
https://www.github.com/owner/repo/pull/123
github.com/owner/repo/pull/123
```

### Output

```ts
{
  owner: string
  repo: string
  pullNumber: number
  url: string
}
```

### Akzeptanz

* Gültige PR URLs funktionieren.
* Ungültige URLs werden klar abgelehnt.
* Owner/Repo werden normalisiert.
* Keine beliebigen Domains akzeptieren.

---

## B16 — GitHubService: PR Metadata + Files

### Ziel

GitHub PR-Daten laden.

### Datei

```txt
src-electron/services/github/github-service.ts
```

### API

```ts
fetchPullRequestMetadata(source): Promise<GithubPullRequestMetadata>
fetchPullRequestFiles(source): Promise<GithubPullRequestFile[]>
```

### Metadata

```ts
interface GithubPullRequestMetadata {
  owner: string
  repo: string
  pullNumber: number
  title: string
  state: 'open' | 'closed' | 'merged' | string
  baseRef: string
  headRef: string
  baseSha: string
  headSha: string
  htmlUrl: string
}
```

### File Entry

```ts
interface GithubPullRequestFile {
  filename: string
  previousFilename?: string
  status: DiffEntryStatus
  additions: number
  deletions: number
  changes: number
  patch?: string
  rawUrl?: string
  blobUrl?: string
}
```

### Fehler

```txt
invalid-url
not-found
private-repo
rate-limited
network-error
api-error
too-large
```

### Akzeptanz

* Public PR wird geladen.
* Pagination funktioniert.
* Fehlermeldungen sind UI-tauglich.
* Recent PR kann mit Titel gespeichert werden.

---

## A9 — GitHubSetupPanel: PR-Link UI

### Ziel

GitHub Mode wie DiffsHub-Prinzip: PR-Link rein, Diff laden.

### UI

```txt
┌──────────────────────────────┐   ┌──────────────────────────────────────────────┐
│ Recent GitHub PRs            │   │ GitHub pull request                          │
│                              │   │ PR URL                                       │
│ svenbuild/diffly #15         │   │ https://github.com/owner/repo/pull/123       │
│ owner/repo #88               │   │                                              │
└──────────────────────────────┘   │ Parsed: owner/repo #123                      │
                                   │ Status: Ready                                │
                                   └──────────────────────────────────────────────┘
```

### Files

```txt
src/lib/setup/GithubSetupPanel.svelte
src/lib/setup/GithubPrInput.svelte
src/lib/setup/RecentSourceList.svelte
```

### Verhalten

* Input akzeptiert:

  * `https://github.com/owner/repo/pull/123`
  * `github.com/owner/repo/pull/123`
* Nach Eingabe wird live geparst.
* `Compare` nur aktiv, wenn URL parsebar ist.
* Metadata optional schon im Setup laden:

  * PR title
  * base branch
  * head branch
  * changed files count

### Source

```ts
{
  kind: 'githubPullRequest',
  owner,
  repo,
  pullNumber,
  url,
}
```

### Akzeptanz

* Ungültige URL blockiert Compare.
* Gültige PR URL aktiviert Compare.
* Recent PR Klick füllt URL-Feld.

---

## B17 — GithubProvider: Entries + File Detail

### Ziel

GitHub PR in normalen DiffSession-Flow einhängen.

### Entry Mapping

| GitHub Status | Diffly Status |
| ------------- | ------------- |
| `modified`    | `modified`    |
| `added`       | `added`       |
| `removed`     | `deleted`     |
| `renamed`     | `renamed`     |
| `changed`     | `modified`    |

### Detail Loading

MVP-Option 1:

* Patch zu Text-Diff rekonstruieren, wenn vollständige Inhalte nicht verfügbar.
* Schnell, aber weniger perfekt.

Bessere Option:

* Base-Datei und Head-Datei über GitHub Contents/Raw laden.
* Dann mit `buildFileDiffFromSnapshots()` rendern.

### Snapshot Mapping

```txt
left:  baseSha:path oder previousFilename
right: headSha:path
```

### Akzeptanz

* Modified file rendert.
* Added file rendert.
* Deleted file rendert.
* Renamed file rendert mit altem und neuem Pfad.
* Binary/too large zeigt Unsupported State.

---

## B18 — Session Restore / Persistenz

### Ziel

App öffnet wieder im passenden Modus.

### Verhalten

Beim Speichern:

```ts
{
  setupMode: 'git',
  source: { kind: 'git', ... },
  viewMode,
  viewerSettings,
  treeSettings,
  ...
}
```

Beim Laden:

| Gespeicherte Source | Setup Mode |
| ------------------- | ---------- |
| `local`             | `local`    |
| `git`               | `git`      |
| `githubPullRequest` | `github`   |
| keine Source        | `git`      |

### Akzeptanz

* Nach App-Neustart bleibt Git Setup ausgewählt.
* Letztes Repo/PR wird vorgeschlagen.
* Alte Local-Session wird nicht beschädigt.

---

## B19 — Tests: Parser + Storage

### Ziel

Low-level Teile absichern.

### Tests

```txt
git name-status parser
git untracked parser
github PR URL parser
recent source dedupe
recent source limit 20
session migration
DiffSource serialization
```

### Akzeptanz

* Parser funktionieren mit:

  * Spaces
  * Unicode
  * Renames
  * Deletes
  * Empty output
* Recents bleiben klein.
* Keine kaputte JSON-Datei crasht App dauerhaft.

---

## B20 — Tests: Git Integration

### Ziel

Echte Git-Repos automatisiert testen.

### Testablauf

```txt
temp dir
git init
write file
git add file
commit
modify file unstaged
create staged file
create untracked file
run GitProvider
assert entries
open entries
assert diff text
```

### Fälle

```txt
staged modified
unstaged modified
untracked added
deleted file
renamed file
branch diff
single commit diff
```

### Akzeptanz

* GitProvider funktioniert ohne UI.
* Fehler werden sauber gemeldet.
* Tests laufen lokal reproduzierbar.

---

## B21 — E2E Smoke Tests

### Ziel

Wichtigste User-Flows testen.

### Flows

1. App startet im Git Setup.
2. Slider wechselt Git → Local → GitHub → Git.
3. Local Compare funktioniert.
4. Git Repo auswählen.
5. Git Working Tree Compare starten.
6. Scope Tabs wechseln.
7. GitHub PR URL eingeben.
8. GitHub Compare starten.
9. Settings öffnen und zurück.

### Akzeptanz

* Keine leeren Screens.
* Keine JS-Errors.
* Compare View zeigt Einträge und File-Diff.

---

# Minimaler erster Meilenstein

Der erste sinnvolle Release-Zustand wäre:

```txt
Git ist Default Setup Mode.
Local funktioniert weiterhin.
Git Repo kann ausgewählt werden.
Nicht-Git-Ordner werden blockiert.
Git Working Tree Diff funktioniert.
Compare View hat All/Staged/Unstaged/Untracked.
Recent Git Repos funktionieren.
```

Dafür brauchst du nur:

```txt
B1, B2, B3, B4,
A1, A2, A3,
B6, B7, B8,
A4, A5, A6,
B10, B11, B5, B12,
A10, A11, A12, A13, A14
```

GitHub und Branch/Commit kannst du danach sauber ergänzen, ohne das Fundament wieder umzubauen.
