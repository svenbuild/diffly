# TODO

- [x] token hover
- [x] Diff Stats and System Monitor
- [x] Alle diffs auf eine seite und Trees sidebar scrollt zu den diffs hin
- [x] buttons/switches kleiner kompakter moderner
- [x] git/github mode
- [x] diffs custom header - mit icon des datei typs wo man drauf clicken kann um die datei einzuklappen, datei name, usw. eigentlich ähnlich wie auf der diffs.com webseite.
- [x] Custom windows top bar - maybe ersetzt das die jetzige top bar die ich in der app habe. wäre cool wenn das geht
- [x] settings names gleich wie trees/diffs webseite
- [x] trees: show unmodified - checkbox/toggle/switch in den settings (local directory compare; git/github später)
- [x] trees: Context menu composition - voll einbauen falls schlau (sichere Actions: open/reveal/copy path; stage/discard/rename später)
- [x] trees: drag and drop/rename. soll das wirklich files auf der drive verschieben und umbenennen oder nur in der app? - Preview-only: geplante Operationen werden gelistet, Apply (echte Dateioperationen) kommt später
- [x] review mode (diffs: Accept/reject changes) toggle in compare view oder so. möglich in allen modes(ausser es ist aus deiner sicht nicht schlau) - whole-file accept für local; git stage/unstage/discard folgt; GitHub/commit/ref-range bleiben read-only
- [x] icons besser machen (diffs/trees webseite SVGs in website code) - zentrale Icon-Registry unter src/lib/icons
- [x] rethink git mode workflow. so dass alle relevanten git funktionen gediffed werden können.



- [x] diffs custom header - 1. sollen sich mehr vom background abheben ein bisschen. 2. es sind keine icons für die verschiedenen file types da. nur solche pseudo SVG's. ich will wie in trees die geilen file type icons
- [x] git mode lagt noch sehr. gab schon  einen commit der nach main gemacht wurde bezüglich dieses themas aber hat nichts geholfen (**`main` per Fast-Forward gemerged** (`44c3e41` → `6cc27ab`, kein Merge-Commit nötig, da `main` sich seit dem Branch-Start nicht bewegt hatte) und nach `origin/main` gepusht.)
- [x] in den Compare settings sind die namen der settings komisch und zusannemgeschrieben. mache daraus einfache/logische namen die man einfach und schnell versteht was dieses setting genau macht. die namen sollten nicht zu lange sein. (für Trees und Diffs Settings)
- [x] wenn ich settings öffne und wieder schliesse lädt der diff immer neu. das kann doch nicht richtig sein. das zieht einige unnötige sekunden.
- [x] die windows custom top bar wird nicht effizient verwendet. ich habe jetzt die custom windows top bar und zusätzlich noch eine eigene top bar mit buttons und infos und so. das kann man doch alles in die custom windows top bar kompakter machen
- [x] im Compare view anstatt einen button namens "Setup" zu haben soll dort ein "back" button mit einem pfeil der nach links zeigt sein. das ist intuitiver
- [x] loading animation richtig machen bei allen modes. sobald ich compare drücke komme ich in den compare view mit der Loading animation Overlay bis der erste diff visuell gerendert wurde
- [x] Github mode soll nur ein eingabe feld sein ohne switch zwischen pull/compare URL. es soll automatisch erkennen was es ist

## Follow-ups

- [ ] review mode: git working tree actions (stage/unstage/discard) aktivieren
- [ ] review mode: hunk-level accept/reject
- [ ] tree file operations: Apply für geplante rename/move Operationen (mit Confirm)
- [ ] tree context menu: stage/unstage/discard/rename Actions je Mode
- [ ] show unmodified für git working tree (git ls-files + Diff-Status)
- [ ] custom title bar: macOS feintuning (hiddenInset)





btw braucht es wirklich alle diese schritte? kann man das nicht kürzen? auch wenn es nicht so ganz der richtige weg wäre kann man das doch sicher verschnellern oder kürzen oder sowas nicht?

`compare-start`
`session-request-start`
`session-created`
`entries-published`
`first-entry-load-start`
`first-entry-loaded`
`first-text-entry-loaded`
`first-pierre-parse-start`
`first-pierre-parse-end`
`first-pierre-diff-rendered`
