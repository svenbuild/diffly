use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use similar::{DiffOp, TextDiff};
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

const MAX_TEXT_BYTES: u64 = 1024 * 1024;
const BINARY_SAMPLE_BYTES: usize = 8192;
const LINE_PAIR_MIN_SIMILARITY: i32 = 60;
const LINE_PAIR_GAP_PENALTY: i32 = 35;
const LINE_PAIR_SIGNATURE_MATCH_SCORE: i32 = 220;
const LINE_PAIR_NORMALIZED_MATCH_SCORE: i32 = 190;
const LINE_PAIR_COMMENT_MATCH_SCORE: i32 = 140;
const LINE_PAIR_BLANK_MATCH_SCORE: i32 = 160;
const LINE_PAIR_WEAK_STRUCTURAL_MATCH_SCORE: i32 = 70;

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompareOptions {
    ignore_whitespace: bool,
    ignore_case: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedExplorerPane {
    current_path: String,
    history: Vec<String>,
    history_index: i64,
    selected_target_path: String,
    selected_target_kind: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedSession {
    mode: String,
    view_mode: String,
    theme_mode: Option<String>,
    ignore_whitespace: bool,
    ignore_case: bool,
    show_full_file: bool,
    show_inline_highlights: bool,
    left_pane: PersistedExplorerPane,
    right_pane: PersistedExplorerPane,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum CompareResponse {
    Directory { entries: Vec<DirectoryEntryResult> },
    File { result: FileDiffResult },
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExplorerEntry {
    name: String,
    path: String,
    kind: ExplorerEntryKind,
    size: Option<u64>,
    modified_ms: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
enum ExplorerEntryKind {
    Drive,
    Directory,
    File,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirectoryListing {
    path: String,
    parent_path: Option<String>,
    directories: Vec<ExplorerEntry>,
    files: Vec<ExplorerEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PathInfo {
    path: String,
    exists: bool,
    is_directory: bool,
    is_file: bool,
    parent_path: Option<String>,
    name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DirectoryEntryResult {
    relative_path: String,
    status: EntryStatus,
    left_path: Option<String>,
    right_path: Option<String>,
    left_size: Option<u64>,
    right_size: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
enum EntryStatus {
    Modified,
    LeftOnly,
    RightOnly,
    Binary,
    TooLarge,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileDiffResult {
    content_kind: ContentKind,
    summary: String,
    left_label: String,
    right_label: String,
    side_by_side: Vec<SideBySideRow>,
    unified: Vec<UnifiedLine>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
enum ContentKind {
    Text,
    Binary,
    TooLarge,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SideBySideRow {
    left: Option<DiffCell>,
    right: Option<DiffCell>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiffCell {
    line_number: Option<usize>,
    prefix: String,
    text: String,
    segments: Vec<DiffSegment>,
    change: DiffChange,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiffSegment {
    text: String,
    highlighted: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UnifiedLine {
    left_line_number: Option<usize>,
    right_line_number: Option<usize>,
    prefix: String,
    text: String,
    segments: Vec<DiffSegment>,
    change: DiffChange,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
enum DiffChange {
    Context,
    Delete,
    Insert,
}

enum LoadedFile {
    Missing,
    Binary,
    TooLarge,
    Text(String),
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum AlignmentMove {
    Pair,
    LeftOnly,
    RightOnly,
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum LineKind {
    Blank,
    CommentOnly,
    Code,
}

struct LineDescriptor {
    original_text: String,
    trimmed_text: String,
    normalized_text: String,
    code_signature: String,
    kind: LineKind,
    tokens: Vec<String>,
    indentation_depth: usize,
    primary_identifier: String,
}

struct ReplaceBlockAlignment {
    row_pairs: Vec<(Option<usize>, Option<usize>)>,
    left_matches: Vec<Option<usize>>,
    right_matches: Vec<Option<usize>>,
}

#[derive(Clone, Copy)]
enum DiffBlock {
    Equal {
        old_index: usize,
        new_index: usize,
        len: usize,
    },
    Delete {
        old_index: usize,
        old_len: usize,
    },
    Insert {
        new_index: usize,
        new_len: usize,
    },
    Replace {
        old_index: usize,
        old_len: usize,
        new_index: usize,
        new_len: usize,
    },
}

#[tauri::command]
fn choose_path(kind: String) -> Option<String> {
    match kind.as_str() {
        "directory" => FileDialog::new()
            .pick_folder()
            .map(|path| path.to_string_lossy().to_string()),
        "file" => FileDialog::new()
            .pick_file()
            .map(|path| path.to_string_lossy().to_string()),
        _ => None,
    }
}

#[tauri::command]
fn load_session_state(app: AppHandle) -> Result<Option<PersistedSession>, String> {
    let session_path = session_file_path(&app)?;

    if !session_path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(&session_path).map_err(|error| error.to_string())?;
    let session = serde_json::from_str(&contents).map_err(|error| error.to_string())?;

    Ok(Some(session))
}

#[tauri::command]
fn save_session_state(app: AppHandle, session: PersistedSession) -> Result<(), String> {
    let session_path = session_file_path(&app)?;
    let json = serde_json::to_string_pretty(&session).map_err(|error| error.to_string())?;

    fs::write(session_path, json).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_roots() -> Result<Vec<ExplorerEntry>, String> {
    Ok(available_roots())
}

#[tauri::command]
fn list_directory(path: String) -> Result<DirectoryListing, String> {
    let directory = PathBuf::from(&path);

    if !directory.exists() {
        return Err("The requested path does not exist.".to_string());
    }

    if !directory.is_dir() {
        return Err("The requested path is not a directory.".to_string());
    }
    let (directories, files) = read_directory_entries(&directory)?;

    Ok(DirectoryListing {
        path: directory.to_string_lossy().to_string(),
        parent_path: parent_path(&directory),
        directories,
        files,
    })
}

#[tauri::command]
fn path_info(path: String) -> Result<PathInfo, String> {
    let value = PathBuf::from(&path);

    match fs::metadata(&value) {
        Ok(metadata) => Ok(PathInfo {
            path: value.to_string_lossy().to_string(),
            exists: true,
            is_directory: metadata.is_dir(),
            is_file: metadata.is_file(),
            parent_path: parent_path(&value),
            name: entry_name(&value),
        }),
        Err(_) => Ok(PathInfo {
            path,
            exists: false,
            is_directory: false,
            is_file: false,
            parent_path: None,
            name: String::new(),
        }),
    }
}

#[tauri::command]
fn compare_paths(
    left_path: String,
    right_path: String,
    mode: String,
    options: CompareOptions,
) -> Result<CompareResponse, String> {
    let left = PathBuf::from(&left_path);
    let right = PathBuf::from(&right_path);

    match mode.as_str() {
        "directory" => Ok(CompareResponse::Directory {
            entries: compare_directories(&left, &right, &options)?,
        }),
        "file" => Ok(CompareResponse::File {
            result: build_file_diff(&left, &right, left_path, right_path, &options)?,
        }),
        _ => Err("Unsupported compare mode.".to_string()),
    }
}

#[tauri::command]
fn open_compare_item(
    left_base: String,
    right_base: String,
    relative_path: String,
    options: CompareOptions,
) -> Result<FileDiffResult, String> {
    let left = Path::new(&left_base).join(&relative_path);
    let right = Path::new(&right_base).join(&relative_path);

    build_file_diff(
        &left,
        &right,
        left.to_string_lossy().to_string(),
        right.to_string_lossy().to_string(),
        &options,
    )
}

fn compare_directories(
    left: &Path,
    right: &Path,
    options: &CompareOptions,
) -> Result<Vec<DirectoryEntryResult>, String> {
    if !left.is_dir() {
        return Err("The left path is not a directory.".to_string());
    }

    if !right.is_dir() {
        return Err("The right path is not a directory.".to_string());
    }

    let left_files = collect_directory_files(left)?;
    let right_files = collect_directory_files(right)?;
    let mut all_paths = BTreeSet::new();

    for key in left_files.keys() {
        all_paths.insert(key.clone());
    }

    for key in right_files.keys() {
        all_paths.insert(key.clone());
    }

    let mut entries = Vec::new();

    for relative_path in all_paths {
        let left_file = left_files.get(&relative_path);
        let right_file = right_files.get(&relative_path);

        let entry = match (left_file, right_file) {
            (Some(left_file), Some(right_file)) => {
                if files_match(left_file, right_file, options)? {
                    continue;
                }

                DirectoryEntryResult {
                    relative_path,
                    status: classify_entry_status(left_file, right_file)?,
                    left_path: Some(left_file.to_string_lossy().to_string()),
                    right_path: Some(right_file.to_string_lossy().to_string()),
                    left_size: file_size(left_file),
                    right_size: file_size(right_file),
                }
            }
            (Some(left_file), None) => DirectoryEntryResult {
                relative_path,
                status: EntryStatus::LeftOnly,
                left_path: Some(left_file.to_string_lossy().to_string()),
                right_path: None,
                left_size: file_size(left_file),
                right_size: None,
            },
            (None, Some(right_file)) => DirectoryEntryResult {
                relative_path,
                status: EntryStatus::RightOnly,
                left_path: None,
                right_path: Some(right_file.to_string_lossy().to_string()),
                left_size: None,
                right_size: file_size(right_file),
            },
            (None, None) => continue,
        };

        entries.push(entry);
    }

    Ok(entries)
}

fn read_directory_entries(base: &Path) -> Result<(Vec<ExplorerEntry>, Vec<ExplorerEntry>), String> {
    let mut directories = Vec::new();
    let mut files = Vec::new();

    for entry in fs::read_dir(base).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let metadata = entry.metadata().map_err(|error| error.to_string())?;

        let explorer_entry = ExplorerEntry {
            name: entry_name(&path),
            path: path.to_string_lossy().to_string(),
            kind: if metadata.is_dir() {
                ExplorerEntryKind::Directory
            } else {
                ExplorerEntryKind::File
            },
            size: if metadata.is_file() {
                Some(metadata.len())
            } else {
                None
            },
            modified_ms: metadata
                .modified()
                .ok()
                .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
                .map(|value| value.as_millis() as u64),
        };

        if metadata.is_dir() {
            directories.push(explorer_entry);
        } else {
            files.push(explorer_entry);
        }
    }

    directories.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    files.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));

    Ok((directories, files))
}

fn available_roots() -> Vec<ExplorerEntry> {
    #[cfg(target_os = "windows")]
    {
        let mut roots = Vec::new();

        for drive in 'A'..='Z' {
            let candidate = PathBuf::from(format!("{drive}:\\"));

            if candidate.exists() {
                roots.push(ExplorerEntry {
                    name: candidate.to_string_lossy().to_string(),
                    path: candidate.to_string_lossy().to_string(),
                    kind: ExplorerEntryKind::Drive,
                    size: None,
                    modified_ms: None,
                });
            }
        }

        roots
    }

    #[cfg(not(target_os = "windows"))]
    {
        vec![ExplorerEntry {
            name: "/".to_string(),
            path: "/".to_string(),
            kind: ExplorerEntryKind::Directory,
            size: None,
            modified_ms: None,
        }]
    }
}

fn session_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;

    fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;

    Ok(app_data_dir.join("session.json"))
}

fn collect_directory_files(base: &Path) -> Result<BTreeMap<String, PathBuf>, String> {
    let mut files = BTreeMap::new();

    for entry in WalkDir::new(base) {
        let entry = entry.map_err(|error| error.to_string())?;

        if entry.file_type().is_file() {
            let relative = entry
                .path()
                .strip_prefix(base)
                .map_err(|error| error.to_string())?
                .to_string_lossy()
                .replace('\\', "/");

            files.insert(relative, entry.path().to_path_buf());
        }
    }

    Ok(files)
}

fn classify_entry_status(left: &Path, right: &Path) -> Result<EntryStatus, String> {
    if is_too_large(left)? || is_too_large(right)? {
        return Ok(EntryStatus::TooLarge);
    }

    if is_binary_file(left)? || is_binary_file(right)? {
        return Ok(EntryStatus::Binary);
    }

    Ok(EntryStatus::Modified)
}

fn build_file_diff(
    left: &Path,
    right: &Path,
    left_label: String,
    right_label: String,
    options: &CompareOptions,
) -> Result<FileDiffResult, String> {
    let left_loaded = load_file(left)?;
    let right_loaded = load_file(right)?;

    let summary = match (&left_loaded, &right_loaded) {
        (LoadedFile::Missing, LoadedFile::Missing) => "Neither file exists.".to_string(),
        (LoadedFile::Missing, _) => "Only the right file exists.".to_string(),
        (_, LoadedFile::Missing) => "Only the left file exists.".to_string(),
        _ => "Comparison ready.".to_string(),
    };

    if matches!(left_loaded, LoadedFile::TooLarge) || matches!(right_loaded, LoadedFile::TooLarge) {
        return Ok(FileDiffResult {
            content_kind: ContentKind::TooLarge,
            summary: "At least one file exceeds the 1 MB text diff limit.".to_string(),
            left_label,
            right_label,
            side_by_side: Vec::new(),
            unified: Vec::new(),
        });
    }

    if matches!(left_loaded, LoadedFile::Binary) || matches!(right_loaded, LoadedFile::Binary) {
        return Ok(FileDiffResult {
            content_kind: ContentKind::Binary,
            summary: "At least one file looks binary, so Diffly shows status only.".to_string(),
            left_label,
            right_label,
            side_by_side: Vec::new(),
            unified: Vec::new(),
        });
    }

    let left_text = match left_loaded {
        LoadedFile::Text(text) => text,
        LoadedFile::Missing => String::new(),
        LoadedFile::Binary | LoadedFile::TooLarge => String::new(),
    };

    let right_text = match right_loaded {
        LoadedFile::Text(text) => text,
        LoadedFile::Missing => String::new(),
        LoadedFile::Binary | LoadedFile::TooLarge => String::new(),
    };

    let normalized_left = normalize_text(&left_text, options);
    let normalized_right = normalize_text(&right_text, options);
    let diff = TextDiff::from_lines(&normalized_left, &normalized_right);
    let left_lines = display_lines(&left_text);
    let right_lines = display_lines(&right_text);

    Ok(FileDiffResult {
        content_kind: ContentKind::Text,
        summary,
        left_label,
        right_label,
        side_by_side: build_side_by_side(&diff, &left_lines, &right_lines),
        unified: build_unified(&diff, &left_lines, &right_lines),
    })
}

fn build_side_by_side<'a>(
    diff: &TextDiff<'a, 'a, 'a, str>,
    left_lines: &[String],
    right_lines: &[String],
) -> Vec<SideBySideRow> {
    let mut rows = Vec::new();
    for block in diff_blocks(diff) {
        match block {
            DiffBlock::Equal {
                old_index,
                new_index,
                len,
            } => {
                for offset in 0..len {
                    rows.push(SideBySideRow {
                        left: Some(build_context_cell(left_lines, old_index + offset)),
                        right: Some(build_context_cell(right_lines, new_index + offset)),
                    });
                }
            }
            DiffBlock::Delete { old_index, old_len } => {
                let left_cells =
                    build_changed_cells(left_lines, old_index, old_len, DiffChange::Delete);

                for left_cell in left_cells {
                    rows.push(SideBySideRow {
                        left: Some(fill_cell_segments(left_cell, false)),
                        right: None,
                    });
                }
            }
            DiffBlock::Insert { new_index, new_len } => {
                let right_cells =
                    build_changed_cells(right_lines, new_index, new_len, DiffChange::Insert);

                for right_cell in right_cells {
                    rows.push(SideBySideRow {
                        left: None,
                        right: Some(fill_cell_segments(right_cell, false)),
                    });
                }
            }
            DiffBlock::Replace {
                old_index,
                old_len,
                new_index,
                new_len,
            } => {
                let left_cells =
                    build_changed_cells(left_lines, old_index, old_len, DiffChange::Delete);
                let right_cells =
                    build_changed_cells(right_lines, new_index, new_len, DiffChange::Insert);
                let alignment = align_replace_block_rows(&left_cells, &right_cells);

                for (left_match, right_match) in alignment.row_pairs {
                    let left_cell = left_match.and_then(|index| left_cells.get(index).cloned());
                    let right_cell = right_match.and_then(|index| right_cells.get(index).cloned());

                    match (left_cell, right_cell) {
                        (Some(left_cell), Some(right_cell)) => {
                            let (left, right) = highlight_side_by_side_pair(left_cell, right_cell);
                            rows.push(SideBySideRow { left, right });
                        }
                        (Some(left_cell), None) => rows.push(SideBySideRow {
                            left: Some(fill_cell_segments(left_cell, false)),
                            right: None,
                        }),
                        (None, Some(right_cell)) => rows.push(SideBySideRow {
                            left: None,
                            right: Some(fill_cell_segments(right_cell, false)),
                        }),
                        (None, None) => {}
                    }
                }
            }
        }
    }

    rows
}

fn build_unified<'a>(
    diff: &TextDiff<'a, 'a, 'a, str>,
    left_lines: &[String],
    right_lines: &[String],
) -> Vec<UnifiedLine> {
    let mut lines = Vec::new();
    for block in diff_blocks(diff) {
        match block {
            DiffBlock::Equal {
                old_index,
                new_index,
                len,
            } => {
                for offset in 0..len {
                    let text = display_line(left_lines, old_index + offset + 1, "");
                    lines.push(UnifiedLine {
                        left_line_number: Some(old_index + offset + 1),
                        right_line_number: Some(new_index + offset + 1),
                        prefix: " ".to_string(),
                        text: text.clone(),
                        segments: plain_segments(&text, false),
                        change: DiffChange::Context,
                    });
                }
            }
            DiffBlock::Delete { old_index, old_len } => {
                let left_cells =
                    build_changed_cells(left_lines, old_index, old_len, DiffChange::Delete);

                for left_cell in left_cells {
                    lines.push(unified_from_left_cell(&left_cell, None));
                }
            }
            DiffBlock::Insert { new_index, new_len } => {
                let right_cells =
                    build_changed_cells(right_lines, new_index, new_len, DiffChange::Insert);

                for right_cell in right_cells {
                    lines.push(unified_from_right_cell(&right_cell, None));
                }
            }
            DiffBlock::Replace {
                old_index,
                old_len,
                new_index,
                new_len,
            } => {
                let left_cells =
                    build_changed_cells(left_lines, old_index, old_len, DiffChange::Delete);
                let right_cells =
                    build_changed_cells(right_lines, new_index, new_len, DiffChange::Insert);
                let alignment = align_replace_block_rows(&left_cells, &right_cells);

                for (index, left_cell) in left_cells.iter().enumerate() {
                    let counterpart = alignment.left_matches[index]
                        .and_then(|right_index| right_cells.get(right_index));
                    lines.push(unified_from_left_cell(left_cell, counterpart));
                }

                for (index, right_cell) in right_cells.iter().enumerate() {
                    let counterpart = alignment.right_matches[index]
                        .and_then(|left_index| left_cells.get(left_index));
                    lines.push(unified_from_right_cell(right_cell, counterpart));
                }
            }
        }
    }

    lines
}

fn diff_blocks<'a>(diff: &TextDiff<'a, 'a, 'a, str>) -> Vec<DiffBlock> {
    let ops = diff.ops();
    let mut blocks = Vec::new();
    let mut index = 0;

    while index < ops.len() {
        match ops[index] {
            DiffOp::Equal {
                old_index,
                new_index,
                len,
            } => {
                blocks.push(DiffBlock::Equal {
                    old_index,
                    new_index,
                    len,
                });
                index += 1;
            }
            _ => {
                let mut old_index = None;
                let mut new_index = None;
                let mut old_len = 0;
                let mut new_len = 0;

                while index < ops.len() {
                    match ops[index] {
                        DiffOp::Equal { .. } => break,
                        DiffOp::Delete {
                            old_index: current_old_index,
                            old_len: current_old_len,
                            new_index: current_new_index,
                        } => {
                            old_index.get_or_insert(current_old_index);
                            new_index.get_or_insert(current_new_index);
                            old_len += current_old_len;
                        }
                        DiffOp::Insert {
                            old_index: current_old_index,
                            new_index: current_new_index,
                            new_len: current_new_len,
                        } => {
                            old_index.get_or_insert(current_old_index);
                            new_index.get_or_insert(current_new_index);
                            new_len += current_new_len;
                        }
                        DiffOp::Replace {
                            old_index: current_old_index,
                            old_len: current_old_len,
                            new_index: current_new_index,
                            new_len: current_new_len,
                        } => {
                            old_index.get_or_insert(current_old_index);
                            new_index.get_or_insert(current_new_index);
                            old_len += current_old_len;
                            new_len += current_new_len;
                        }
                    }

                    index += 1;
                }

                match (old_len, new_len) {
                    (0, 0) => {}
                    (0, current_new_len) => blocks.push(DiffBlock::Insert {
                        new_index: new_index.unwrap_or(0),
                        new_len: current_new_len,
                    }),
                    (current_old_len, 0) => blocks.push(DiffBlock::Delete {
                        old_index: old_index.unwrap_or(0),
                        old_len: current_old_len,
                    }),
                    (current_old_len, current_new_len) => blocks.push(DiffBlock::Replace {
                        old_index: old_index.unwrap_or(0),
                        old_len: current_old_len,
                        new_index: new_index.unwrap_or(0),
                        new_len: current_new_len,
                    }),
                }
            }
        }
    }

    blocks
}

fn fill_cell_segments(mut cell: DiffCell, highlighted: bool) -> DiffCell {
    cell.segments = plain_segments(&cell.text, highlighted);
    cell
}

fn highlight_side_by_side_pair(
    left: DiffCell,
    right: DiffCell,
) -> (Option<DiffCell>, Option<DiffCell>) {
    let (left_segments, right_segments) = highlight_segments(&left.text, &right.text);

    (
        Some(DiffCell {
            segments: left_segments,
            ..left
        }),
        Some(DiffCell {
            segments: right_segments,
            ..right
        }),
    )
}

fn plain_segments(text: &str, highlighted: bool) -> Vec<DiffSegment> {
    vec![DiffSegment {
        text: text.to_string(),
        highlighted,
    }]
}

fn build_context_cell(lines: &[String], index: usize) -> DiffCell {
    let text = lines.get(index).cloned().unwrap_or_default();

    DiffCell {
        line_number: Some(index + 1),
        prefix: " ".to_string(),
        text: text.clone(),
        segments: plain_segments(&text, false),
        change: DiffChange::Context,
    }
}

fn build_changed_cells(
    lines: &[String],
    start_index: usize,
    len: usize,
    change: DiffChange,
) -> Vec<DiffCell> {
    let prefix = match change {
        DiffChange::Delete => "-",
        DiffChange::Insert => "+",
        DiffChange::Context => " ",
    };

    (0..len)
        .map(|offset| {
            let line_index = start_index + offset;
            let text = lines.get(line_index).cloned().unwrap_or_default();

            DiffCell {
                line_number: Some(line_index + 1),
                prefix: prefix.to_string(),
                text,
                segments: Vec::new(),
                change,
            }
        })
        .collect()
}

fn unified_from_left_cell(left_cell: &DiffCell, counterpart: Option<&DiffCell>) -> UnifiedLine {
    let segments = counterpart
        .map(|right_cell| highlight_segments(&left_cell.text, &right_cell.text).0)
        .unwrap_or_else(|| plain_segments(&left_cell.text, false));

    UnifiedLine {
        left_line_number: left_cell.line_number,
        right_line_number: None,
        prefix: left_cell.prefix.clone(),
        text: left_cell.text.clone(),
        segments,
        change: DiffChange::Delete,
    }
}

fn unified_from_right_cell(right_cell: &DiffCell, counterpart: Option<&DiffCell>) -> UnifiedLine {
    let segments = counterpart
        .map(|left_cell| highlight_segments(&left_cell.text, &right_cell.text).1)
        .unwrap_or_else(|| plain_segments(&right_cell.text, false));

    UnifiedLine {
        left_line_number: None,
        right_line_number: right_cell.line_number,
        prefix: right_cell.prefix.clone(),
        text: right_cell.text.clone(),
        segments,
        change: DiffChange::Insert,
    }
}

fn align_replace_block_rows(
    left_cells: &[DiffCell],
    right_cells: &[DiffCell],
) -> ReplaceBlockAlignment {
    let left_descriptors = left_cells
        .iter()
        .map(|cell| build_line_descriptor(&cell.text))
        .collect::<Vec<_>>();
    let right_descriptors = right_cells
        .iter()
        .map(|cell| build_line_descriptor(&cell.text))
        .collect::<Vec<_>>();
    let anchors = exact_code_anchor_pairs(&left_descriptors, &right_descriptors);
    let mut row_pairs = Vec::new();
    let mut left_cursor = 0;
    let mut right_cursor = 0;

    for (left_anchor, right_anchor) in anchors {
        append_aligned_subrange(
            &mut row_pairs,
            &left_descriptors[left_cursor..left_anchor],
            &right_descriptors[right_cursor..right_anchor],
            left_cursor,
            right_cursor,
        );
        row_pairs.push((Some(left_anchor), Some(right_anchor)));
        left_cursor = left_anchor + 1;
        right_cursor = right_anchor + 1;
    }

    append_aligned_subrange(
        &mut row_pairs,
        &left_descriptors[left_cursor..],
        &right_descriptors[right_cursor..],
        left_cursor,
        right_cursor,
    );

    let mut left_matches = vec![None; left_cells.len()];
    let mut right_matches = vec![None; right_cells.len()];

    for (left_match, right_match) in &row_pairs {
        if let (Some(left_index), Some(right_index)) = (*left_match, *right_match) {
            left_matches[left_index] = Some(right_index);
            right_matches[right_index] = Some(left_index);
        }
    }

    ReplaceBlockAlignment {
        row_pairs,
        left_matches,
        right_matches,
    }
}

fn append_aligned_subrange(
    row_pairs: &mut Vec<(Option<usize>, Option<usize>)>,
    left_descriptors: &[LineDescriptor],
    right_descriptors: &[LineDescriptor],
    left_offset: usize,
    right_offset: usize,
) {
    for (left_match, right_match) in align_replace_subrange(left_descriptors, right_descriptors) {
        row_pairs.push((
            left_match.map(|index| index + left_offset),
            right_match.map(|index| index + right_offset),
        ));
    }
}

fn exact_code_anchor_pairs(
    left_descriptors: &[LineDescriptor],
    right_descriptors: &[LineDescriptor],
) -> Vec<(usize, usize)> {
    let left_candidates = left_descriptors
        .iter()
        .enumerate()
        .filter(|(_, descriptor)| is_exact_anchor_candidate(descriptor))
        .map(|(index, descriptor)| (index, descriptor.code_signature.clone()))
        .collect::<Vec<_>>();
    let right_candidates = right_descriptors
        .iter()
        .enumerate()
        .filter(|(_, descriptor)| is_exact_anchor_candidate(descriptor))
        .map(|(index, descriptor)| (index, descriptor.code_signature.clone()))
        .collect::<Vec<_>>();
    let left_signatures = left_candidates
        .iter()
        .map(|(_, signature)| signature.clone())
        .collect::<Vec<_>>();
    let right_signatures = right_candidates
        .iter()
        .map(|(_, signature)| signature.clone())
        .collect::<Vec<_>>();

    lcs_pairs(&left_signatures, &right_signatures)
        .into_iter()
        .map(|(left_index, right_index)| {
            (
                left_candidates[left_index].0,
                right_candidates[right_index].0,
            )
        })
        .collect()
}

fn is_exact_anchor_candidate(descriptor: &LineDescriptor) -> bool {
    descriptor.kind == LineKind::Code
        && !descriptor.code_signature.is_empty()
        && !is_weak_structural_signature(&descriptor.code_signature)
}

fn align_replace_subrange(
    left_descriptors: &[LineDescriptor],
    right_descriptors: &[LineDescriptor],
) -> Vec<(Option<usize>, Option<usize>)> {
    let mut scores = vec![vec![0; right_descriptors.len() + 1]; left_descriptors.len() + 1];
    let mut moves = vec![vec![None; right_descriptors.len() + 1]; left_descriptors.len() + 1];

    for left_index in (0..=left_descriptors.len()).rev() {
        for right_index in (0..=right_descriptors.len()).rev() {
            if left_index == left_descriptors.len() && right_index == right_descriptors.len() {
                continue;
            }

            let mut best_score = i32::MIN;
            let mut best_move = None;

            if left_index < left_descriptors.len() {
                let candidate = scores[left_index + 1][right_index] - LINE_PAIR_GAP_PENALTY;

                if candidate > best_score {
                    best_score = candidate;
                    best_move = Some(AlignmentMove::LeftOnly);
                }
            }

            if right_index < right_descriptors.len() {
                let candidate = scores[left_index][right_index + 1] - LINE_PAIR_GAP_PENALTY;

                if candidate > best_score {
                    best_score = candidate;
                    best_move = Some(AlignmentMove::RightOnly);
                }
            }

            if left_index < left_descriptors.len() && right_index < right_descriptors.len() {
                if let Some(pair_score) = line_pair_score(
                    &left_descriptors[left_index],
                    &right_descriptors[right_index],
                ) {
                    let candidate = scores[left_index + 1][right_index + 1] + pair_score;

                    if candidate >= best_score {
                        best_score = candidate;
                        best_move = Some(AlignmentMove::Pair);
                    }
                }
            }

            scores[left_index][right_index] = best_score;
            moves[left_index][right_index] = best_move;
        }
    }

    let mut left_index = 0;
    let mut right_index = 0;
    let mut aligned = Vec::new();

    while left_index < left_descriptors.len() || right_index < right_descriptors.len() {
        match moves[left_index][right_index] {
            Some(AlignmentMove::Pair) => {
                aligned.push((Some(left_index), Some(right_index)));
                left_index += 1;
                right_index += 1;
            }
            Some(AlignmentMove::LeftOnly) => {
                aligned.push((Some(left_index), None));
                left_index += 1;
            }
            Some(AlignmentMove::RightOnly) => {
                aligned.push((None, Some(right_index)));
                right_index += 1;
            }
            None => break,
        }
    }

    aligned
}

fn line_pair_score(left: &LineDescriptor, right: &LineDescriptor) -> Option<i32> {
    match (left.kind, right.kind) {
        (LineKind::Blank, LineKind::Blank) => Some(LINE_PAIR_BLANK_MATCH_SCORE),
        (LineKind::Blank, _) | (_, LineKind::Blank) => None,
        (LineKind::CommentOnly, LineKind::Code) | (LineKind::Code, LineKind::CommentOnly) => None,
        (LineKind::CommentOnly, LineKind::CommentOnly) => comment_pair_score(left, right),
        (LineKind::Code, LineKind::Code) => code_pair_score(left, right),
    }
}

fn comment_pair_score(left: &LineDescriptor, right: &LineDescriptor) -> Option<i32> {
    if left.trimmed_text == right.trimmed_text {
        return Some(LINE_PAIR_NORMALIZED_MATCH_SCORE);
    }

    if left.normalized_text == right.normalized_text {
        return Some(LINE_PAIR_COMMENT_MATCH_SCORE);
    }

    let similarity = line_similarity_score(left, right);

    if similarity < LINE_PAIR_MIN_SIMILARITY {
        return None;
    }

    Some(LINE_PAIR_COMMENT_MATCH_SCORE + similarity / 3 + indentation_bonus(left, right))
}

fn code_pair_score(left: &LineDescriptor, right: &LineDescriptor) -> Option<i32> {
    let weak_structural_match = is_weak_structural_pair(left, right);

    if !left.code_signature.is_empty() && left.code_signature == right.code_signature {
        return Some(if weak_structural_match {
            LINE_PAIR_WEAK_STRUCTURAL_MATCH_SCORE + indentation_bonus(left, right)
        } else {
            LINE_PAIR_SIGNATURE_MATCH_SCORE
        });
    }

    if left.trimmed_text == right.trimmed_text || left.normalized_text == right.normalized_text {
        return Some(if weak_structural_match {
            LINE_PAIR_WEAK_STRUCTURAL_MATCH_SCORE + indentation_bonus(left, right)
        } else {
            LINE_PAIR_NORMALIZED_MATCH_SCORE + indentation_bonus(left, right)
        });
    }

    let similarity = line_similarity_score(left, right);
    let same_primary_identifier =
        !left.primary_identifier.is_empty() && left.primary_identifier == right.primary_identifier;

    if same_primary_identifier {
        if similarity < LINE_PAIR_MIN_SIMILARITY - 15 {
            return None;
        }

        return Some(150 + similarity / 2 + indentation_bonus(left, right));
    }

    if similarity < LINE_PAIR_MIN_SIMILARITY + 20 {
        return None;
    }

    Some(100 + similarity / 2 + indentation_bonus(left, right))
}

fn line_similarity_score(left: &LineDescriptor, right: &LineDescriptor) -> i32 {
    if left.tokens.is_empty() || right.tokens.is_empty() {
        return 0;
    }

    let common_pairs = lcs_pairs(&left.tokens, &right.tokens);

    if common_pairs.is_empty() {
        return 0;
    }

    let common_chars = common_pairs
        .into_iter()
        .map(|(left_index, _)| left.tokens[left_index].chars().count())
        .sum::<usize>();
    let total_chars = left.original_text.chars().count() + right.original_text.chars().count();

    if total_chars == 0 {
        0
    } else {
        ((common_chars * 200) / total_chars) as i32
    }
}

fn indentation_bonus(left: &LineDescriptor, right: &LineDescriptor) -> i32 {
    let difference = left.indentation_depth.abs_diff(right.indentation_depth);

    if difference == 0 {
        10
    } else if difference <= 2 {
        4
    } else {
        0
    }
}

fn build_line_descriptor(text: &str) -> LineDescriptor {
    let trimmed_text = text.trim().to_string();
    let kind = classify_line_kind(&trimmed_text);
    let normalized_text = collapse_whitespace(&trimmed_text);
    let code_signature = if kind == LineKind::Code {
        collapse_whitespace(trim_trailing_line_comment(&trimmed_text).trim())
    } else {
        String::new()
    };
    let token_source = match kind {
        LineKind::Blank => String::new(),
        LineKind::CommentOnly => normalized_text.clone(),
        LineKind::Code => {
            if code_signature.is_empty() {
                normalized_text.clone()
            } else {
                code_signature.clone()
            }
        }
    };

    LineDescriptor {
        original_text: text.to_string(),
        trimmed_text,
        normalized_text,
        code_signature: code_signature.clone(),
        kind,
        tokens: tokenize_alignment_tokens(&token_source),
        indentation_depth: leading_indent_width(text),
        primary_identifier: primary_identifier(&code_signature),
    }
}

fn classify_line_kind(trimmed_text: &str) -> LineKind {
    if trimmed_text.is_empty() {
        return LineKind::Blank;
    }

    if is_comment_only_line(trimmed_text) {
        LineKind::CommentOnly
    } else {
        LineKind::Code
    }
}

fn is_comment_only_line(trimmed_text: &str) -> bool {
    trimmed_text.starts_with("//")
        || trimmed_text.starts_with("/*")
        || trimmed_text.starts_with("*/")
        || trimmed_text.starts_with('*')
}

fn tokenize_alignment_tokens(text: &str) -> Vec<String> {
    tokenize_inline_diff(text)
        .into_iter()
        .filter(|token| !token.chars().all(|character| character.is_whitespace()))
        .collect()
}

fn leading_indent_width(text: &str) -> usize {
    text.chars()
        .take_while(|character| character.is_whitespace())
        .count()
}

fn primary_identifier(signature: &str) -> String {
    let identifiers = extract_identifiers(signature);

    if identifiers.is_empty() {
        return String::new();
    }

    if signature.trim_start().starts_with('#') && identifiers.len() > 1 {
        return identifiers
            .into_iter()
            .skip(1)
            .find(|identifier| !is_noise_identifier(identifier))
            .unwrap_or_default();
    }

    identifiers
        .into_iter()
        .find(|identifier| !is_noise_identifier(identifier))
        .unwrap_or_default()
}

fn is_weak_structural_pair(left: &LineDescriptor, right: &LineDescriptor) -> bool {
    is_weak_structural_signature(&left.code_signature)
        && is_weak_structural_signature(&right.code_signature)
}

fn is_weak_structural_signature(signature: &str) -> bool {
    let trimmed = signature.trim();

    if trimmed.is_empty() {
        return true;
    }

    if trimmed
        .chars()
        .all(|character| character.is_ascii_punctuation())
    {
        return true;
    }

    if matches!(
        trimmed,
        "{" | "}" | "else" | "do" | "try" | "catch" | "finally" | "#else" | "#endif"
    ) {
        return true;
    }

    let identifiers = extract_identifiers(trimmed);

    if trimmed.starts_with('#') {
        return identifiers.len() <= 1
            || identifiers
                .iter()
                .skip(1)
                .all(|identifier| is_noise_identifier(identifier));
    }

    identifiers.is_empty()
}

fn extract_identifiers(text: &str) -> Vec<String> {
    let mut identifiers = Vec::new();
    let mut current = String::new();

    for character in text.chars() {
        if character.is_alphanumeric() || character == '_' {
            current.push(character);
            continue;
        }

        if !current.is_empty() {
            identifiers.push(current);
            current = String::new();
        }
    }

    if !current.is_empty() {
        identifiers.push(current);
    }

    identifiers
}

fn is_noise_identifier(identifier: &str) -> bool {
    matches!(
        identifier,
        "define"
            | "static"
            | "const"
            | "volatile"
            | "extern"
            | "inline"
            | "void"
            | "char"
            | "short"
            | "int"
            | "long"
            | "float"
            | "double"
            | "signed"
            | "unsigned"
            | "uint8_t"
            | "uint16_t"
            | "uint32_t"
            | "int8_t"
            | "int16_t"
            | "int32_t"
            | "bool"
    )
}

fn trim_trailing_line_comment(line: &str) -> &str {
    let mut quoted = false;
    let mut escaped = false;
    let characters: Vec<(usize, char)> = line.char_indices().collect();
    let mut index = 0;

    while index + 1 < characters.len() {
        let (current_byte_index, current) = characters[index];
        let (_, next) = characters[index + 1];

        if escaped {
            escaped = false;
            index += 1;
            continue;
        }

        if current == '\\' {
            escaped = true;
            index += 1;
            continue;
        }

        if current == '"' {
            quoted = !quoted;
            index += 1;
            continue;
        }

        if !quoted && current == '/' && next == '/' {
            return &line[..current_byte_index];
        }

        index += 1;
    }

    line
}

fn highlight_segments(left: &str, right: &str) -> (Vec<DiffSegment>, Vec<DiffSegment>) {
    let left_tokens = tokenize_inline_diff(left);
    let right_tokens = tokenize_inline_diff(right);
    let common_pairs = lcs_pairs(&left_tokens, &right_tokens);

    if common_pairs.is_empty() {
        return (plain_segments(left, false), plain_segments(right, false));
    }

    let mut left_common = vec![false; left_tokens.len()];
    let mut right_common = vec![false; right_tokens.len()];

    for (left_index, right_index) in common_pairs {
        left_common[left_index] = true;
        right_common[right_index] = true;
    }

    (
        collapse_segments(&left_tokens, &left_common),
        collapse_segments(&right_tokens, &right_common),
    )
}

fn tokenize_inline_diff(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut current_kind: Option<usize> = None;

    for character in text.chars() {
        let next_kind = if character.is_whitespace() {
            0
        } else if character.is_alphanumeric() || character == '_' {
            1
        } else {
            2
        };

        match current_kind {
            Some(kind) if kind == next_kind => current.push(character),
            Some(_) => {
                tokens.push(current);
                current = character.to_string();
                current_kind = Some(next_kind);
            }
            None => {
                current.push(character);
                current_kind = Some(next_kind);
            }
        }
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

fn lcs_pairs(left: &[String], right: &[String]) -> Vec<(usize, usize)> {
    let mut dp = vec![vec![0; right.len() + 1]; left.len() + 1];

    for left_index in (0..left.len()).rev() {
        for right_index in (0..right.len()).rev() {
            dp[left_index][right_index] = if left[left_index] == right[right_index] {
                dp[left_index + 1][right_index + 1] + 1
            } else {
                dp[left_index + 1][right_index].max(dp[left_index][right_index + 1])
            };
        }
    }

    let mut pairs = Vec::new();
    let mut left_index = 0;
    let mut right_index = 0;

    while left_index < left.len() && right_index < right.len() {
        if left[left_index] == right[right_index] {
            pairs.push((left_index, right_index));
            left_index += 1;
            right_index += 1;
        } else if dp[left_index + 1][right_index] >= dp[left_index][right_index + 1] {
            left_index += 1;
        } else {
            right_index += 1;
        }
    }

    pairs
}

fn collapse_segments(tokens: &[String], common: &[bool]) -> Vec<DiffSegment> {
    if tokens.is_empty() {
        return plain_segments("", false);
    }

    let mut segments = Vec::new();
    let mut current = String::new();
    let mut highlighted = !common[0];

    for (index, token) in tokens.iter().enumerate() {
        let token_highlighted = !common[index];

        if token_highlighted == highlighted {
            current.push_str(token);
            continue;
        }

        if !current.is_empty() {
            segments.push(DiffSegment {
                text: current,
                highlighted,
            });
        }

        current = token.clone();
        highlighted = token_highlighted;
    }

    if !current.is_empty() {
        segments.push(DiffSegment {
            text: current,
            highlighted,
        });
    }

    segments
}

fn normalize_text(content: &str, options: &CompareOptions) -> String {
    let unified_newlines = content.replace("\r\n", "\n");
    let mut normalized_lines = Vec::new();

    for line in unified_newlines.split('\n') {
        let mut current = line.to_string();

        if options.ignore_whitespace {
            current = collapse_whitespace(&current);
        }

        if options.ignore_case {
            current = current.to_lowercase();
        }

        normalized_lines.push(current);
    }

    normalized_lines.join("\n")
}

fn display_lines(content: &str) -> Vec<String> {
    content
        .replace("\r\n", "\n")
        .lines()
        .map(|line| line.to_string())
        .collect()
}

fn display_line(lines: &[String], line_number: usize, fallback: &str) -> String {
    lines
        .get(line_number.saturating_sub(1))
        .cloned()
        .unwrap_or_else(|| clean_line(fallback))
}

fn collapse_whitespace(input: &str) -> String {
    let mut result = String::new();
    let mut previous_was_space = false;

    for character in input.chars() {
        if character.is_whitespace() {
            if !previous_was_space {
                result.push(' ');
            }
            previous_was_space = true;
        } else {
            previous_was_space = false;
            result.push(character);
        }
    }

    result.trim().to_string()
}

fn clean_line(line: &str) -> String {
    line.trim_end_matches(&['\r', '\n'][..]).to_string()
}

fn load_file(path: &Path) -> Result<LoadedFile, String> {
    if !path.exists() {
        return Ok(LoadedFile::Missing);
    }

    if is_too_large(path)? {
        return Ok(LoadedFile::TooLarge);
    }

    let bytes = fs::read(path).map_err(|error| error.to_string())?;

    if looks_binary(&bytes) {
        return Ok(LoadedFile::Binary);
    }

    Ok(LoadedFile::Text(
        String::from_utf8_lossy(&bytes).to_string(),
    ))
}

fn files_match(left: &Path, right: &Path, options: &CompareOptions) -> Result<bool, String> {
    let left_meta = fs::metadata(left).map_err(|error| error.to_string())?;
    let right_meta = fs::metadata(right).map_err(|error| error.to_string())?;

    if left_meta.len() == right_meta.len() && files_are_identical(left, right)? {
        return Ok(true);
    }

    if !options.ignore_whitespace && !options.ignore_case {
        return Ok(false);
    }

    if is_too_large(left)? || is_too_large(right)? {
        return Ok(false);
    }

    let left_loaded = load_file(left)?;
    let right_loaded = load_file(right)?;

    match (left_loaded, right_loaded) {
        (LoadedFile::Text(left_text), LoadedFile::Text(right_text)) => {
            Ok(normalize_text(&left_text, options) == normalize_text(&right_text, options))
        }
        _ => Ok(false),
    }
}

fn files_are_identical(left: &Path, right: &Path) -> Result<bool, String> {
    let mut left_file = fs::File::open(left).map_err(|error| error.to_string())?;
    let mut right_file = fs::File::open(right).map_err(|error| error.to_string())?;
    let mut left_buffer = [0; BINARY_SAMPLE_BYTES];
    let mut right_buffer = [0; BINARY_SAMPLE_BYTES];

    loop {
        let left_read = left_file
            .read(&mut left_buffer)
            .map_err(|error| error.to_string())?;
        let right_read = right_file
            .read(&mut right_buffer)
            .map_err(|error| error.to_string())?;

        if left_read != right_read {
            return Ok(false);
        }

        if left_read == 0 {
            return Ok(true);
        }

        if left_buffer[..left_read] != right_buffer[..right_read] {
            return Ok(false);
        }
    }
}

fn is_too_large(path: &Path) -> Result<bool, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    Ok(metadata.len() > MAX_TEXT_BYTES)
}

fn is_binary_file(path: &Path) -> Result<bool, String> {
    let bytes = sample_file_bytes(path)?;
    Ok(looks_binary(&bytes))
}

fn sample_file_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let mut file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut buffer = vec![0; BINARY_SAMPLE_BYTES];
    let bytes_read = file.read(&mut buffer).map_err(|error| error.to_string())?;
    buffer.truncate(bytes_read);
    Ok(buffer)
}

fn looks_binary(bytes: &[u8]) -> bool {
    let sample = &bytes[..bytes.len().min(BINARY_SAMPLE_BYTES)];

    if sample.contains(&0) {
        return true;
    }

    let suspicious = sample
        .iter()
        .filter(|byte| {
            let value = **byte;
            value < 9 || (value > 13 && value < 32)
        })
        .count();

    !sample.is_empty() && suspicious * 100 / sample.len() > 10
}

fn file_size(path: &Path) -> Option<u64> {
    fs::metadata(path).ok().map(|metadata| metadata.len())
}

fn entry_name(path: &Path) -> String {
    path.file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn parent_path(path: &Path) -> Option<String> {
    path.parent()
        .map(|value| value.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            choose_path,
            load_session_state,
            save_session_state,
            list_roots,
            list_directory,
            path_info,
            compare_paths,
            open_compare_item
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn fixture_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../test-fixtures/directories")
    }

    fn fixture_path(side: &str, relative: &str) -> PathBuf {
        fixture_root().join(side).join(relative)
    }

    fn default_options() -> CompareOptions {
        CompareOptions {
            ignore_whitespace: false,
            ignore_case: false,
        }
    }

    fn unique_temp_dir(test_name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after the unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("diffly-{test_name}-{timestamp}"));

        fs::create_dir_all(&path).expect("temporary directory should be created");
        path
    }

    fn write_temp_file(path: &Path, contents: &str) {
        fs::write(path, contents).expect("temporary file should be written");
    }

    fn test_changed_cell(text: &str, change: DiffChange) -> DiffCell {
        DiffCell {
            line_number: None,
            prefix: match change {
                DiffChange::Delete => "-".to_string(),
                DiffChange::Insert => "+".to_string(),
                DiffChange::Context => " ".to_string(),
            },
            text: text.to_string(),
            segments: Vec::new(),
            change,
        }
    }

    #[test]
    fn directory_compare_skips_whitespace_only_changes_when_requested() {
        let temp_root = unique_temp_dir("whitespace-ignore");
        let left = temp_root.join("left");
        let right = temp_root.join("right");

        fs::create_dir_all(&left).expect("left directory should exist");
        fs::create_dir_all(&right).expect("right directory should exist");
        write_temp_file(&left.join("sample.txt"), "alpha beta\nsecond line\n");
        write_temp_file(&right.join("sample.txt"), "alpha   beta\nsecond   line\n");

        let entries = compare_directories(
            &left,
            &right,
            &CompareOptions {
                ignore_whitespace: true,
                ignore_case: false,
            },
        )
        .expect("directory compare should succeed");

        assert!(
            entries.is_empty(),
            "whitespace-only differences should be suppressed when whitespace is ignored"
        );

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn directory_compare_skips_case_only_changes_when_requested() {
        let temp_root = unique_temp_dir("case-ignore");
        let left = temp_root.join("left");
        let right = temp_root.join("right");

        fs::create_dir_all(&left).expect("left directory should exist");
        fs::create_dir_all(&right).expect("right directory should exist");
        write_temp_file(&left.join("sample.txt"), "ALPHA\nBETA\nGAMMA\n");
        write_temp_file(&right.join("sample.txt"), "alpha\nbeta\ngamma\n");

        let entries = compare_directories(
            &left,
            &right,
            &CompareOptions {
                ignore_whitespace: false,
                ignore_case: true,
            },
        )
        .expect("directory compare should succeed");

        assert!(
            entries.is_empty(),
            "case-only differences should be suppressed when case is ignored"
        );

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn directory_compare_marks_binary_and_large_entries() {
        let entries = compare_directories(
            &fixture_path("left", ""),
            &fixture_path("right", ""),
            &default_options(),
        )
        .expect("directory compare should succeed");

        assert!(entries.iter().any(|entry| {
            entry.relative_path == "binary.bin" && matches!(entry.status, EntryStatus::Binary)
        }));
        assert!(entries.iter().any(|entry| {
            entry.relative_path == "too-large.txt" && matches!(entry.status, EntryStatus::TooLarge)
        }));
    }

    #[test]
    fn file_diff_reports_no_changed_lines_for_ignored_whitespace() {
        let temp_root = unique_temp_dir("file-whitespace-ignore");
        let left = temp_root.join("left.txt");
        let right = temp_root.join("right.txt");

        write_temp_file(&left, "one two\nthree four\n");
        write_temp_file(&right, "one  two\nthree    four\n");

        let result = build_file_diff(
            &left,
            &right,
            "left".to_string(),
            "right".to_string(),
            &CompareOptions {
                ignore_whitespace: true,
                ignore_case: false,
            },
        )
        .expect("file diff should succeed");

        assert!(matches!(result.content_kind, ContentKind::Text));
        assert!(result.side_by_side.iter().all(|row| {
            row.left
                .as_ref()
                .map(|cell| matches!(cell.change, DiffChange::Context))
                .unwrap_or(true)
                && row
                    .right
                    .as_ref()
                    .map(|cell| matches!(cell.change, DiffChange::Context))
                    .unwrap_or(true)
        }));
        assert!(result
            .unified
            .iter()
            .all(|row| matches!(row.change, DiffChange::Context)));

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn file_diff_does_not_force_pair_unrelated_replace_blocks() {
        let temp_root = unique_temp_dir("file-unrelated-replace-block");
        let left = temp_root.join("left.txt");
        let right = temp_root.join("right.txt");

        write_temp_file(&left, "alpha\nuint16_t SM_ADC_Threshold;\nomega\n");
        write_temp_file(
            &right,
            concat!(
                "alpha\n",
                "uint16_t SM_ADC_EffectiveOffset;\n",
                "uint16_t SM_ADC_PeaksRef[SM_ADC_WINDOW_SIZE];\n",
                "uint16_t SM_ADC_PeaksLive[SM_ADC_WINDOW_SIZE];\n",
                "omega\n"
            ),
        );

        let result = build_file_diff(
            &left,
            &right,
            "left".to_string(),
            "right".to_string(),
            &default_options(),
        )
        .expect("file diff should succeed");

        assert!(matches!(result.content_kind, ContentKind::Text));
        assert!(matches!(
            result.side_by_side[1].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "uint16_t SM_ADC_Threshold;"
        ));
        assert!(result.side_by_side[1].right.is_none());
        assert!(matches!(
            result.side_by_side[2].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "uint16_t SM_ADC_EffectiveOffset;"
        ));
        assert!(result.side_by_side[2].left.is_none());

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn file_diff_keeps_similar_replacement_lines_aligned() {
        let temp_root = unique_temp_dir("file-similar-replace-line");
        let left = temp_root.join("left.txt");
        let right = temp_root.join("right.txt");

        write_temp_file(&left, "alpha\nconfig.timeout_ms = 10;\nomega\n");
        write_temp_file(&right, "alpha\nconfig.timeout_ms = 12;\nomega\n");

        let result = build_file_diff(
            &left,
            &right,
            "left".to_string(),
            "right".to_string(),
            &default_options(),
        )
        .expect("file diff should succeed");

        assert!(matches!(result.content_kind, ContentKind::Text));
        assert!(matches!(
            result.side_by_side[1].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "config.timeout_ms = 10;"
        ));
        assert!(matches!(
            result.side_by_side[1].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "config.timeout_ms = 12;"
        ));

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn file_diff_aligns_code_lines_after_inserted_comment_define() {
        let temp_root = unique_temp_dir("file-aligns-commented-defines");
        let left = temp_root.join("left.txt");
        let right = temp_root.join("right.txt");

        write_temp_file(
            &left,
            concat!(
                "#define PWM_INDEX_1P DL_TIMER_CC_0_INDEX\n",
                "#define PWM_INDEX_1M DL_TIMER_CC_1_INDEX\n",
                "#define PWM_INDEX_2P DL_TIMER_CC_2_INDEX\n",
                "#define PWM_INDEX_2M DL_TIMER_CC_3_INDEX\n"
            ),
        );
        write_temp_file(
            &right,
            concat!(
                "#define MAXACC (32 * KOMMA) // maximum filtered acceleration per refresh\n",
                "#define PWM_INDEX_1P DL_TIMER_CC_0_INDEX // positive sine phase\n",
                "#define PWM_INDEX_1M DL_TIMER_CC_1_INDEX // negative sine phase\n",
                "#define PWM_INDEX_2P DL_TIMER_CC_2_INDEX // positive cosine phase\n",
                "#define PWM_INDEX_2M DL_TIMER_CC_3_INDEX // negative cosine phase\n"
            ),
        );

        let result = build_file_diff(
            &left,
            &right,
            "left".to_string(),
            "right".to_string(),
            &default_options(),
        )
        .expect("file diff should succeed");

        assert!(matches!(result.content_kind, ContentKind::Text));
        assert!(result.side_by_side[0].left.is_none());
        assert!(matches!(
            result.side_by_side[0].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "#define MAXACC (32 * KOMMA) // maximum filtered acceleration per refresh"
        ));
        assert!(matches!(
            result.side_by_side[1].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "#define PWM_INDEX_1P DL_TIMER_CC_0_INDEX"
        ));
        assert!(matches!(
            result.side_by_side[1].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "#define PWM_INDEX_1P DL_TIMER_CC_0_INDEX // positive sine phase"
        ));
        assert!(matches!(
            result.side_by_side[4].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "#define PWM_INDEX_2M DL_TIMER_CC_3_INDEX"
        ));
        assert!(matches!(
            result.side_by_side[4].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "#define PWM_INDEX_2M DL_TIMER_CC_3_INDEX // negative cosine phase"
        ));

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn file_diff_keeps_define_aligned_after_deleted_comment_line() {
        let temp_root = unique_temp_dir("file-deleted-comment-before-define");
        let left = temp_root.join("left.txt");
        let right = temp_root.join("right.txt");

        write_temp_file(
            &left,
            concat!(
                "// T_WAIT multiplied by refresh rate (1ms) is the stabilizing time per full step\n",
                "#define T_WAIT 10\n",
                "// Fix comma is 7 bit\n",
                "#define KOMMA 128\n"
            ),
        );
        write_temp_file(
            &right,
            concat!(
                "#define T_WAIT 10    // settling time in 1 ms steps before ADC sampling\n",
                "#define KOMMA 128    // fixed-point scaling used by the motion filter\n"
            ),
        );

        let result = build_file_diff(
            &left,
            &right,
            "left".to_string(),
            "right".to_string(),
            &default_options(),
        )
        .expect("file diff should succeed");

        assert!(matches!(result.content_kind, ContentKind::Text));
        assert!(matches!(
            result.side_by_side[0].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "// T_WAIT multiplied by refresh rate (1ms) is the stabilizing time per full step"
        ));
        assert!(result.side_by_side[0].right.is_none());
        assert!(matches!(
            result.side_by_side[1].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "#define T_WAIT 10"
        ));
        assert!(matches!(
            result.side_by_side[1].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "#define T_WAIT 10    // settling time in 1 ms steps before ADC sampling"
        ));
        assert!(matches!(
            result.side_by_side[2].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "// Fix comma is 7 bit"
        ));
        assert!(result.side_by_side[2].right.is_none());
        assert!(matches!(
            result.side_by_side[3].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "#define KOMMA 128"
        ));
        assert!(matches!(
            result.side_by_side[3].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "#define KOMMA 128    // fixed-point scaling used by the motion filter"
        ));

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn file_diff_resyncs_before_unchanged_function_after_comment_rewrite() {
        let temp_root = unique_temp_dir("file-comment-rewrite-before-function");
        let left = temp_root.join("left.txt");
        let right = temp_root.join("right.txt");

        write_temp_file(
            &left,
            concat!(
                "// adjust the pointer towards a target RPM or SPEED values\n",
                "// does the pointer / dial adjustments via a linearisation table\n",
                "// in : RPM or SPEED , out : stepmotor position pos_in_steps\n",
                "int32_t SM_AdjustPosition(int32_t targetPos)\n",
                "{\n"
            ),
        );
        write_temp_file(
            &right,
            concat!(
                "// Map the requested engineering value to a compensated microstep target position.\n",
                "int32_t SM_AdjustPosition(int32_t targetPos)\n",
                "{\n"
            ),
        );

        let result = build_file_diff(
            &left,
            &right,
            "left".to_string(),
            "right".to_string(),
            &default_options(),
        )
        .expect("file diff should succeed");

        assert!(matches!(result.content_kind, ContentKind::Text));
        assert!(matches!(
            result.side_by_side[0].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "// adjust the pointer towards a target RPM or SPEED values"
        ));
        assert!(result.side_by_side[0].right.is_none());
        assert!(matches!(
            result.side_by_side[1].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "// does the pointer / dial adjustments via a linearisation table"
        ));
        assert!(result.side_by_side[1].right.is_none());
        assert!(matches!(
            result.side_by_side[2].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "// in : RPM or SPEED , out : stepmotor position pos_in_steps"
        ));
        assert!(result.side_by_side[2].right.is_none());
        assert!(result.side_by_side[3]
            .left
            .as_ref()
            .map(|cell| &cell.text)
            .is_none());
        assert!(matches!(
            result.side_by_side[3].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "// Map the requested engineering value to a compensated microstep target position."
        ));
        assert!(matches!(
            result.side_by_side[4].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "int32_t SM_AdjustPosition(int32_t targetPos)"
        ));
        assert!(matches!(
            result.side_by_side[4].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "int32_t SM_AdjustPosition(int32_t targetPos)"
        ));
        assert!(matches!(
            result.side_by_side[5].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "{"
        ));
        assert!(matches!(
            result.side_by_side[5].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "{"
        ));

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn file_diff_only_pairs_blank_lines_with_blank_lines() {
        let temp_root = unique_temp_dir("file-blank-line-pairing");
        let left = temp_root.join("left.txt");
        let right = temp_root.join("right.txt");

        write_temp_file(
            &left,
            concat!(
                "alpha\n",
                "\n",
                "// called every 1ms\n",
                "void SM_HandlerHS_1ms(void);\n"
            ),
        );
        write_temp_file(
            &right,
            concat!(
                "alpha\n",
                "// Execute the 1 ms homing and runtime motor drive state machine.\n",
                "\n",
                "void SM_HandlerHS_1ms(void);\n"
            ),
        );

        let result = build_file_diff(
            &left,
            &right,
            "left".to_string(),
            "right".to_string(),
            &default_options(),
        )
        .expect("file diff should succeed");

        assert!(matches!(result.content_kind, ContentKind::Text));
        assert!(matches!(
            result.side_by_side[1].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "// Execute the 1 ms homing and runtime motor drive state machine."
        ));
        assert!(result.side_by_side[1].left.is_none());
        assert!(matches!(
            result.side_by_side[2]
                .left
                .as_ref()
                .map(|cell| cell.text.as_str()),
            Some("")
        ));
        assert!(matches!(
            result.side_by_side[2]
                .right
                .as_ref()
                .map(|cell| cell.text.as_str()),
            Some("")
        ));
        assert!(matches!(
            result.side_by_side[3].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "// called every 1ms"
        ));
        assert!(result.side_by_side[3].right.is_none());
        assert!(matches!(
            result.side_by_side[4].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "void SM_HandlerHS_1ms(void);"
        ));
        assert!(matches!(
            result.side_by_side[4].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "void SM_HandlerHS_1ms(void);"
        ));

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn file_diff_pairs_changed_literal_on_same_statement_row() {
        let temp_root = unique_temp_dir("file-changed-literal-same-row");
        let left = temp_root.join("left.txt");
        let right = temp_root.join("right.txt");

        write_temp_file(
            &left,
            concat!("void tune(void)\n", "{\n", "    damp_fact = 16;\n", "}\n"),
        );
        write_temp_file(
            &right,
            concat!("void tune(void)\n", "{\n", "    damp_fact = 8;\n", "}\n"),
        );

        let result = build_file_diff(
            &left,
            &right,
            "left".to_string(),
            "right".to_string(),
            &default_options(),
        )
        .expect("file diff should succeed");

        assert!(matches!(result.content_kind, ContentKind::Text));
        assert!(matches!(
            result.side_by_side[2].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "    damp_fact = 16;"
        ));
        assert!(matches!(
            result.side_by_side[2].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "    damp_fact = 8;"
        ));

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn file_diff_resyncs_immediately_after_deleted_comment_before_function_declaration() {
        let temp_root = unique_temp_dir("file-comment-delete-before-function");
        let left = temp_root.join("left.txt");
        let right = temp_root.join("right.txt");

        write_temp_file(
            &left,
            concat!(
                "// invoked by the 1 ms scheduler\n",
                "static void SM_UpdateState(uint16_t flags);\n",
                "static void SM_ResetFaults(void);\n"
            ),
        );
        write_temp_file(
            &right,
            concat!(
                "static void SM_UpdateState(uint16_t flags);\n",
                "static void SM_ResetFaults(void);\n"
            ),
        );

        let result = build_file_diff(
            &left,
            &right,
            "left".to_string(),
            "right".to_string(),
            &default_options(),
        )
        .expect("file diff should succeed");

        assert!(matches!(result.content_kind, ContentKind::Text));
        assert!(matches!(
            result.side_by_side[0].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "// invoked by the 1 ms scheduler"
        ));
        assert!(result.side_by_side[0].right.is_none());
        assert!(matches!(
            result.side_by_side[1].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "static void SM_UpdateState(uint16_t flags);"
        ));
        assert!(matches!(
            result.side_by_side[1].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "static void SM_UpdateState(uint16_t flags);"
        ));
        assert!(matches!(
            result.side_by_side[2].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "static void SM_ResetFaults(void);"
        ));
        assert!(matches!(
            result.side_by_side[2].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "static void SM_ResetFaults(void);"
        ));

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn exact_code_anchor_pairs_match_defines_with_inline_comments() {
        let left = vec![
            build_line_descriptor(
                "// T_WAIT multiplied by refresh rate (1ms) is the stabilizing time per full step",
            ),
            build_line_descriptor("#define T_WAIT 10"),
            build_line_descriptor("// Fix comma is 7 bit"),
            build_line_descriptor("#define KOMMA 128"),
        ];
        let right = vec![
            build_line_descriptor(
                "#define T_WAIT 10    // settling time in 1 ms steps before ADC sampling",
            ),
            build_line_descriptor(
                "#define KOMMA 128    // fixed-point scaling used by the motion filter",
            ),
        ];

        assert_eq!(left[1].code_signature, "#define T_WAIT 10");
        assert_eq!(left[3].code_signature, "#define KOMMA 128");
        assert_eq!(right[0].code_signature, "#define T_WAIT 10");
        assert_eq!(right[1].code_signature, "#define KOMMA 128");
        assert_eq!(exact_code_anchor_pairs(&left, &right), vec![(1, 0), (3, 1)]);
    }

    #[test]
    fn exact_code_anchor_pairs_ignore_braces_and_endif_lines() {
        let left = vec![
            build_line_descriptor("}"),
            build_line_descriptor("#ifdef ULTRON_SM_TEST_ACTIVE"),
            build_line_descriptor("#endif"),
            build_line_descriptor("}"),
        ];
        let right = vec![
            build_line_descriptor("}"),
            build_line_descriptor("}"),
            build_line_descriptor("#ifdef ULTRON_SM_TEST_ACTIVE"),
            build_line_descriptor("#endif"),
            build_line_descriptor("}"),
            build_line_descriptor("}"),
        ];

        assert_eq!(exact_code_anchor_pairs(&left, &right), vec![(1, 2)]);
    }

    #[test]
    fn replace_block_alignment_prefers_meaningful_anchors_over_repeated_braces() {
        let left_cells = vec![
            test_changed_cell("#ifdef ULTRON_SM_TEST_ACTIVE", DiffChange::Delete),
            test_changed_cell(
                "DL_GPIO_setPins(GPIO_TT_SECURITY_PORT, GPIO_PIN_0);",
                DiffChange::Delete,
            ),
            test_changed_cell("#endif", DiffChange::Delete),
            test_changed_cell("SM_synchronized = 0;", DiffChange::Delete),
        ];
        let right_cells = vec![
            test_changed_cell("else", DiffChange::Insert),
            test_changed_cell("{", DiffChange::Insert),
            test_changed_cell("}", DiffChange::Insert),
            test_changed_cell("#ifdef ULTRON_SM_TEST_ACTIVE", DiffChange::Insert),
            test_changed_cell(
                "DL_GPIO_clearPins(GPIO_SM_NOE_PORT, GPIO_PIN_0);",
                DiffChange::Insert,
            ),
            test_changed_cell("#endif", DiffChange::Insert),
            test_changed_cell("}", DiffChange::Insert),
            test_changed_cell("}", DiffChange::Insert),
            test_changed_cell("SM_synchronized = 1;", DiffChange::Insert),
        ];

        let alignment = align_replace_block_rows(&left_cells, &right_cells);

        assert_eq!(alignment.left_matches[0], Some(3));
        assert_eq!(alignment.left_matches[3], Some(8));
        assert!(alignment.right_matches[0].is_none());
        assert!(alignment.right_matches[1].is_none());
        assert!(alignment.right_matches[2].is_none());
        assert!(alignment.right_matches[6].is_none());
        assert!(alignment.right_matches[7].is_none());
    }
}
