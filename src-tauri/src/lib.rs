use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use similar::{ChangeTag, TextDiff};
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

const MAX_TEXT_BYTES: u64 = 1024 * 1024;
const BINARY_SAMPLE_BYTES: usize = 8192;

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

#[derive(Clone, Serialize)]
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
            entries: compare_directories(&left, &right)?,
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

fn compare_directories(left: &Path, right: &Path) -> Result<Vec<DirectoryEntryResult>, String> {
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
                if files_are_identical(left_file, right_file)? {
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
    let mut left_pending = Vec::new();
    let mut right_pending = Vec::new();
    let mut left_line_number = 1;
    let mut right_line_number = 1;

    for change in diff.iter_all_changes() {
        match change.tag() {
            ChangeTag::Equal => {
                flush_side_buffer(&mut rows, &mut left_pending, &mut right_pending);

                let left_text = display_line(left_lines, left_line_number, change.value());
                let right_text = display_line(right_lines, right_line_number, change.value());
                rows.push(SideBySideRow {
                    left: Some(DiffCell {
                        line_number: Some(left_line_number),
                        prefix: " ".to_string(),
                        text: left_text.clone(),
                        segments: plain_segments(&left_text, false),
                        change: DiffChange::Context,
                    }),
                    right: Some(DiffCell {
                        line_number: Some(right_line_number),
                        prefix: " ".to_string(),
                        text: right_text.clone(),
                        segments: plain_segments(&right_text, false),
                        change: DiffChange::Context,
                    }),
                });

                left_line_number += 1;
                right_line_number += 1;
            }
            ChangeTag::Delete => {
                left_pending.push(DiffCell {
                    line_number: Some(left_line_number),
                    prefix: "-".to_string(),
                    text: display_line(left_lines, left_line_number, change.value()),
                    segments: Vec::new(),
                    change: DiffChange::Delete,
                });

                left_line_number += 1;
            }
            ChangeTag::Insert => {
                right_pending.push(DiffCell {
                    line_number: Some(right_line_number),
                    prefix: "+".to_string(),
                    text: display_line(right_lines, right_line_number, change.value()),
                    segments: Vec::new(),
                    change: DiffChange::Insert,
                });

                right_line_number += 1;
            }
        }
    }

    flush_side_buffer(&mut rows, &mut left_pending, &mut right_pending);
    rows
}

fn flush_side_buffer(
    rows: &mut Vec<SideBySideRow>,
    left_pending: &mut Vec<DiffCell>,
    right_pending: &mut Vec<DiffCell>,
) {
    let max_rows = left_pending.len().max(right_pending.len());

    for index in 0..max_rows {
        let left_cell = left_pending.get(index).cloned();
        let right_cell = right_pending.get(index).cloned();

        let (left, right) = match (left_cell, right_cell) {
            (Some(left), Some(right)) => highlight_side_by_side_pair(left, right),
            (Some(left), None) => (Some(fill_cell_segments(left, false)), None),
            (None, Some(right)) => (None, Some(fill_cell_segments(right, false))),
            (None, None) => (None, None),
        };

        rows.push(SideBySideRow { left, right });
    }

    left_pending.clear();
    right_pending.clear();
}

fn build_unified<'a>(
    diff: &TextDiff<'a, 'a, 'a, str>,
    left_lines: &[String],
    right_lines: &[String],
) -> Vec<UnifiedLine> {
    let mut lines = Vec::new();
    let mut delete_pending = Vec::new();
    let mut insert_pending = Vec::new();
    let mut left_line_number = 1;
    let mut right_line_number = 1;

    for change in diff.iter_all_changes() {
        match change.tag() {
            ChangeTag::Equal => {
                flush_unified_buffer(&mut lines, &mut delete_pending, &mut insert_pending);

                let text = display_line(left_lines, left_line_number, change.value());
                lines.push(UnifiedLine {
                    left_line_number: Some(left_line_number),
                    right_line_number: Some(right_line_number),
                    prefix: " ".to_string(),
                    text: text.clone(),
                    segments: plain_segments(&text, false),
                    change: DiffChange::Context,
                });

                left_line_number += 1;
                right_line_number += 1;
            }
            ChangeTag::Delete => {
                let text = clean_line(change.value());
                delete_pending.push(UnifiedLine {
                    left_line_number: Some(left_line_number),
                    right_line_number: None,
                    prefix: "-".to_string(),
                    text: display_line(left_lines, left_line_number, &text),
                    segments: Vec::new(),
                    change: DiffChange::Delete,
                });

                left_line_number += 1;
            }
            ChangeTag::Insert => {
                let text = clean_line(change.value());
                insert_pending.push(UnifiedLine {
                    left_line_number: None,
                    right_line_number: Some(right_line_number),
                    prefix: "+".to_string(),
                    text: display_line(right_lines, right_line_number, &text),
                    segments: Vec::new(),
                    change: DiffChange::Insert,
                });

                right_line_number += 1;
            }
        }
    }

    flush_unified_buffer(&mut lines, &mut delete_pending, &mut insert_pending);
    lines
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

fn flush_unified_buffer(
    lines: &mut Vec<UnifiedLine>,
    delete_pending: &mut Vec<UnifiedLine>,
    insert_pending: &mut Vec<UnifiedLine>,
) {
    for (index, pending_line) in delete_pending.iter().cloned().enumerate() {
        let mut line = pending_line;

        if let Some(counterpart) = insert_pending.get(index) {
            let (segments, _) = highlight_segments(&line.text, &counterpart.text);
            line.segments = segments;
        } else {
            line.segments = plain_segments(&line.text, false);
        }

        lines.push(line);
    }

    for (index, pending_line) in insert_pending.iter().cloned().enumerate() {
        let mut line = pending_line;

        if let Some(counterpart) = delete_pending.get(index) {
            let (_, segments) = highlight_segments(&counterpart.text, &line.text);
            line.segments = segments;
        } else {
            line.segments = plain_segments(&line.text, false);
        }

        lines.push(line);
    }

    delete_pending.clear();
    insert_pending.clear();
}

fn plain_segments(text: &str, highlighted: bool) -> Vec<DiffSegment> {
    vec![DiffSegment {
        text: text.to_string(),
        highlighted,
    }]
}

fn highlight_segments(left: &str, right: &str) -> (Vec<DiffSegment>, Vec<DiffSegment>) {
    let left_tokens = tokenize_inline_diff(left);
    let right_tokens = tokenize_inline_diff(right);

    if should_skip_inline_lcs(left_tokens.len(), right_tokens.len()) {
        return (plain_segments(left, false), plain_segments(right, false));
    }

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

fn should_skip_inline_lcs(left_len: usize, right_len: usize) -> bool {
    const MAX_INLINE_LCS_CELLS: usize = 200_000;

    left_len
        .checked_add(1)
        .and_then(|left| {
            right_len
                .checked_add(1)
                .and_then(|right| left.checked_mul(right))
        })
        .is_none_or(|cells| cells > MAX_INLINE_LCS_CELLS)
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

fn files_are_identical(left: &Path, right: &Path) -> Result<bool, String> {
    let left_meta = fs::metadata(left).map_err(|error| error.to_string())?;
    let right_meta = fs::metadata(right).map_err(|error| error.to_string())?;

    if left_meta.len() != right_meta.len() {
        return Ok(false);
    }

    let left_bytes = fs::read(left).map_err(|error| error.to_string())?;
    let right_bytes = fs::read(right).map_err(|error| error.to_string())?;

    Ok(left_bytes == right_bytes)
}

fn is_too_large(path: &Path) -> Result<bool, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    Ok(metadata.len() > MAX_TEXT_BYTES)
}

fn is_binary_file(path: &Path) -> Result<bool, String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    Ok(looks_binary(&bytes))
}

fn looks_binary(bytes: &[u8]) -> bool {
    let sample = &bytes[..bytes.len().min(BINARY_SAMPLE_BYTES)];

    if sample.iter().any(|byte| *byte == 0) {
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
    use super::{highlight_segments, should_skip_inline_lcs};

    #[test]
    fn skips_lcs_when_token_matrix_exceeds_limit() {
        assert!(should_skip_inline_lcs(500, 500));
        assert!(!should_skip_inline_lcs(200, 200));
    }

    #[test]
    fn falls_back_to_plain_segments_when_lcs_is_skipped() {
        let left = "a ".repeat(300);
        let right = "b ".repeat(300);

        let (left_segments, right_segments) = highlight_segments(&left, &right);

        assert_eq!(left_segments.len(), 1);
        assert_eq!(right_segments.len(), 1);
        assert_eq!(left_segments[0].text, left);
        assert_eq!(right_segments[0].text, right);
        assert!(!left_segments[0].highlighted);
        assert!(!right_segments[0].highlighted);
    }
}
