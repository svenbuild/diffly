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

## Follow-ups

- [ ] review mode: git working tree actions (stage/unstage/discard) aktivieren
- [ ] review mode: hunk-level accept/reject
- [ ] tree file operations: Apply für geplante rename/move Operationen (mit Confirm)
- [ ] tree context menu: stage/unstage/discard/rename Actions je Mode
- [ ] show unmodified für git working tree (git ls-files + Diff-Status)
- [ ] custom title bar: macOS feintuning (hiddenInset)
