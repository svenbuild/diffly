use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use rayon::prelude::*;
use reqwest::Url;
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use similar::{DiffOp, TextDiff};
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use walkdir::WalkDir;

const MAX_TEXT_BYTES: u64 = 1024 * 1024;
const MAX_BINARY_BYTES: u64 = 8 * 1024 * 1024;
const MAX_SESSION_STATE_BYTES: u64 = 1024 * 1024;
const BINARY_SAMPLE_BYTES: usize = 8192;
const HEX_BYTES_PER_ROW: usize = 16;
const LINE_PAIR_MIN_SIMILARITY: i32 = 60;
const LINE_PAIR_GAP_PENALTY: i32 = 35;
const LINE_PAIR_SIGNATURE_MATCH_SCORE: i32 = 220;
const LINE_PAIR_NORMALIZED_MATCH_SCORE: i32 = 190;
const LINE_PAIR_COMMENT_MATCH_SCORE: i32 = 140;
const LINE_PAIR_BLANK_MATCH_SCORE: i32 = 160;
const LINE_PAIR_WEAK_STRUCTURAL_MATCH_SCORE: i32 = 70;
const LINE_PAIR_STRONG_MODIFIED_SCORE: i32 = 150;
const LINE_PAIR_LOOKAHEAD_WINDOW: usize = 8;
const LINE_PAIR_FALLBACK_DP_LIMIT: usize = 12;
const LINE_PAIR_LOCALITY_PENALTY: i32 = 8;
const LINE_PAIR_ANCHOR_MAX_PREFIX_GAP: usize = 1;
const LCS_MAX_MATRIX_CELLS: usize = 16_384;
const STABLE_UPDATE_ENDPOINT: &str =
    "https://github.com/svenbuild/diffly/releases/latest/download/latest.json";
const GITHUB_RELEASES_API_ENDPOINT: &str =
    "https://api.github.com/repos/svenbuild/diffly/releases?per_page=20";
const PRERELEASE_UPDATE_MANIFEST_NAME: &str = "latest.json";

fn default_true() -> bool {
    true
}

fn default_context_lines() -> u8 {
    3
}

fn default_viewer_text_size() -> u8 {
    10
}

fn default_update_channel() -> String {
    "stable".to_string()
}

fn default_appearance_mode() -> String {
    "system".to_string()
}

fn default_theme_id() -> String {
    "codex".to_string()
}

fn default_ui_font_size() -> u8 {
    12
}

fn default_code_font_size() -> u8 {
    11
}

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

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedThemeOverrides {
    accent: Option<String>,
    surface: Option<String>,
    ink: Option<String>,
    diff_added: Option<String>,
    diff_removed: Option<String>,
    skill: Option<String>,
    contrast: Option<u8>,
    ui_font: Option<String>,
    code_font: Option<String>,
    opaque_windows: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedAppearanceSettings {
    #[serde(default = "default_appearance_mode")]
    mode: String,
    #[serde(default = "default_theme_id")]
    light_theme_id: String,
    #[serde(default = "default_theme_id")]
    dark_theme_id: String,
    #[serde(default)]
    light_overrides: PersistedThemeOverrides,
    #[serde(default)]
    dark_overrides: PersistedThemeOverrides,
    #[serde(default = "default_true")]
    use_pointer_cursor: bool,
    #[serde(default = "default_ui_font_size")]
    ui_font_size: u8,
    #[serde(default = "default_code_font_size")]
    code_font_size: u8,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedSession {
    mode: String,
    view_mode: String,
    theme_mode: Option<String>,
    appearance: Option<PersistedAppearanceSettings>,
    #[serde(default)]
    ignore_whitespace: bool,
    #[serde(default)]
    ignore_case: bool,
    #[serde(default)]
    show_full_file: bool,
    #[serde(default = "default_true")]
    show_inline_highlights: bool,
    #[serde(default)]
    wrap_side_by_side_lines: bool,
    #[serde(default = "default_true")]
    show_syntax_highlighting: bool,
    #[serde(default = "default_true")]
    sync_side_by_side_scroll: bool,
    #[serde(default = "default_viewer_text_size")]
    viewer_text_size: u8,
    #[serde(default = "default_context_lines")]
    context_lines: u8,
    #[serde(default = "default_true")]
    check_for_updates_on_launch: bool,
    #[serde(default = "default_update_channel")]
    update_channel: String,
    #[serde(default)]
    last_update_check_at: Option<String>,
    left_pane: PersistedExplorerPane,
    right_pane: PersistedExplorerPane,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateMetadata {
    version: String,
    current_version: String,
    body: Option<String>,
    date: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCheckResponse {
    kind: String,
    available: bool,
    metadata: Option<UpdateMetadata>,
    message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateActionResponse {
    kind: String,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubReleaseAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    draft: bool,
    prerelease: bool,
    assets: Vec<GitHubReleaseAsset>,
}

struct PendingUpdate {
    channel: String,
    update: Update,
    downloaded_bytes: Option<Vec<u8>>,
}

#[derive(Default)]
struct UpdateState {
    pending: Mutex<Option<PendingUpdate>>,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum CompareResponse {
    Directory { entries: Vec<DirectoryEntryResult> },
    File { result: Box<FileDiffResult> },
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
    image: Option<ImageDiffPayload>,
    binary: Option<BinaryDiffPayload>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
enum ContentKind {
    Text,
    Image,
    Binary,
    TooLarge,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BinaryFileMeta {
    exists: bool,
    path: String,
    size: Option<u64>,
    sha256: Option<String>,
    format: Option<String>,
    identical_to_other_side: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageDiffPayload {
    left_asset_url: Option<String>,
    right_asset_url: Option<String>,
    left_meta: BinaryFileMeta,
    right_meta: BinaryFileMeta,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HexCell {
    hex: String,
    ascii: String,
    changed: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HexRow {
    offset: usize,
    left: Vec<HexCell>,
    right: Vec<HexCell>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BinaryDiffPayload {
    left_meta: BinaryFileMeta,
    right_meta: BinaryFileMeta,
    rows: Vec<HexRow>,
    bytes_per_row: usize,
    truncated: bool,
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
    TooLarge,
    Text(String),
    Image(LoadedBinaryFile),
    Binary(LoadedBinaryFile, Option<Vec<u8>>),
}

#[derive(Clone)]
struct LoadedBinaryFile {
    path: String,
    size: u64,
    sha256: String,
    format: Option<String>,
}

enum DetectedFileKind {
    Missing,
    TooLarge,
    Text,
    Image(String),
    Binary,
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

#[derive(Clone, Copy, Eq, PartialEq)]
enum MatchBand {
    StrongExact,
    StrongModified,
    WeakStructural,
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum MatchBandSeed {
    Blank,
    Comment,
    WeakStructural,
    Preprocessor,
    ControlHeader,
    Assignment,
    Call,
    OtherCode,
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum CallableCodeFamily {
    Prototype,
    Signature,
    Call,
}

struct LineDescriptor {
    trimmed_text: String,
    normalized_text: String,
    code_signature: String,
    commented_code_signature: String,
    kind: LineKind,
    tokens: Vec<String>,
    commented_code_tokens: Vec<String>,
    indentation_depth: usize,
    primary_identifier: String,
    commented_code_primary_identifier: String,
    is_preprocessor: bool,
    commented_code_is_preprocessor: bool,
    is_weak_structural: bool,
    match_band_seed: MatchBandSeed,
    identifier_count: usize,
}

struct ReplaceBlockAlignment {
    row_pairs: Vec<(Option<usize>, Option<usize>)>,
    left_matches: Vec<Option<usize>>,
    right_matches: Vec<Option<usize>>,
}

#[derive(Clone, Copy)]
struct ResyncCandidate {
    left_index: usize,
    right_index: usize,
    band: MatchBand,
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
    read_session_state(&app)
}

#[tauri::command]
fn save_session_state(app: AppHandle, session: PersistedSession) -> Result<(), String> {
    write_session_state(&app, &session)
}

#[tauri::command]
fn get_app_version(app: AppHandle) -> Result<String, String> {
    Ok(current_app_version(&app))
}

#[tauri::command]
async fn check_for_updates(
    app: AppHandle,
    state: tauri::State<'_, UpdateState>,
    channel: Option<String>,
) -> Result<UpdateCheckResponse, String> {
    let current_version = app.package_info().version.to_string();
    let checked_at = current_unix_timestamp_string();
    let channel = normalize_update_channel(channel.as_deref());

    if tauri_plugin_updater::target().is_none() {
        let response = UpdateCheckResponse {
            kind: "unavailable".to_string(),
            available: false,
            metadata: None,
            message: Some("Updates are not supported on this platform.".to_string()),
        };
        let _ = touch_last_update_check_at(&app, &checked_at);
        clear_pending_update(&state)?;
        return Ok(response);
    }

    let endpoints = match resolve_update_endpoints(&channel).await {
        Ok(endpoints) => endpoints,
        Err(error) => {
            let response = UpdateCheckResponse {
                kind: "unavailable".to_string(),
                available: false,
                metadata: None,
                message: Some(error),
            };
            let _ = touch_last_update_check_at(&app, &checked_at);
            clear_pending_update(&state)?;
            return Ok(response);
        }
    };

    let updater = match app
        .updater_builder()
        .endpoints(endpoints)
        .map_err(|error| error.to_string())?
        .build()
    {
        Ok(updater) => updater,
        Err(error) => {
            let response = UpdateCheckResponse {
                kind: "unavailable".to_string(),
                available: false,
                metadata: None,
                message: Some(error.to_string()),
            };
            let _ = touch_last_update_check_at(&app, &checked_at);
            clear_pending_update(&state)?;
            return Ok(response);
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            let metadata = UpdateMetadata {
                version: update.version.clone(),
                current_version: current_version.clone(),
                body: update.body.clone(),
                date: update.date.map(|value| value.to_string()),
            };
            set_pending_update(
                &state,
                PendingUpdate {
                    channel: channel.clone(),
                    update,
                    downloaded_bytes: None,
                },
            )?;
            let response = UpdateCheckResponse {
                kind: "available".to_string(),
                available: true,
                metadata: Some(metadata),
                message: Some("A new Diffly build is available.".to_string()),
            };
            let _ = touch_last_update_check_at(&app, &checked_at);
            Ok(response)
        }
        Ok(None) => {
            clear_pending_update(&state)?;
            let response = UpdateCheckResponse {
                kind: "upToDate".to_string(),
                available: false,
                metadata: None,
                message: Some(format!("Diffly {} is up to date.", current_version)),
            };
            let _ = touch_last_update_check_at(&app, &checked_at);
            Ok(response)
        }
        Err(error) => {
            clear_pending_update(&state)?;
            let response = UpdateCheckResponse {
                kind: "error".to_string(),
                available: false,
                metadata: None,
                message: Some(error.to_string()),
            };
            let _ = touch_last_update_check_at(&app, &checked_at);
            Ok(response)
        }
    }
}

#[tauri::command]
async fn download_update(
    _app: AppHandle,
    state: tauri::State<'_, UpdateState>,
    channel: Option<String>,
) -> Result<UpdateActionResponse, String> {
    let Some(mut pending_update) = take_pending_update(&state)? else {
        return Ok(UpdateActionResponse {
            kind: "unavailable".to_string(),
            message: Some("Check for updates before downloading an update.".to_string()),
        });
    };

    let channel = normalize_update_channel(channel.as_deref());
    if pending_update.channel != channel {
        clear_pending_update(&state)?;
        return Ok(UpdateActionResponse {
            kind: "unavailable".to_string(),
            message: Some(
                "The selected update channel changed. Check for updates again before downloading."
                    .to_string(),
            ),
        });
    }

    let downloaded_bytes = match pending_update.update.download(|_, _| {}, || {}).await {
        Ok(bytes) => bytes,
        Err(error) => {
            set_pending_update(&state, pending_update)?;
            return Ok(UpdateActionResponse {
                kind: "error".to_string(),
                message: Some(error.to_string()),
            });
        }
    };

    pending_update.downloaded_bytes = Some(downloaded_bytes);
    set_pending_update(&state, pending_update)?;

    Ok(UpdateActionResponse {
        kind: "downloaded".to_string(),
        message: Some("Update downloaded. Install and restart when ready.".to_string()),
    })
}

#[tauri::command]
async fn install_update(
    app: AppHandle,
    state: tauri::State<'_, UpdateState>,
    channel: Option<String>,
) -> Result<UpdateActionResponse, String> {
    let Some(mut pending_update) = take_pending_update(&state)? else {
        return Ok(UpdateActionResponse {
            kind: "unavailable".to_string(),
            message: Some("Check for updates before installing an update.".to_string()),
        });
    };

    let channel = normalize_update_channel(channel.as_deref());
    if pending_update.channel != channel {
        clear_pending_update(&state)?;
        return Ok(UpdateActionResponse {
            kind: "unavailable".to_string(),
            message: Some(
                "The selected update channel changed. Check for updates again before installing."
                    .to_string(),
            ),
        });
    }

    let bytes = match pending_update.downloaded_bytes.take() {
        Some(bytes) => bytes,
        None => match pending_update.update.download(|_, _| {}, || {}).await {
            Ok(bytes) => bytes,
            Err(error) => {
                set_pending_update(&state, pending_update)?;
                return Ok(UpdateActionResponse {
                    kind: "error".to_string(),
                    message: Some(error.to_string()),
                });
            }
        },
    };

    if let Err(error) = pending_update.update.install(&bytes) {
        pending_update.downloaded_bytes = Some(bytes);
        set_pending_update(&state, pending_update)?;
        return Ok(UpdateActionResponse {
            kind: "error".to_string(),
            message: Some(error.to_string()),
        });
    }

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        handle.restart();
    });

    Ok(UpdateActionResponse {
        kind: "installed".to_string(),
        message: Some("Update installed. Restarting Diffly.".to_string()),
    })
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
            result: Box::new(build_file_diff(
                &left, &right, left_path, right_path, &options,
            )?),
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
    let left_base_path = PathBuf::from(&left_base);
    let right_base_path = PathBuf::from(&right_base);
    let relative_path = safe_relative_path(&relative_path)?;
    let left = left_base_path.join(&relative_path);
    let right = right_base_path.join(&relative_path);

    ensure_within_base(&left_base_path, &left)?;
    ensure_within_base(&right_base_path, &right)?;

    build_file_diff(
        &left,
        &right,
        left.to_string_lossy().to_string(),
        right.to_string_lossy().to_string(),
        &options,
    )
}

fn safe_relative_path(value: &str) -> Result<PathBuf, String> {
    let relative = PathBuf::from(value);

    if relative.as_os_str().is_empty() {
        return Err(
            "The requested path must be relative to the selected compare root.".to_string(),
        );
    }

    if relative.is_absolute() {
        return Err("The requested path must stay within the selected compare root.".to_string());
    }

    for component in relative.components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(
                    "The requested path must stay within the selected compare root.".to_string(),
                )
            }
        }
    }

    Ok(relative)
}

fn ensure_within_base(base: &Path, candidate: &Path) -> Result<(), String> {
    if candidate.starts_with(base) {
        Ok(())
    } else {
        Err("The requested path must stay within the selected compare root.".to_string())
    }
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
    let mut all_paths = HashSet::with_capacity(left_files.len() + right_files.len());

    for key in left_files.keys() {
        all_paths.insert(key.clone());
    }

    for key in right_files.keys() {
        all_paths.insert(key.clone());
    }

    let mut sorted_paths = all_paths.into_iter().collect::<Vec<_>>();
    sorted_paths.sort_unstable();

    let entry_results = sorted_paths
        .par_iter()
        .map(
            |relative_path| -> Result<Option<DirectoryEntryResult>, String> {
                let left_file = left_files.get(relative_path);
                let right_file = right_files.get(relative_path);

                let entry = match (left_file, right_file) {
                    (Some(left_file), Some(right_file)) => {
                        if files_match(left_file, right_file, options)? {
                            return Ok(None);
                        }

                        DirectoryEntryResult {
                            relative_path: relative_path.clone(),
                            status: classify_entry_status(left_file, right_file)?,
                            left_path: Some(left_file.to_string_lossy().to_string()),
                            right_path: Some(right_file.to_string_lossy().to_string()),
                            left_size: file_size(left_file),
                            right_size: file_size(right_file),
                        }
                    }
                    (Some(left_file), None) => DirectoryEntryResult {
                        relative_path: relative_path.clone(),
                        status: EntryStatus::LeftOnly,
                        left_path: Some(left_file.to_string_lossy().to_string()),
                        right_path: None,
                        left_size: file_size(left_file),
                        right_size: None,
                    },
                    (None, Some(right_file)) => DirectoryEntryResult {
                        relative_path: relative_path.clone(),
                        status: EntryStatus::RightOnly,
                        left_path: None,
                        right_path: Some(right_file.to_string_lossy().to_string()),
                        left_size: None,
                        right_size: file_size(right_file),
                    },
                    (None, None) => return Ok(None),
                };

                Ok(Some(entry))
            },
        )
        .collect::<Vec<_>>();

    let mut entries = Vec::with_capacity(entry_results.len());

    for entry_result in entry_results {
        if let Some(entry) = entry_result? {
            entries.push(entry);
        }
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

fn validate_session_state_size(byte_len: u64) -> Result<(), String> {
    if byte_len > MAX_SESSION_STATE_BYTES {
        return Err(format!(
            "Session state exceeds the {} byte limit",
            MAX_SESSION_STATE_BYTES
        ));
    }

    Ok(())
}

fn read_session_state(app: &AppHandle) -> Result<Option<PersistedSession>, String> {
    let session_path = session_file_path(app)?;

    if !session_path.exists() {
        return Ok(None);
    }

    let session_metadata = fs::metadata(&session_path).map_err(|error| error.to_string())?;
    validate_session_state_size(session_metadata.len())?;

    let contents = fs::read_to_string(&session_path).map_err(|error| error.to_string())?;
    let session = serde_json::from_str(&contents).map_err(|error| error.to_string())?;

    Ok(Some(session))
}

fn write_session_state(app: &AppHandle, session: &PersistedSession) -> Result<(), String> {
    let session_path = session_file_path(app)?;
    let json = serde_json::to_string_pretty(session).map_err(|error| error.to_string())?;

    validate_session_state_size(json.len() as u64)?;

    fs::write(session_path, json).map_err(|error| error.to_string())
}

fn current_unix_timestamp_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn current_app_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

fn touch_last_update_check_at(app: &AppHandle, checked_at: &str) -> Result<(), String> {
    let Some(mut session) = read_session_state(app)? else {
        return Ok(());
    };

    session.last_update_check_at = Some(checked_at.to_string());
    write_session_state(app, &session)
}

fn normalize_update_channel(value: Option<&str>) -> String {
    match value.map(str::trim) {
        Some("prerelease") => "prerelease".to_string(),
        _ => "stable".to_string(),
    }
}

async fn resolve_update_endpoints(channel: &str) -> Result<Vec<Url>, String> {
    if channel == "prerelease" {
        let mut endpoints = Vec::new();

        if let Ok(endpoint) = resolve_latest_prerelease_manifest_url().await {
            endpoints.push(endpoint);
        }

        endpoints.push(Url::parse(STABLE_UPDATE_ENDPOINT).map_err(|error| error.to_string())?);

        return Ok(endpoints);
    }

    Ok(vec![
        Url::parse(STABLE_UPDATE_ENDPOINT).map_err(|error| error.to_string())?
    ])
}

async fn resolve_latest_prerelease_manifest_url() -> Result<Url, String> {
    let client = reqwest::Client::builder()
        .user_agent(format!("Diffly/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(GITHUB_RELEASES_API_ENDPOINT)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let response = response
        .error_for_status()
        .map_err(|error| error.to_string())?;
    let releases = response
        .json::<Vec<GitHubRelease>>()
        .await
        .map_err(|error| error.to_string())?;

    let asset_url = releases
        .into_iter()
        .find(|release| release.prerelease && !release.draft)
        .and_then(|release| {
            release
                .assets
                .into_iter()
                .find(|asset| asset.name == PRERELEASE_UPDATE_MANIFEST_NAME)
                .map(|asset| asset.browser_download_url)
        })
        .ok_or_else(|| "No published prerelease update feed is available yet.".to_string())?;

    Url::parse(&asset_url).map_err(|error| error.to_string())
}

fn clear_pending_update(state: &tauri::State<'_, UpdateState>) -> Result<(), String> {
    let mut pending = state.pending.lock().map_err(|error| error.to_string())?;
    pending.take();
    Ok(())
}

fn take_pending_update(
    state: &tauri::State<'_, UpdateState>,
) -> Result<Option<PendingUpdate>, String> {
    let mut pending = state.pending.lock().map_err(|error| error.to_string())?;
    Ok(pending.take())
}

fn set_pending_update(
    state: &tauri::State<'_, UpdateState>,
    update: PendingUpdate,
) -> Result<(), String> {
    let mut pending = state.pending.lock().map_err(|error| error.to_string())?;
    *pending = Some(update);
    Ok(())
}

fn collect_directory_files(base: &Path) -> Result<HashMap<String, PathBuf>, String> {
    let mut files = HashMap::new();

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
    if is_binary_file(left)? || is_binary_file(right)? {
        return Ok(EntryStatus::Binary);
    }

    if is_too_large(left)? || is_too_large(right)? {
        return Ok(EntryStatus::TooLarge);
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

    if matches!(left_loaded, LoadedFile::TooLarge) || matches!(right_loaded, LoadedFile::TooLarge) {
        return Ok(FileDiffResult {
            content_kind: ContentKind::TooLarge,
            summary: "At least one file exceeds the 1 MB text diff limit.".to_string(),
            left_label,
            right_label,
            side_by_side: Vec::new(),
            unified: Vec::new(),
            image: None,
            binary: None,
        });
    }

    let summary = build_summary(&left_loaded, &right_loaded);

    if should_render_as_image(&left_loaded, &right_loaded) {
        let payload = build_image_payload(left, right, &left_loaded, &right_loaded)?;
        let (left_sha, right_sha) = (
            payload.left_meta.sha256.as_deref(),
            payload.right_meta.sha256.as_deref(),
        );
        let identical = left_sha.is_some() && left_sha == right_sha;
        let summary = if identical {
            "Images are identical.".to_string()
        } else if payload.left_meta.exists && payload.right_meta.exists {
            "Images differ.".to_string()
        } else {
            summary
        };

        return Ok(FileDiffResult {
            content_kind: ContentKind::Image,
            summary,
            left_label,
            right_label,
            side_by_side: Vec::new(),
            unified: Vec::new(),
            image: Some(payload),
            binary: None,
        });
    }

    if matches!(left_loaded, LoadedFile::Binary(_, _))
        || matches!(right_loaded, LoadedFile::Binary(_, _))
        || matches!(left_loaded, LoadedFile::Image(_))
        || matches!(right_loaded, LoadedFile::Image(_))
    {
        let payload = build_binary_payload(left, right, &left_loaded, &right_loaded)?;
        let identical = payload.left_meta.sha256.is_some()
            && payload.left_meta.sha256 == payload.right_meta.sha256;
        let summary = if identical {
            "Binary files are identical.".to_string()
        } else if payload.truncated {
            "Binary files differ. The hex view is truncated at 8 MB per side.".to_string()
        } else if !matches!(left_loaded, LoadedFile::Missing)
            && !matches!(right_loaded, LoadedFile::Missing)
        {
            "Binary files differ.".to_string()
        } else {
            summary
        };

        return Ok(FileDiffResult {
            content_kind: ContentKind::Binary,
            summary,
            left_label,
            right_label,
            side_by_side: Vec::new(),
            unified: Vec::new(),
            image: None,
            binary: Some(payload),
        });
    }

    let left_text = match left_loaded {
        LoadedFile::Text(text) => text,
        LoadedFile::Missing => String::new(),
        LoadedFile::TooLarge | LoadedFile::Image(_) | LoadedFile::Binary(_, _) => String::new(),
    };

    let right_text = match right_loaded {
        LoadedFile::Text(text) => text,
        LoadedFile::Missing => String::new(),
        LoadedFile::TooLarge | LoadedFile::Image(_) | LoadedFile::Binary(_, _) => String::new(),
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
        image: None,
        binary: None,
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
    let anchors = local_exact_anchor_pairs(&left_descriptors, &right_descriptors);
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
    merge_adjacent_replace_gap_pairs(&mut row_pairs, &left_descriptors, &right_descriptors);

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

fn merge_adjacent_replace_gap_pairs(
    row_pairs: &mut Vec<(Option<usize>, Option<usize>)>,
    left_descriptors: &[LineDescriptor],
    right_descriptors: &[LineDescriptor],
) {
    let mut merged = Vec::with_capacity(row_pairs.len());
    let mut index = 0;

    while index < row_pairs.len() {
        if let Some(pair) =
            mergeable_adjacent_gap_pair(row_pairs, index, left_descriptors, right_descriptors)
        {
            merged.push(pair);
            index += 2;
            continue;
        }

        merged.push(row_pairs[index]);
        index += 1;
    }

    *row_pairs = merged;
}

fn mergeable_adjacent_gap_pair(
    row_pairs: &[(Option<usize>, Option<usize>)],
    index: usize,
    left_descriptors: &[LineDescriptor],
    right_descriptors: &[LineDescriptor],
) -> Option<(Option<usize>, Option<usize>)> {
    let current = *row_pairs.get(index)?;
    let next = *row_pairs.get(index + 1)?;

    match (current, next) {
        ((Some(left_index), None), (None, Some(right_index)))
        | ((None, Some(right_index)), (Some(left_index), None)) => {
            let left = left_descriptors.get(left_index)?;
            let right = right_descriptors.get(right_index)?;

            can_merge_adjacent_gap_pair(left, right)
                .then_some((Some(left_index), Some(right_index)))
        }
        _ => None,
    }
}

fn can_merge_adjacent_gap_pair(left: &LineDescriptor, right: &LineDescriptor) -> bool {
    if left.indentation_depth.abs_diff(right.indentation_depth) > 4 {
        return false;
    }

    looks_like_typedef_alias_close(&left.code_signature)
        && looks_like_typedef_alias_close(&right.code_signature)
        || looks_like_multiline_define_header(left) && looks_like_multiline_define_header(right)
}

fn local_exact_anchor_pairs(
    left_descriptors: &[LineDescriptor],
    right_descriptors: &[LineDescriptor],
) -> Vec<(usize, usize)> {
    let mut filtered = Vec::new();
    let mut left_cursor = 0;
    let mut right_cursor = 0;

    for (left_anchor, right_anchor) in exact_code_anchor_pairs(left_descriptors, right_descriptors)
    {
        let left_gap = left_anchor.saturating_sub(left_cursor);
        let right_gap = right_anchor.saturating_sub(right_cursor);

        if left_gap.max(right_gap) > LINE_PAIR_ANCHOR_MAX_PREFIX_GAP {
            continue;
        }

        filtered.push((left_anchor, right_anchor));
        left_cursor = left_anchor + 1;
        right_cursor = right_anchor + 1;
    }

    filtered
}

fn append_aligned_subrange(
    row_pairs: &mut Vec<(Option<usize>, Option<usize>)>,
    left_descriptors: &[LineDescriptor],
    right_descriptors: &[LineDescriptor],
    left_offset: usize,
    right_offset: usize,
) {
    for (left_match, right_match) in
        align_replace_subrange_local(left_descriptors, right_descriptors)
    {
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
    let left_signature_counts = left_descriptors
        .iter()
        .filter(|descriptor| is_exact_anchor_candidate(descriptor))
        .fold(HashMap::new(), |mut counts, descriptor| {
            *counts.entry(descriptor.code_signature.clone()).or_insert(0) += 1;
            counts
        });
    let right_signature_counts = right_descriptors
        .iter()
        .filter(|descriptor| is_exact_anchor_candidate(descriptor))
        .fold(HashMap::new(), |mut counts, descriptor| {
            *counts.entry(descriptor.code_signature.clone()).or_insert(0) += 1;
            counts
        });
    let left_candidates = left_descriptors
        .iter()
        .enumerate()
        .filter(|(_, descriptor)| is_exact_anchor_candidate(descriptor))
        .filter(|(_, descriptor)| {
            left_signature_counts
                .get(&descriptor.code_signature)
                .copied()
                .unwrap_or(0)
                == 1
                && right_signature_counts
                    .get(&descriptor.code_signature)
                    .copied()
                    .unwrap_or(0)
                    == 1
        })
        .map(|(index, descriptor)| (index, descriptor.code_signature.clone()))
        .collect::<Vec<_>>();
    let right_candidates = right_descriptors
        .iter()
        .enumerate()
        .filter(|(_, descriptor)| is_exact_anchor_candidate(descriptor))
        .filter(|(_, descriptor)| {
            left_signature_counts
                .get(&descriptor.code_signature)
                .copied()
                .unwrap_or(0)
                == 1
                && right_signature_counts
                    .get(&descriptor.code_signature)
                    .copied()
                    .unwrap_or(0)
                    == 1
        })
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
        && !descriptor.is_weak_structural
        && descriptor.identifier_count > 0
        && (!descriptor.is_preprocessor || !descriptor.primary_identifier.is_empty())
}

fn align_replace_subrange_local(
    left_descriptors: &[LineDescriptor],
    right_descriptors: &[LineDescriptor],
) -> Vec<(Option<usize>, Option<usize>)> {
    let mut left_index = 0;
    let mut right_index = 0;
    let mut aligned = Vec::new();

    while left_index < left_descriptors.len() || right_index < right_descriptors.len() {
        if left_index == left_descriptors.len() {
            aligned.push((None, Some(right_index)));
            right_index += 1;
            continue;
        }

        if right_index == right_descriptors.len() {
            aligned.push((Some(left_index), None));
            left_index += 1;
            continue;
        }

        let direct_pair = pair_band(
            &left_descriptors[left_index],
            &right_descriptors[right_index],
        );

        if matches!(
            direct_pair,
            Some(MatchBand::StrongExact | MatchBand::StrongModified)
        ) || matches!(direct_pair, Some(MatchBand::WeakStructural))
            && (left_descriptors[left_index].normalized_text
                == right_descriptors[right_index].normalized_text
                || !has_stronger_candidate_nearby(
                    left_descriptors,
                    right_descriptors,
                    left_index,
                    right_index,
                ))
        {
            aligned.push((Some(left_index), Some(right_index)));
            left_index += 1;
            right_index += 1;
            continue;
        }

        if should_flush_current_gap(
            &left_descriptors[left_index],
            &right_descriptors[right_index],
        ) {
            match weaker_structural_side(
                &left_descriptors[left_index],
                &right_descriptors[right_index],
            ) {
                AlignmentMove::LeftOnly => {
                    aligned.push((Some(left_index), None));
                    left_index += 1;
                }
                AlignmentMove::RightOnly => {
                    aligned.push((None, Some(right_index)));
                    right_index += 1;
                }
                AlignmentMove::Pair => {
                    aligned.push((Some(left_index), Some(right_index)));
                    left_index += 1;
                    right_index += 1;
                }
            }
            continue;
        }

        let remaining_left = left_descriptors.len() - left_index;
        let remaining_right = right_descriptors.len() - right_index;

        if remaining_left <= LINE_PAIR_FALLBACK_DP_LIMIT
            && remaining_right <= LINE_PAIR_FALLBACK_DP_LIMIT
        {
            for (left_match, right_match) in align_replace_subrange_fallback_dp(
                &left_descriptors[left_index..],
                &right_descriptors[right_index..],
            ) {
                aligned.push((
                    left_match.map(|index| index + left_index),
                    right_match.map(|index| index + right_index),
                ));
            }
            break;
        }

        if let Some(candidate) = find_next_resync_match(
            left_descriptors,
            right_descriptors,
            left_index,
            right_index,
            false,
        )
        .or_else(|| {
            find_next_resync_match(
                left_descriptors,
                right_descriptors,
                left_index,
                right_index,
                true,
            )
        }) {
            while left_index < candidate.left_index || right_index < candidate.right_index {
                match choose_gap_side(
                    left_descriptors,
                    right_descriptors,
                    left_index,
                    right_index,
                    candidate.left_index,
                    candidate.right_index,
                ) {
                    AlignmentMove::LeftOnly => {
                        aligned.push((Some(left_index), None));
                        left_index += 1;
                    }
                    AlignmentMove::RightOnly => {
                        aligned.push((None, Some(right_index)));
                        right_index += 1;
                    }
                    AlignmentMove::Pair => {}
                }
            }

            if left_index == candidate.left_index && right_index == candidate.right_index {
                aligned.push((Some(left_index), Some(right_index)));
                left_index += 1;
                right_index += 1;
                continue;
            }
        }

        match choose_gap_side(
            left_descriptors,
            right_descriptors,
            left_index,
            right_index,
            left_descriptors.len(),
            right_descriptors.len(),
        ) {
            AlignmentMove::LeftOnly => {
                aligned.push((Some(left_index), None));
                left_index += 1;
            }
            AlignmentMove::RightOnly => {
                aligned.push((None, Some(right_index)));
                right_index += 1;
            }
            AlignmentMove::Pair => {
                aligned.push((Some(left_index), Some(right_index)));
                left_index += 1;
                right_index += 1;
            }
        }
    }

    aligned
}

fn has_stronger_candidate_nearby(
    left_descriptors: &[LineDescriptor],
    right_descriptors: &[LineDescriptor],
    left_index: usize,
    right_index: usize,
) -> bool {
    find_next_resync_match(
        left_descriptors,
        right_descriptors,
        left_index,
        right_index,
        false,
    )
    .is_some_and(|candidate| {
        candidate.left_index != left_index || candidate.right_index != right_index
    })
}

fn find_next_resync_match(
    left_descriptors: &[LineDescriptor],
    right_descriptors: &[LineDescriptor],
    left_index: usize,
    right_index: usize,
    include_weak_structural: bool,
) -> Option<ResyncCandidate> {
    let left_limit = (left_index + LINE_PAIR_LOOKAHEAD_WINDOW).min(left_descriptors.len());
    let right_limit = (right_index + LINE_PAIR_LOOKAHEAD_WINDOW).min(right_descriptors.len());
    let mut best_candidate = None;

    for (current_left, left_descriptor) in left_descriptors
        .iter()
        .enumerate()
        .take(left_limit)
        .skip(left_index)
    {
        for (current_right, right_descriptor) in right_descriptors
            .iter()
            .enumerate()
            .take(right_limit)
            .skip(right_index)
        {
            let Some(band) = pair_band(left_descriptor, right_descriptor) else {
                continue;
            };

            if !include_weak_structural && band == MatchBand::WeakStructural {
                continue;
            }

            let candidate = ResyncCandidate {
                left_index: current_left,
                right_index: current_right,
                band,
            };

            let is_better_candidate = match best_candidate {
                Some(best) => resync_candidate_cmp(candidate, best).is_lt(),
                None => true,
            };

            if is_better_candidate {
                best_candidate = Some(candidate);
            }
        }
    }

    best_candidate
}

fn choose_gap_side(
    left_descriptors: &[LineDescriptor],
    right_descriptors: &[LineDescriptor],
    left_index: usize,
    right_index: usize,
    left_limit: usize,
    right_limit: usize,
) -> AlignmentMove {
    if left_index >= left_limit {
        return AlignmentMove::RightOnly;
    }

    if right_index >= right_limit {
        return AlignmentMove::LeftOnly;
    }

    let current_priority_order = descriptor_priority(&left_descriptors[left_index])
        .cmp(&descriptor_priority(&right_descriptors[right_index]));

    if current_priority_order != std::cmp::Ordering::Equal {
        return weaker_current_side(
            &left_descriptors[left_index],
            &right_descriptors[right_index],
        );
    }

    let left_future = best_future_match_for_left(
        &left_descriptors[left_index],
        right_descriptors,
        right_index,
        right_limit,
    );
    let right_future = best_future_match_for_right(
        left_descriptors,
        left_index,
        left_limit,
        &right_descriptors[right_index],
    );

    match compare_future_matches(left_future, right_future) {
        std::cmp::Ordering::Greater => AlignmentMove::RightOnly,
        std::cmp::Ordering::Less => AlignmentMove::LeftOnly,
        std::cmp::Ordering::Equal => weaker_current_side(
            &left_descriptors[left_index],
            &right_descriptors[right_index],
        ),
    }
}

fn should_flush_current_gap(left: &LineDescriptor, right: &LineDescriptor) -> bool {
    left.kind != right.kind
        || left.is_preprocessor != right.is_preprocessor
        || left.is_weak_structural != right.is_weak_structural
}

fn weaker_structural_side(left: &LineDescriptor, right: &LineDescriptor) -> AlignmentMove {
    if left.kind == LineKind::Blank || left.kind == LineKind::CommentOnly {
        return AlignmentMove::LeftOnly;
    }

    if right.kind == LineKind::Blank || right.kind == LineKind::CommentOnly {
        return AlignmentMove::RightOnly;
    }

    if left.is_weak_structural && !right.is_weak_structural {
        return AlignmentMove::LeftOnly;
    }

    if right.is_weak_structural && !left.is_weak_structural {
        return AlignmentMove::RightOnly;
    }

    weaker_current_side(left, right)
}

fn best_future_match_for_left(
    left_descriptor: &LineDescriptor,
    right_descriptors: &[LineDescriptor],
    right_index: usize,
    right_limit: usize,
) -> Option<(MatchBand, usize)> {
    let limit = (right_index + LINE_PAIR_LOOKAHEAD_WINDOW).min(right_limit);
    let mut best = None;

    for (current_right, right_descriptor) in right_descriptors
        .iter()
        .enumerate()
        .take(limit)
        .skip(right_index)
    {
        let Some(band) = pair_band(left_descriptor, right_descriptor) else {
            continue;
        };
        let offset = current_right - right_index;

        let is_better_match = match best {
            Some(current) => future_match_cmp((band, offset), current).is_gt(),
            None => true,
        };

        if is_better_match {
            best = Some((band, offset));
        }
    }

    best
}

fn best_future_match_for_right(
    left_descriptors: &[LineDescriptor],
    left_index: usize,
    left_limit: usize,
    right_descriptor: &LineDescriptor,
) -> Option<(MatchBand, usize)> {
    let limit = (left_index + LINE_PAIR_LOOKAHEAD_WINDOW).min(left_limit);
    let mut best = None;

    for (current_left, left_descriptor) in left_descriptors
        .iter()
        .enumerate()
        .take(limit)
        .skip(left_index)
    {
        let Some(band) = pair_band(left_descriptor, right_descriptor) else {
            continue;
        };
        let offset = current_left - left_index;

        let is_better_match = match best {
            Some(current) => future_match_cmp((band, offset), current).is_gt(),
            None => true,
        };

        if is_better_match {
            best = Some((band, offset));
        }
    }

    best
}

fn compare_future_matches(
    left_future: Option<(MatchBand, usize)>,
    right_future: Option<(MatchBand, usize)>,
) -> std::cmp::Ordering {
    match (left_future, right_future) {
        (Some(left), Some(right)) => future_match_cmp(left, right),
        (Some(_), None) => std::cmp::Ordering::Greater,
        (None, Some(_)) => std::cmp::Ordering::Less,
        (None, None) => std::cmp::Ordering::Equal,
    }
}

fn future_match_cmp(
    left_future: (MatchBand, usize),
    right_future: (MatchBand, usize),
) -> std::cmp::Ordering {
    match match_band_rank(left_future.0).cmp(&match_band_rank(right_future.0)) {
        std::cmp::Ordering::Equal => right_future.1.cmp(&left_future.1),
        ordering => ordering,
    }
}

fn weaker_current_side(left: &LineDescriptor, right: &LineDescriptor) -> AlignmentMove {
    let left_priority = descriptor_priority(left);
    let right_priority = descriptor_priority(right);

    match left_priority.cmp(&right_priority) {
        std::cmp::Ordering::Less => AlignmentMove::LeftOnly,
        std::cmp::Ordering::Greater => AlignmentMove::RightOnly,
        std::cmp::Ordering::Equal => AlignmentMove::LeftOnly,
    }
}

fn descriptor_priority(descriptor: &LineDescriptor) -> i32 {
    match descriptor.kind {
        LineKind::Blank => 0,
        LineKind::CommentOnly => 1,
        LineKind::Code => {
            if descriptor.is_weak_structural {
                2
            } else if descriptor.is_preprocessor {
                4
            } else {
                match descriptor.match_band_seed {
                    MatchBandSeed::Assignment => 6,
                    MatchBandSeed::ControlHeader => 5,
                    MatchBandSeed::Call | MatchBandSeed::OtherCode => 4,
                    MatchBandSeed::Preprocessor => 4,
                    MatchBandSeed::WeakStructural => 2,
                    MatchBandSeed::Comment => 1,
                    MatchBandSeed::Blank => 0,
                }
            }
        }
    }
}

fn align_replace_subrange_fallback_dp(
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
                    let locality_penalty =
                        (left_index.abs_diff(right_index) as i32) * LINE_PAIR_LOCALITY_PENALTY;
                    let candidate =
                        scores[left_index + 1][right_index + 1] + pair_score - locality_penalty;

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
    let band = pair_band(left, right)?;

    Some(match band {
        MatchBand::StrongExact => {
            if left.kind == LineKind::Blank {
                LINE_PAIR_BLANK_MATCH_SCORE
            } else if left.kind == LineKind::CommentOnly {
                LINE_PAIR_COMMENT_MATCH_SCORE + 20
            } else if !left.code_signature.is_empty() && left.code_signature == right.code_signature
            {
                LINE_PAIR_SIGNATURE_MATCH_SCORE + indentation_bonus(left, right)
            } else {
                LINE_PAIR_NORMALIZED_MATCH_SCORE + indentation_bonus(left, right)
            }
        }
        MatchBand::StrongModified => {
            LINE_PAIR_STRONG_MODIFIED_SCORE
                + line_similarity_score(left, right) / 2
                + indentation_bonus(left, right)
        }
        MatchBand::WeakStructural => {
            LINE_PAIR_WEAK_STRUCTURAL_MATCH_SCORE + indentation_bonus(left, right)
        }
    })
}

fn pair_band(left: &LineDescriptor, right: &LineDescriptor) -> Option<MatchBand> {
    match (left.kind, right.kind) {
        (LineKind::Blank, LineKind::Blank) => Some(MatchBand::WeakStructural),
        (LineKind::Blank, _) | (_, LineKind::Blank) => None,
        (LineKind::CommentOnly, LineKind::Code) => commented_code_pair_band(left, right),
        (LineKind::Code, LineKind::CommentOnly) => commented_code_pair_band(right, left),
        (LineKind::CommentOnly, LineKind::CommentOnly) => comment_pair_band(left, right),
        (LineKind::Code, LineKind::Code) => code_pair_band(left, right),
    }
}

fn comment_pair_band(left: &LineDescriptor, right: &LineDescriptor) -> Option<MatchBand> {
    if left.trimmed_text == right.trimmed_text {
        return Some(MatchBand::StrongExact);
    }

    if left.normalized_text == right.normalized_text {
        return Some(MatchBand::StrongExact);
    }

    let similarity = line_similarity_score(left, right);

    if similarity < LINE_PAIR_MIN_SIMILARITY {
        return (same_comment_prefix(left, right)
            && left.indentation_depth.abs_diff(right.indentation_depth) <= 4
            && !left.tokens.is_empty()
            && !right.tokens.is_empty())
        .then_some(MatchBand::StrongModified);
    }

    Some(MatchBand::StrongModified)
}

fn same_comment_prefix(left: &LineDescriptor, right: &LineDescriptor) -> bool {
    comment_prefix(&left.trimmed_text) == comment_prefix(&right.trimmed_text)
}

fn comment_prefix(text: &str) -> &str {
    if text.starts_with("//") {
        "//"
    } else if text.starts_with("/*") {
        "/*"
    } else if text.starts_with('*') {
        "*"
    } else if text.starts_with("*/") {
        "*/"
    } else {
        ""
    }
}

fn commented_code_pair_band(comment: &LineDescriptor, code: &LineDescriptor) -> Option<MatchBand> {
    if comment.commented_code_signature.is_empty() {
        return None;
    }

    if comment.commented_code_is_preprocessor != code.is_preprocessor {
        return None;
    }

    if !code.code_signature.is_empty() && comment.commented_code_signature == code.code_signature {
        return Some(if code.is_weak_structural {
            MatchBand::WeakStructural
        } else {
            MatchBand::StrongModified
        });
    }

    if code.is_weak_structural {
        return None;
    }

    let same_primary_identifier = !comment.commented_code_primary_identifier.is_empty()
        && comment.commented_code_primary_identifier == code.primary_identifier;
    let similarity = commented_code_similarity_score(comment, code);

    if comment.commented_code_is_preprocessor {
        return (same_primary_identifier
            && preprocessor_family(&comment.commented_code_signature)
                == preprocessor_family(&code.code_signature)
            && similarity >= LINE_PAIR_MIN_SIMILARITY - 20)
            .then_some(MatchBand::StrongModified);
    }

    (same_primary_identifier && similarity >= LINE_PAIR_MIN_SIMILARITY - 20)
        .then_some(MatchBand::StrongModified)
}

fn code_pair_band(left: &LineDescriptor, right: &LineDescriptor) -> Option<MatchBand> {
    if !left.code_signature.is_empty() && left.code_signature == right.code_signature {
        return Some(if is_weak_structural_pair(left, right) {
            MatchBand::WeakStructural
        } else {
            MatchBand::StrongExact
        });
    }

    if left.trimmed_text == right.trimmed_text || left.normalized_text == right.normalized_text {
        return Some(if is_weak_structural_pair(left, right) {
            MatchBand::WeakStructural
        } else {
            MatchBand::StrongExact
        });
    }

    if left.is_preprocessor != right.is_preprocessor {
        return None;
    }

    if left.is_weak_structural || right.is_weak_structural {
        return None;
    }

    if !callable_code_families_are_compatible(left, right) {
        return None;
    }

    let similarity = line_similarity_score(left, right);

    if declaration_family_match(left, right) {
        return Some(MatchBand::StrongModified);
    }

    let same_primary_identifier =
        !left.primary_identifier.is_empty() && left.primary_identifier == right.primary_identifier;
    let same_seed = left.match_band_seed == right.match_band_seed;

    if left.is_preprocessor {
        if looks_like_multiline_define_header(left)
            && looks_like_multiline_define_header(right)
            && shared_identifier_affix(&left.primary_identifier, &right.primary_identifier)
        {
            return Some(MatchBand::StrongModified);
        }

        if same_preprocessor_family(left, right)
            && ((same_primary_identifier
                || shared_identifier_affix(&left.primary_identifier, &right.primary_identifier))
                && similarity >= LINE_PAIR_MIN_SIMILARITY - 15
                || similarity >= LINE_PAIR_MIN_SIMILARITY + 10)
        {
            return Some(MatchBand::StrongModified);
        }

        return None;
    }

    if same_primary_identifier {
        if similarity < LINE_PAIR_MIN_SIMILARITY - 15 {
            return None;
        }

        return Some(MatchBand::StrongModified);
    }

    if looks_like_typedef_alias_close(&left.code_signature)
        && looks_like_typedef_alias_close(&right.code_signature)
        && shared_identifier_affix(&left.primary_identifier, &right.primary_identifier)
    {
        return Some(MatchBand::StrongModified);
    }

    if same_seed
        && matches!(
            left.match_band_seed,
            MatchBandSeed::Assignment | MatchBandSeed::ControlHeader | MatchBandSeed::Call
        )
        && similarity >= LINE_PAIR_MIN_SIMILARITY + 10
    {
        return Some(MatchBand::StrongModified);
    }

    if similarity < LINE_PAIR_MIN_SIMILARITY + 20 {
        return None;
    }

    matches!(
        left.match_band_seed,
        MatchBandSeed::Assignment | MatchBandSeed::Call | MatchBandSeed::OtherCode
    )
    .then_some(MatchBand::StrongModified)
}

fn callable_code_families_are_compatible(left: &LineDescriptor, right: &LineDescriptor) -> bool {
    match (
        callable_code_family(&left.code_signature),
        callable_code_family(&right.code_signature),
    ) {
        (Some(CallableCodeFamily::Call), Some(CallableCodeFamily::Call)) => true,
        (Some(CallableCodeFamily::Prototype), Some(CallableCodeFamily::Prototype)) => true,
        (Some(CallableCodeFamily::Signature), Some(CallableCodeFamily::Signature)) => true,
        (Some(CallableCodeFamily::Prototype), Some(CallableCodeFamily::Signature)) => true,
        (Some(CallableCodeFamily::Signature), Some(CallableCodeFamily::Prototype)) => true,
        (Some(_), Some(_)) => false,
        _ => true,
    }
}

fn callable_code_family(signature: &str) -> Option<CallableCodeFamily> {
    let trimmed = signature.trim();

    if trimmed.is_empty()
        || is_control_header(trimmed)
        || trimmed.starts_with("return ")
        || !trimmed.contains('(')
        || !trimmed.contains(')')
    {
        return None;
    }

    let prefix = trimmed.split('(').next().unwrap_or("").trim_end();
    let prefix_identifier_count = extract_identifiers(prefix).len();

    if prefix_identifier_count == 0 {
        return None;
    }

    if prefix_identifier_count == 1 {
        return trimmed.ends_with(';').then_some(CallableCodeFamily::Call);
    }

    if trimmed.ends_with(';') {
        Some(CallableCodeFamily::Prototype)
    } else {
        Some(CallableCodeFamily::Signature)
    }
}

fn declaration_family_match(left: &LineDescriptor, right: &LineDescriptor) -> bool {
    if !looks_like_declaration(&left.code_signature)
        || !looks_like_declaration(&right.code_signature)
    {
        return false;
    }

    if left.indentation_depth.abs_diff(right.indentation_depth) > 4 {
        return false;
    }

    declaration_leading_identifier(&left.code_signature)
        .zip(declaration_leading_identifier(&right.code_signature))
        .is_some_and(|(left_identifier, right_identifier)| left_identifier == right_identifier)
}

fn same_preprocessor_family(left: &LineDescriptor, right: &LineDescriptor) -> bool {
    preprocessor_family(&left.code_signature) == preprocessor_family(&right.code_signature)
}

fn looks_like_typedef_alias_close(signature: &str) -> bool {
    let trimmed = signature.trim();

    trimmed.starts_with('}')
        && trimmed.ends_with(';')
        && !trimmed.contains('(')
        && extract_identifiers(trimmed).len() == 1
}

fn shared_identifier_affix(left: &str, right: &str) -> bool {
    if left.is_empty() || right.is_empty() {
        return false;
    }

    common_prefix_len(left, right) >= 8 || common_suffix_len(left, right) >= 5
}

fn looks_like_multiline_define_header(descriptor: &LineDescriptor) -> bool {
    descriptor.is_preprocessor
        && preprocessor_family(&descriptor.code_signature) == "define"
        && descriptor.code_signature.trim_end().ends_with('\\')
}

fn preprocessor_family(signature: &str) -> &str {
    signature
        .trim_start()
        .trim_start_matches('#')
        .split_whitespace()
        .next()
        .unwrap_or("")
}

fn resync_candidate_cmp(
    left_candidate: ResyncCandidate,
    right_candidate: ResyncCandidate,
) -> std::cmp::Ordering {
    match match_band_rank(right_candidate.band).cmp(&match_band_rank(left_candidate.band)) {
        std::cmp::Ordering::Equal => {}
        ordering => return ordering,
    }

    match candidate_displacement(left_candidate).cmp(&candidate_displacement(right_candidate)) {
        std::cmp::Ordering::Equal => {}
        ordering => return ordering,
    }

    match candidate_drift(left_candidate).cmp(&candidate_drift(right_candidate)) {
        std::cmp::Ordering::Equal => {}
        ordering => return ordering,
    }

    match left_candidate.left_index.cmp(&right_candidate.left_index) {
        std::cmp::Ordering::Equal => left_candidate.right_index.cmp(&right_candidate.right_index),
        ordering => ordering,
    }
}

fn candidate_displacement(candidate: ResyncCandidate) -> usize {
    candidate.left_index + candidate.right_index
}

fn candidate_drift(candidate: ResyncCandidate) -> usize {
    candidate.left_index.abs_diff(candidate.right_index)
}

fn common_prefix_len(left: &str, right: &str) -> usize {
    left.chars()
        .zip(right.chars())
        .take_while(|(left_char, right_char)| left_char == right_char)
        .count()
}

fn common_suffix_len(left: &str, right: &str) -> usize {
    left.chars()
        .rev()
        .zip(right.chars().rev())
        .take_while(|(left_char, right_char)| left_char == right_char)
        .count()
}

fn match_band_rank(band: MatchBand) -> i32 {
    match band {
        MatchBand::WeakStructural => 0,
        MatchBand::StrongModified => 1,
        MatchBand::StrongExact => 2,
    }
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
    let total_chars = token_character_count(&left.tokens) + token_character_count(&right.tokens);

    if total_chars == 0 {
        0
    } else {
        ((common_chars * 200) / total_chars) as i32
    }
}

fn commented_code_similarity_score(comment: &LineDescriptor, code: &LineDescriptor) -> i32 {
    if comment.commented_code_tokens.is_empty() || code.tokens.is_empty() {
        return 0;
    }

    let common_pairs = lcs_pairs(&comment.commented_code_tokens, &code.tokens);

    if common_pairs.is_empty() {
        return 0;
    }

    let common_chars = common_pairs
        .into_iter()
        .map(|(comment_index, _)| comment.commented_code_tokens[comment_index].chars().count())
        .sum::<usize>();
    let total_chars =
        comment.commented_code_signature.chars().count() + code.code_signature.chars().count();

    if total_chars == 0 {
        0
    } else {
        ((common_chars * 200) / total_chars) as i32
    }
}

fn token_character_count(tokens: &[String]) -> usize {
    tokens
        .iter()
        .map(|token| token.chars().count())
        .sum::<usize>()
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
    let is_preprocessor = trimmed_text.starts_with('#');
    let commented_code_signature = if kind == LineKind::CommentOnly {
        commented_code_signature(&trimmed_text)
    } else {
        String::new()
    };
    let commented_code_is_preprocessor = commented_code_signature.starts_with('#');
    let code_signature = if kind == LineKind::Code {
        collapse_whitespace(trim_trailing_line_comment(&trimmed_text).trim())
    } else {
        String::new()
    };
    let identifier_count = extract_identifiers(&code_signature).len();
    let is_weak_structural =
        kind == LineKind::Code && is_weak_structural_signature(&code_signature);
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
        trimmed_text: trimmed_text.clone(),
        normalized_text,
        code_signature: code_signature.clone(),
        commented_code_signature: commented_code_signature.clone(),
        kind,
        tokens: tokenize_alignment_tokens(&token_source),
        commented_code_tokens: tokenize_alignment_tokens(&commented_code_signature),
        indentation_depth: leading_indent_width(text),
        primary_identifier: primary_identifier(&code_signature),
        commented_code_primary_identifier: primary_identifier(&commented_code_signature),
        is_preprocessor,
        commented_code_is_preprocessor,
        is_weak_structural,
        match_band_seed: match_band_seed(
            kind,
            &trimmed_text,
            &code_signature,
            is_preprocessor,
            is_weak_structural,
        ),
        identifier_count,
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

fn commented_code_signature(trimmed_text: &str) -> String {
    let Some(comment_body) = trimmed_text.strip_prefix("//") else {
        return String::new();
    };
    let uncommented = comment_body.trim_start();

    if !looks_like_commented_code(uncommented) {
        return String::new();
    }

    collapse_whitespace(trim_trailing_line_comment(uncommented).trim())
}

fn looks_like_commented_code(uncommented: &str) -> bool {
    if uncommented.is_empty() || is_comment_only_line(uncommented) {
        return false;
    }

    if uncommented.starts_with('#') {
        return extract_identifiers(uncommented).len() > 1;
    }

    let identifiers = extract_identifiers(uncommented);

    if identifiers.is_empty() {
        return false;
    }

    uncommented.contains('=')
        || uncommented.contains('(')
        || uncommented.contains(')')
        || uncommented.contains('{')
        || uncommented.contains('}')
        || uncommented.ends_with(';')
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

fn match_band_seed(
    kind: LineKind,
    trimmed_text: &str,
    code_signature: &str,
    is_preprocessor: bool,
    is_weak_structural: bool,
) -> MatchBandSeed {
    match kind {
        LineKind::Blank => MatchBandSeed::Blank,
        LineKind::CommentOnly => MatchBandSeed::Comment,
        LineKind::Code => {
            if is_weak_structural {
                return MatchBandSeed::WeakStructural;
            }

            if is_preprocessor {
                return MatchBandSeed::Preprocessor;
            }

            if is_control_header(trimmed_text) {
                return MatchBandSeed::ControlHeader;
            }

            if looks_like_assignment(code_signature) {
                return MatchBandSeed::Assignment;
            }

            if looks_like_call_or_signature(code_signature) {
                return MatchBandSeed::Call;
            }

            MatchBandSeed::OtherCode
        }
    }
}

fn is_weak_structural_pair(left: &LineDescriptor, right: &LineDescriptor) -> bool {
    left.is_weak_structural && right.is_weak_structural
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
            | "ifdef"
            | "ifndef"
            | "if"
            | "elif"
            | "else"
            | "endif"
            | "undef"
            | "include"
            | "pragma"
            | "static"
            | "const"
            | "volatile"
            | "extern"
            | "inline"
            | "for"
            | "while"
            | "switch"
            | "case"
            | "return"
            | "do"
            | "try"
            | "catch"
            | "finally"
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

fn is_control_header(text: &str) -> bool {
    let trimmed = text.trim_start();

    matches!(
        trimmed.split_whitespace().next().unwrap_or(""),
        "if" | "else" | "for" | "while" | "switch" | "case" | "return" | "do"
    )
}

fn looks_like_assignment(signature: &str) -> bool {
    signature.contains('=')
        && !signature.contains("==")
        && !signature.contains("!=")
        && !signature.contains(">=")
        && !signature.contains("<=")
}

fn looks_like_call_or_signature(signature: &str) -> bool {
    signature.contains('(') && signature.contains(')')
}

fn looks_like_declaration(signature: &str) -> bool {
    let trimmed = signature.trim();

    trimmed.ends_with(';')
        && !trimmed.starts_with("return ")
        && !trimmed.contains('=')
        && !trimmed.contains('(')
        && extract_identifiers(trimmed).len() >= 2
}

fn declaration_leading_identifier(signature: &str) -> Option<String> {
    extract_identifiers(signature)
        .into_iter()
        .find(|identifier| !is_declaration_prefix_qualifier(identifier))
}

fn is_declaration_prefix_qualifier(identifier: &str) -> bool {
    matches!(
        identifier,
        "static"
            | "const"
            | "volatile"
            | "extern"
            | "inline"
            | "register"
            | "signed"
            | "unsigned"
            | "struct"
            | "enum"
            | "union"
            | "typedef"
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
    let rows = left.len().saturating_add(1);
    let columns = right.len().saturating_add(1);

    if rows.saturating_mul(columns) > LCS_MAX_MATRIX_CELLS {
        return Vec::new();
    }

    let mut dp = vec![vec![0; columns]; rows];

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
    match detect_file_kind(path)? {
        DetectedFileKind::Missing => Ok(LoadedFile::Missing),
        DetectedFileKind::TooLarge => Ok(LoadedFile::TooLarge),
        DetectedFileKind::Text => {
            let bytes = fs::read(path).map_err(|error| error.to_string())?;
            Ok(LoadedFile::Text(
                String::from_utf8_lossy(&bytes).to_string(),
            ))
        }
        DetectedFileKind::Image(format) => {
            let (details, _) = load_binary_details(path, Some(format), false)?;
            Ok(LoadedFile::Image(details))
        }
        DetectedFileKind::Binary => {
            let collect_bytes =
                fs::metadata(path).map_err(|error| error.to_string())?.len() <= MAX_BINARY_BYTES;
            let (details, bytes) = load_binary_details(path, None, collect_bytes)?;
            Ok(LoadedFile::Binary(details, bytes))
        }
    }
}

fn detect_file_kind(path: &Path) -> Result<DetectedFileKind, String> {
    if !path.exists() {
        return Ok(DetectedFileKind::Missing);
    }

    let sample = sample_file_bytes(path)?;

    if looks_binary(&sample) {
        if let Some(format) = detect_image_format(&sample, path) {
            return Ok(DetectedFileKind::Image(format));
        }

        return Ok(DetectedFileKind::Binary);
    }

    if is_too_large(path)? {
        return Ok(DetectedFileKind::TooLarge);
    }

    Ok(DetectedFileKind::Text)
}

fn load_binary_details(
    path: &Path,
    format: Option<String>,
    collect_bytes: bool,
) -> Result<(LoadedBinaryFile, Option<Vec<u8>>), String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let size = metadata.len();
    let mut file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut bytes = if collect_bytes {
        Some(Vec::with_capacity(size as usize))
    } else {
        None
    };
    let mut buffer = [0; BINARY_SAMPLE_BYTES];

    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;

        if read == 0 {
            break;
        }

        hasher.update(&buffer[..read]);

        if let Some(collected_bytes) = bytes.as_mut() {
            collected_bytes.extend_from_slice(&buffer[..read]);
        }
    }

    let sha256 = format!("{:x}", hasher.finalize());

    Ok((
        LoadedBinaryFile {
            path: path.to_string_lossy().to_string(),
            size,
            sha256,
            format,
        },
        bytes,
    ))
}

fn build_summary(left: &LoadedFile, right: &LoadedFile) -> String {
    match (left, right) {
        (LoadedFile::Missing, LoadedFile::Missing) => "Neither file exists.".to_string(),
        (LoadedFile::Missing, _) => "Only the right file exists.".to_string(),
        (_, LoadedFile::Missing) => "Only the left file exists.".to_string(),
        _ => "Comparison ready.".to_string(),
    }
}

fn should_render_as_image(left: &LoadedFile, right: &LoadedFile) -> bool {
    matches!(left, LoadedFile::Image(_))
        && matches!(right, LoadedFile::Image(_) | LoadedFile::Missing)
        || matches!(right, LoadedFile::Image(_))
            && matches!(left, LoadedFile::Image(_) | LoadedFile::Missing)
}

fn build_image_payload(
    left_path: &Path,
    right_path: &Path,
    left_loaded: &LoadedFile,
    right_loaded: &LoadedFile,
) -> Result<ImageDiffPayload, String> {
    let left_details = loaded_file_details(left_loaded);
    let right_details = loaded_file_details(right_loaded);
    let left_identical = left_details
        .as_ref()
        .zip(right_details.as_ref())
        .is_some_and(|(left, right)| left.sha256 == right.sha256);
    let right_identical = left_identical;

    Ok(ImageDiffPayload {
        left_asset_url: if matches!(left_loaded, LoadedFile::Image(_)) {
            image_asset_url(left_path)
        } else {
            None
        },
        right_asset_url: if matches!(right_loaded, LoadedFile::Image(_)) {
            image_asset_url(right_path)
        } else {
            None
        },
        left_meta: build_binary_meta(left_path, left_details, left_identical),
        right_meta: build_binary_meta(right_path, right_details, right_identical),
    })
}

fn build_binary_payload(
    left_path: &Path,
    right_path: &Path,
    left_loaded: &LoadedFile,
    right_loaded: &LoadedFile,
) -> Result<BinaryDiffPayload, String> {
    let left_details = loaded_file_details(left_loaded);
    let right_details = loaded_file_details(right_loaded);
    let identical = left_details
        .as_ref()
        .zip(right_details.as_ref())
        .is_some_and(|(left, right)| left.sha256 == right.sha256);
    let truncated = matches!(left_loaded, LoadedFile::Binary(_, None))
        || matches!(right_loaded, LoadedFile::Binary(_, None));

    let rows = if identical || truncated {
        Vec::new()
    } else {
        build_hex_rows(
            loaded_file_bytes(left_loaded),
            loaded_file_bytes(right_loaded),
        )
    };

    Ok(BinaryDiffPayload {
        left_meta: build_binary_meta(left_path, left_details, identical),
        right_meta: build_binary_meta(right_path, right_details, identical),
        rows,
        bytes_per_row: HEX_BYTES_PER_ROW,
        truncated,
    })
}

fn loaded_file_details(file: &LoadedFile) -> Option<&LoadedBinaryFile> {
    match file {
        LoadedFile::Image(details) => Some(details),
        LoadedFile::Binary(details, _) => Some(details),
        LoadedFile::Missing | LoadedFile::TooLarge | LoadedFile::Text(_) => None,
    }
}

fn loaded_file_bytes(file: &LoadedFile) -> Option<&[u8]> {
    match file {
        LoadedFile::Binary(_, bytes) => bytes.as_deref(),
        LoadedFile::Missing | LoadedFile::TooLarge | LoadedFile::Text(_) | LoadedFile::Image(_) => {
            None
        }
    }
}

fn build_binary_meta(
    path: &Path,
    details: Option<&LoadedBinaryFile>,
    identical_to_other_side: bool,
) -> BinaryFileMeta {
    match details {
        Some(details) => BinaryFileMeta {
            exists: true,
            path: details.path.clone(),
            size: Some(details.size),
            sha256: Some(details.sha256.clone()),
            format: details.format.clone(),
            identical_to_other_side,
        },
        None => BinaryFileMeta {
            exists: false,
            path: path.to_string_lossy().to_string(),
            size: None,
            sha256: None,
            format: None,
            identical_to_other_side: false,
        },
    }
}

fn image_asset_url(path: &Path) -> Option<String> {
    Url::from_file_path(path)
        .ok()
        .map(|url| format!("asset://localhost{}", url.path()))
}

fn build_hex_rows(left_bytes: Option<&[u8]>, right_bytes: Option<&[u8]>) -> Vec<HexRow> {
    let left_bytes = left_bytes.unwrap_or(&[]);
    let right_bytes = right_bytes.unwrap_or(&[]);
    let total = left_bytes.len().max(right_bytes.len());
    let mut rows = Vec::new();

    for offset in (0..total).step_by(HEX_BYTES_PER_ROW) {
        let mut left_row = Vec::with_capacity(HEX_BYTES_PER_ROW);
        let mut right_row = Vec::with_capacity(HEX_BYTES_PER_ROW);

        for index in 0..HEX_BYTES_PER_ROW {
            let left_byte = left_bytes.get(offset + index).copied();
            let right_byte = right_bytes.get(offset + index).copied();
            let changed = left_byte != right_byte;
            left_row.push(build_hex_cell(left_byte, changed));
            right_row.push(build_hex_cell(right_byte, changed));
        }

        rows.push(HexRow {
            offset,
            left: left_row,
            right: right_row,
        });
    }

    rows
}

fn build_hex_cell(byte: Option<u8>, changed: bool) -> HexCell {
    match byte {
        Some(value) => HexCell {
            hex: format!("{:02X}", value),
            ascii: ascii_for_byte(value),
            changed,
        },
        None => HexCell {
            hex: String::new(),
            ascii: String::new(),
            changed: false,
        },
    }
}

fn ascii_for_byte(value: u8) -> String {
    if (32..=126).contains(&value) {
        char::from(value).to_string()
    } else {
        ".".to_string()
    }
}

fn detect_image_format(bytes: &[u8], path: &Path) -> Option<String> {
    if is_png(bytes) {
        return Some("png".to_string());
    }

    if is_jpeg(bytes) {
        return Some("jpeg".to_string());
    }

    if is_gif(bytes) {
        return Some("gif".to_string());
    }

    if is_bmp(bytes) {
        return Some("bmp".to_string());
    }

    if is_webp(bytes) {
        return Some("webp".to_string());
    }

    image_format_from_extension(path)
}

fn image_format_from_extension(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();

    match extension.as_str() {
        "png" => Some("png".to_string()),
        "jpg" | "jpeg" => Some("jpeg".to_string()),
        "gif" => Some("gif".to_string()),
        "bmp" => Some("bmp".to_string()),
        "webp" => Some("webp".to_string()),
        _ => None,
    }
}

fn is_png(bytes: &[u8]) -> bool {
    bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A])
}

fn is_jpeg(bytes: &[u8]) -> bool {
    bytes.starts_with(&[0xFF, 0xD8, 0xFF])
}

fn is_gif(bytes: &[u8]) -> bool {
    bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a")
}

fn is_bmp(bytes: &[u8]) -> bool {
    bytes.starts_with(b"BM")
}

fn is_webp(bytes: &[u8]) -> bool {
    bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP"
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
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(UpdateState::default())
        .invoke_handler(tauri::generate_handler![
            choose_path,
            load_session_state,
            save_session_state,
            get_app_version,
            check_for_updates,
            download_update,
            install_update,
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

    fn write_temp_bytes_file(path: &Path, contents: &[u8]) {
        fs::write(path, contents).expect("temporary binary file should be written");
    }

    fn test_png_bytes(seed: u8) -> Vec<u8> {
        let mut bytes = vec![
            137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1,
            8, 2, 0, 0, 0, seed,
        ];
        bytes.extend_from_slice(&[0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
        bytes
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
    fn open_compare_item_rejects_parent_dir_segments() {
        let temp_root = unique_temp_dir("open-compare-item-parent-dir");
        let left = temp_root.join("left");
        let right = temp_root.join("right");

        fs::create_dir_all(&left).expect("left directory should exist");
        fs::create_dir_all(&right).expect("right directory should exist");
        write_temp_file(&temp_root.join("secret.txt"), "top secret\n");

        let error = match open_compare_item(
            left.to_string_lossy().to_string(),
            right.to_string_lossy().to_string(),
            "../secret.txt".to_string(),
            default_options(),
        ) {
            Ok(_) => panic!("parent dir traversal should be rejected"),
            Err(error) => error,
        };

        assert_eq!(
            error,
            "The requested path must stay within the selected compare root."
        );

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn open_compare_item_rejects_absolute_relative_path() {
        let temp_root = unique_temp_dir("open-compare-item-absolute");
        let left = temp_root.join("left");
        let right = temp_root.join("right");

        fs::create_dir_all(&left).expect("left directory should exist");
        fs::create_dir_all(&right).expect("right directory should exist");

        let absolute_path = temp_root.join("outside.txt");
        write_temp_file(&absolute_path, "outside\n");

        let error = match open_compare_item(
            left.to_string_lossy().to_string(),
            right.to_string_lossy().to_string(),
            absolute_path.to_string_lossy().to_string(),
            default_options(),
        ) {
            Ok(_) => panic!("absolute paths should be rejected"),
            Err(error) => error,
        };

        assert_eq!(
            error,
            "The requested path must stay within the selected compare root."
        );

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
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
    fn file_diff_detects_png_images_by_signature_even_with_misleading_extension() {
        let temp_root = unique_temp_dir("file-detects-png-by-signature");
        let left = temp_root.join("left.txt");
        let right = temp_root.join("right.txt");

        write_temp_bytes_file(&left, &test_png_bytes(7));
        write_temp_bytes_file(&right, &test_png_bytes(9));

        let result = build_file_diff(
            &left,
            &right,
            "left".to_string(),
            "right".to_string(),
            &default_options(),
        )
        .expect("file diff should succeed");

        assert!(matches!(result.content_kind, ContentKind::Image));
        let payload = result.image.expect("image payload should exist");
        let left_asset_url = image_asset_url(&left).expect("left asset url should exist");
        let right_asset_url = image_asset_url(&right).expect("right asset url should exist");
        assert!(payload.left_meta.exists);
        assert!(payload.right_meta.exists);
        assert_eq!(
            payload.left_asset_url.as_deref(),
            Some(left_asset_url.as_str())
        );
        assert_eq!(
            payload.right_asset_url.as_deref(),
            Some(right_asset_url.as_str())
        );
        assert!(!payload.left_meta.identical_to_other_side);

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn file_diff_reports_identical_png_images() {
        let temp_root = unique_temp_dir("file-identical-png-images");
        let left = temp_root.join("left.png");
        let right = temp_root.join("right.png");
        let bytes = test_png_bytes(5);

        write_temp_bytes_file(&left, &bytes);
        write_temp_bytes_file(&right, &bytes);

        let result = build_file_diff(
            &left,
            &right,
            "left".to_string(),
            "right".to_string(),
            &default_options(),
        )
        .expect("file diff should succeed");

        assert!(matches!(result.content_kind, ContentKind::Image));
        assert_eq!(result.summary, "Images are identical.");
        let payload = result.image.expect("image payload should exist");
        assert!(payload.left_meta.identical_to_other_side);
        assert!(payload.right_meta.identical_to_other_side);

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn file_diff_builds_binary_hex_rows_for_small_binary_files() {
        let temp_root = unique_temp_dir("file-binary-hex-rows");
        let left = temp_root.join("left.bin");
        let right = temp_root.join("right.bin");

        write_temp_bytes_file(&left, &[0, 1, 2, 3, 16, 32, 48, 64, 80, 96, 112, 128]);
        write_temp_bytes_file(&right, &[0, 1, 2, 4, 16, 33, 48, 64, 80, 96, 113, 128]);

        let result = build_file_diff(
            &left,
            &right,
            "left".to_string(),
            "right".to_string(),
            &default_options(),
        )
        .expect("file diff should succeed");

        assert!(matches!(result.content_kind, ContentKind::Binary));
        let payload = result.binary.expect("binary payload should exist");
        assert_eq!(payload.bytes_per_row, HEX_BYTES_PER_ROW);
        assert!(!payload.truncated);
        assert_eq!(payload.rows.len(), 1);
        assert_eq!(payload.rows[0].offset, 0);
        assert_eq!(payload.rows[0].left[3].hex, "03");
        assert_eq!(payload.rows[0].right[3].hex, "04");
        assert!(payload.rows[0].left[3].changed);
        assert!(payload.rows[0].right[3].changed);
        assert_eq!(payload.rows[0].left[1].ascii, ".");

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn file_diff_leaves_missing_binary_side_empty() {
        let temp_root = unique_temp_dir("file-missing-binary-side");
        let left = temp_root.join("left.bin");
        let right = temp_root.join("right.bin");

        write_temp_bytes_file(&left, &[1, 2, 3, 4, 5, 6, 7, 8]);

        let result = build_file_diff(
            &left,
            &right,
            "left".to_string(),
            "right".to_string(),
            &default_options(),
        )
        .expect("file diff should succeed");

        assert!(matches!(result.content_kind, ContentKind::Binary));
        let payload = result.binary.expect("binary payload should exist");
        assert!(!payload.right_meta.exists);
        assert!(payload.rows[0]
            .right
            .iter()
            .all(|cell| cell.hex.is_empty() && !cell.changed));

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn file_diff_truncates_large_binary_files() {
        let temp_root = unique_temp_dir("file-truncates-large-binary");
        let left = temp_root.join("left.bin");
        let right = temp_root.join("right.bin");

        let large = vec![0; MAX_BINARY_BYTES as usize + 1];
        let mut shifted = vec![0; MAX_BINARY_BYTES as usize + 1];
        shifted[MAX_BINARY_BYTES as usize] = 1;

        write_temp_bytes_file(&left, &large);
        write_temp_bytes_file(&right, &shifted);

        let result = build_file_diff(
            &left,
            &right,
            "left".to_string(),
            "right".to_string(),
            &default_options(),
        )
        .expect("file diff should succeed");

        assert!(matches!(result.content_kind, ContentKind::Binary));
        let payload = result.binary.expect("binary payload should exist");
        assert!(payload.truncated);
        assert!(payload.rows.is_empty());
        assert_eq!(
            result.summary,
            "Binary files differ. The hex view is truncated at 8 MB per side."
        );

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
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

        write_temp_file(&left, "alpha\nSM_ADC_Threshold = 0;\nomega\n");
        write_temp_file(
            &right,
            concat!(
                "alpha\n",
                "SM_ADC_setThreshold();\n",
                "uint16_t SM_ADC_PeaksRef[SM_ADC_WINDOW_SIZE];\n",
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
            Some(text) if text == "SM_ADC_Threshold = 0;"
        ));
        assert!(result.side_by_side[1].right.is_none());
        assert!(matches!(
            result.side_by_side[2].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "SM_ADC_setThreshold();"
        ));
        assert!(result.side_by_side[2].left.is_none());

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn file_diff_aligns_deleted_declaration_with_first_inserted_declaration() {
        let temp_root = unique_temp_dir("file-aligns-declaration-block");
        let left = temp_root.join("left.txt");
        let right = temp_root.join("right.txt");

        write_temp_file(&left, "alpha\nuint16_t SM_ADC_Threshold;\nomega\n");
        write_temp_file(
            &right,
            concat!(
                "alpha\n",
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
        assert!(matches!(
            result.side_by_side[1].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "uint16_t SM_ADC_PeaksRef[SM_ADC_WINDOW_SIZE];"
        ));
        assert!(result.side_by_side[2].left.is_none());
        assert!(matches!(
            result.side_by_side[2].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "uint16_t SM_ADC_PeaksLive[SM_ADC_WINDOW_SIZE];"
        ));

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
        assert!(matches!(
            result.side_by_side[0].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "// Map the requested engineering value to a compensated microstep target position."
        ));
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
        assert!(matches!(
            result.side_by_side[3].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "int32_t SM_AdjustPosition(int32_t targetPos)"
        ));
        assert!(matches!(
            result.side_by_side[3].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "int32_t SM_AdjustPosition(int32_t targetPos)"
        ));
        assert!(matches!(
            result.side_by_side[4].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "{"
        ));
        assert!(matches!(
            result.side_by_side[4].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "{"
        ));

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn file_diff_pairs_summary_comment_with_first_old_comment_before_function_block() {
        let temp_root = unique_temp_dir("file-summary-comment-pairs-before-function");
        let left = temp_root.join("left.txt");
        let right = temp_root.join("right.txt");

        write_temp_file(
            &left,
            concat!(
                "// Standard calling time is 10ms\n",
                "// if called slower -> higher damping (e.g. for speed)\n",
                "void SM_HandlerLS_10ms(void);\n",
                "void SM_HandlerLS_10ms(void)\n",
                "{\n"
            ),
        );
        write_temp_file(
            &right,
            concat!(
                "// Update the low-speed pointer target filter that smooths visible needle motion.\n",
                "void SM_HandlerLS_10ms(void);\n",
                "void SM_HandlerLS_10ms(void)\n",
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
            Some(text) if text == "// Standard calling time is 10ms"
        ));
        assert!(matches!(
            result.side_by_side[0].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "// Update the low-speed pointer target filter that smooths visible needle motion."
        ));
        assert!(matches!(
            result.side_by_side[1].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "// if called slower -> higher damping (e.g. for speed)"
        ));
        assert!(result.side_by_side[1].right.is_none());
        assert!(matches!(
            result.side_by_side[2].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "void SM_HandlerLS_10ms(void);"
        ));
        assert!(matches!(
            result.side_by_side[2].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "void SM_HandlerLS_10ms(void);"
        ));
        assert!(matches!(
            result.side_by_side[3].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "void SM_HandlerLS_10ms(void)"
        ));
        assert!(matches!(
            result.side_by_side[3].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "void SM_HandlerLS_10ms(void)"
        ));
        assert!(matches!(
            result.side_by_side[4].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "{"
        ));
        assert!(matches!(
            result.side_by_side[4].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "{"
        ));

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn file_diff_pairs_commented_out_define_with_enabled_define_inline_comment() {
        let temp_root = unique_temp_dir("file-commented-out-define-pairs-inline");
        let left = temp_root.join("left.txt");
        let right = temp_root.join("right.txt");

        write_temp_file(
            &left,
            concat!(
                "#define ULTRON_SM_TEST_ACTIVE\n",
                "#define ULTRON_TEST_MODE_ACTIVE\n",
                "//#define ULTRON_LOGGER_MODE_ACTIVE\n",
                "#define FALSE false\n"
            ),
        );
        write_temp_file(
            &right,
            concat!(
                "#define ULTRON_SM_TEST_ACTIVE\n",
                "#define ULTRON_TEST_MODE_ACTIVE\n",
                "#define ULTRON_LOGGER_MODE_ACTIVE    // keep logger output enabled while validating the new SM behavior\n",
                "#define FALSE false\n"
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
            result.side_by_side[2].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "//#define ULTRON_LOGGER_MODE_ACTIVE"
        ));
        assert!(matches!(
            result.side_by_side[2].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "#define ULTRON_LOGGER_MODE_ACTIVE    // keep logger output enabled while validating the new SM behavior"
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
    fn file_diff_highlights_changed_initializer_literal_inline() {
        let temp_root = unique_temp_dir("file-highlights-changed-initializer-literal");
        let left = temp_root.join("left.txt");
        let right = temp_root.join("right.txt");

        write_temp_file(
            &left,
            concat!(
                "static int32_t step;\n",
                "static int32_t damp_fact = 16;             // 1 -> no damping\n",
                "static int32_t rem_val;\n"
            ),
        );
        write_temp_file(
            &right,
            concat!(
                "static int32_t step;\n",
                "static int32_t damp_fact = 8;              // 1 -> no damping\n",
                "static int32_t rem_val;\n"
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

        let changed_row = result
            .side_by_side
            .iter()
            .find(|row| {
                row.left
                    .as_ref()
                    .is_some_and(|cell| cell.text.contains("damp_fact = 16"))
            })
            .expect("changed damp_fact row should exist");
        let left_cell = changed_row
            .left
            .as_ref()
            .expect("left damp_fact cell should exist");
        let right_cell = changed_row
            .right
            .as_ref()
            .expect("right damp_fact cell should exist");

        assert!(left_cell
            .segments
            .iter()
            .any(|segment| { segment.highlighted && segment.text.contains("16") }));
        assert!(right_cell
            .segments
            .iter()
            .any(|segment| { segment.highlighted && segment.text.contains("8") }));

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
    fn file_diff_keeps_existing_function_aligned_when_new_helper_is_inserted_before_it() {
        let temp_root = unique_temp_dir("file-inserted-helper-before-existing-function");
        let left = temp_root.join("left.txt");
        let right = temp_root.join("right.txt");

        write_temp_file(
            &left,
            concat!(
                "static int32_t SM_GetPeakMargin(void)\n",
                "{\n",
                "    return SM_ADC_PEAK_MARGIN_BASE;\n",
                "}\n",
                "\n",
                "static void SM_RunWindow(void)\n",
                "{\n",
                "    SM_ADC_ActiveMargin = SM_GetPeakMargin();\n",
                "}\n"
            ),
        );
        write_temp_file(
            &right,
            concat!(
                "static int32_t SM_GetPeakMargin(void)\n",
                "{\n",
                "    if (SM_ADC_TempBucket < 0)\n",
                "    {\n",
                "        return SM_ADC_PEAK_MARGIN_COLD;\n",
                "    }\n",
                "\n",
                "    if (SM_ADC_TempBucket > 0)\n",
                "    {\n",
                "        return SM_ADC_PEAK_MARGIN_HOT;\n",
                "    }\n",
                "\n",
                "    return SM_ADC_PEAK_MARGIN_BASE;\n",
                "}\n",
                "\n",
                "static void SM_UpdateMeasurementWindow(void);\n",
                "static void SM_UpdateMeasurementWindow(void)\n",
                "{\n",
                "    SM_ADC_ActiveMargin = SM_GetPeakMargin();\n",
                "}\n",
                "\n",
                "static void SM_RunWindow(void)\n",
                "{\n",
                "    SM_ADC_ActiveMargin = SM_GetPeakMargin();\n",
                "}\n"
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
            result.side_by_side[21].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "static void SM_RunWindow(void)"
        ));
        assert!(matches!(
            result.side_by_side[21].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "static void SM_RunWindow(void)"
        ));
        assert!(matches!(
            result.side_by_side[23].left.as_ref().map(|cell| &cell.text),
            Some(text) if text == "    SM_ADC_ActiveMargin = SM_GetPeakMargin();"
        ));
        assert!(matches!(
            result.side_by_side[23].right.as_ref().map(|cell| &cell.text),
            Some(text) if text == "    SM_ADC_ActiveMargin = SM_GetPeakMargin();"
        ));
        let helper_signature_row = result
            .side_by_side
            .iter()
            .position(|row| {
                row.right.as_ref().is_some_and(|cell| {
                    cell.text == "static void SM_UpdateMeasurementWindow(void);"
                })
            })
            .expect("inserted helper signature should exist");
        let blank_separator = result
            .side_by_side
            .get(helper_signature_row.saturating_sub(1))
            .expect("blank separator row should exist");

        assert!(matches!(
            blank_separator.left.as_ref().map(|cell| cell.text.as_str()),
            Some("")
        ));
        assert!(matches!(
            blank_separator
                .right
                .as_ref()
                .map(|cell| cell.text.as_str()),
            Some("")
        ));

        fs::remove_dir_all(temp_root).expect("temporary directory should be removed");
    }

    #[test]
    fn file_diff_resyncs_after_inserted_struct_field_block_without_stray_gap_band() {
        let temp_root = unique_temp_dir("file-resyncs-after-inserted-struct-field-block");
        let left = temp_root.join("left.txt");
        let right = temp_root.join("right.txt");

        write_temp_file(
            &left,
            concat!(
                "typedef struct {\n",
                "    size_t offset;\n",
                "    uint16_t bit_offset;\n",
                "} IBN_SegmentMapEntry;\n",
                "\n",
                "#define IBN_SEG_ENTRY(field, seg_id) \\\n",
                "    { .offset = offsetof(IBN_SegmentPattern_t, field), .bit_offset = IBN_SEG_BIT_OFFSET_STATIC(seg_id) }\n",
                "\n",
                "static const IBN_SegmentMapEntry s_segment_map[] = {\n",
                "    IBN_SEG_ENTRY(windshield_front, SEG_XXX7),\n",
                "};\n",
            ),
        );
        write_temp_file(
            &right,
            concat!(
                "typedef struct {\n",
                "    size_t offset;\n",
                "} IBN_SegmentFieldEntry;\n",
                "\n",
                "#define IBN_SEG_FIELD_ENTRY(field) \\\n",
                "    { .offset = offsetof(IBN_SegmentPattern_t, field) }\n",
                "\n",
                "static const IBN_SegmentFieldEntry s_segment_fields[] = {\n",
                "    IBN_SEG_FIELD_ENTRY(windshield_front),\n",
                "};\n",
                "\n",
                "static const uint16_t s_segment_map_profiles[2][20] = {\n",
                "    { 1 },\n",
                "};\n",
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

        let struct_close_row = result
            .side_by_side
            .iter()
            .position(|row| {
                row.left
                    .as_ref()
                    .is_some_and(|cell| cell.text == "} IBN_SegmentMapEntry;")
            })
            .expect("left typedef close row should exist");
        let macro_row = result
            .side_by_side
            .iter()
            .position(|row| {
                row.left
                    .as_ref()
                    .is_some_and(|cell| cell.text == "#define IBN_SEG_ENTRY(field, seg_id) \\")
            })
            .expect("left macro row should exist");

        assert!(matches!(
            result.side_by_side[struct_close_row]
                .right
                .as_ref()
                .map(|cell| cell.text.as_str()),
            Some("} IBN_SegmentFieldEntry;")
        ));
        assert!(matches!(
            result.side_by_side[macro_row]
                .right
                .as_ref()
                .map(|cell| cell.text.as_str()),
            Some("#define IBN_SEG_FIELD_ENTRY(field) \\")
        ));
        assert!(
            result.side_by_side[struct_close_row + 1..macro_row]
                .iter()
                .all(|row| row.left.is_some() || row.right.is_some()),
            "resync should not leave a fully empty spacer band between paired changed rows"
        );

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

    #[test]
    fn replace_block_alignment_resyncs_after_inserted_comment_before_statement() {
        let left_cells = vec![
            test_changed_cell("if (ready)", DiffChange::Delete),
            test_changed_cell("{", DiffChange::Delete),
            test_changed_cell("x = y;", DiffChange::Delete),
        ];
        let right_cells = vec![
            test_changed_cell("if (ready)", DiffChange::Insert),
            test_changed_cell("{", DiffChange::Insert),
            test_changed_cell("// comment", DiffChange::Insert),
            test_changed_cell("x = y;", DiffChange::Insert),
        ];

        let alignment = align_replace_block_rows(&left_cells, &right_cells);

        assert_eq!(
            alignment.row_pairs,
            vec![
                (Some(0), Some(0)),
                (Some(1), Some(1)),
                (None, Some(2)),
                (Some(2), Some(3))
            ]
        );
    }

    #[test]
    fn replace_block_alignment_resyncs_after_inserted_preprocessor_block_before_else_if() {
        let left_cells = vec![
            test_changed_cell(
                "else if ((SM_waitstates >= 3) && (SM_waitstates < 9))",
                DiffChange::Delete,
            ),
            test_changed_cell("{", DiffChange::Delete),
            test_changed_cell("#ifdef ULTRON_SM_TEST_ACTIVE", DiffChange::Delete),
            test_changed_cell(
                "DL_GPIO_setPins(GPIO_LED_R_PORT, GPIO_LED_R_PIN);",
                DiffChange::Delete,
            ),
        ];
        let right_cells = vec![
            test_changed_cell("#ifdef ULTRON_SM_TEST_ACTIVE", DiffChange::Insert),
            test_changed_cell("DL_GPIO_clearPins(GPIO_TT_SECURITY_PORT, GPIO_TT_SECURITY_PIN);", DiffChange::Insert),
            test_changed_cell("#endif", DiffChange::Insert),
            test_changed_cell(
                "else if ((SM_waitstates >= SM_ADC_WindowStart) && (SM_waitstates < SM_ADC_WindowEnd))",
                DiffChange::Insert,
            ),
            test_changed_cell("{", DiffChange::Insert),
            test_changed_cell("#ifdef ULTRON_SM_TEST_ACTIVE", DiffChange::Insert),
            test_changed_cell("DL_GPIO_setPins(GPIO_LED_R_PORT, GPIO_LED_R_PIN);", DiffChange::Insert),
        ];

        let alignment = align_replace_block_rows(&left_cells, &right_cells);

        assert_eq!(alignment.row_pairs[0], (None, Some(0)));
        assert_eq!(alignment.row_pairs[1], (None, Some(1)));
        assert_eq!(alignment.row_pairs[2], (None, Some(2)));
        assert_eq!(alignment.left_matches[0], Some(3));
        assert_eq!(alignment.left_matches[1], Some(4));
        assert_eq!(alignment.left_matches[2], Some(5));
        assert_eq!(alignment.left_matches[3], Some(6));
    }

    #[test]
    fn replace_block_alignment_realigns_assignment_before_else_after_insertions() {
        let left_cells = vec![
            test_changed_cell("SM_synchronized = 0;", DiffChange::Delete),
            test_changed_cell("}", DiffChange::Delete),
            test_changed_cell("else", DiffChange::Delete),
        ];
        let right_cells = vec![
            test_changed_cell("SM_ADC_DetectedFlag = 1;", DiffChange::Insert),
            test_changed_cell(
                "DL_GPIO_clearPins(GPIO_SM_NOE_PORT, GPIO_PIN_0);",
                DiffChange::Insert,
            ),
            test_changed_cell("SM_synchronized = 0;", DiffChange::Insert),
            test_changed_cell("}", DiffChange::Insert),
            test_changed_cell("else", DiffChange::Insert),
        ];

        let alignment = align_replace_block_rows(&left_cells, &right_cells);

        assert_eq!(alignment.row_pairs[0], (None, Some(0)));
        assert_eq!(alignment.row_pairs[1], (None, Some(1)));
        assert_eq!(alignment.left_matches[0], Some(2));
        assert_eq!(alignment.left_matches[1], Some(3));
        assert_eq!(alignment.left_matches[2], Some(4));
    }

    #[test]
    fn replace_block_alignment_resyncs_same_statement_after_comment_and_helper_insertions() {
        let left_cells = vec![
            test_changed_cell("if (SM_ADC_result > SM_ADC_Threshold)", DiffChange::Delete),
            test_changed_cell("{", DiffChange::Delete),
            test_changed_cell("if (++SM_TouchBaseCount > 2)", DiffChange::Delete),
            test_changed_cell("{", DiffChange::Delete),
            test_changed_cell("SM_synchronized = 0;", DiffChange::Delete),
        ];
        let right_cells = vec![
            test_changed_cell(
                "SM_ADC_PeaksLive[peakIndex] = SM_ADC_result;",
                DiffChange::Insert,
            ),
            test_changed_cell(
                "// Runtime detection is intentionally simple again",
                DiffChange::Insert,
            ),
            test_changed_cell("if (SM_ADC_result > SM_ADC_Threshold)", DiffChange::Insert),
            test_changed_cell("{", DiffChange::Insert),
            test_changed_cell("if (++SM_TouchBaseCount > 2)", DiffChange::Insert),
            test_changed_cell("{", DiffChange::Insert),
            test_changed_cell("SM_ADC_DetectedFlag = 1;", DiffChange::Insert),
            test_changed_cell("SM_synchronized = 0;", DiffChange::Insert),
        ];

        let alignment = align_replace_block_rows(&left_cells, &right_cells);

        assert_eq!(alignment.row_pairs[0], (None, Some(0)));
        assert_eq!(alignment.row_pairs[1], (None, Some(1)));
        assert_eq!(alignment.left_matches[0], Some(2));
        assert_eq!(alignment.left_matches[1], Some(3));
        assert_eq!(alignment.left_matches[2], Some(4));
        assert_eq!(alignment.left_matches[3], Some(5));
        assert_eq!(alignment.row_pairs[6], (None, Some(6)));
        assert_eq!(alignment.left_matches[4], Some(7));
    }

    #[test]
    fn preprocessor_directives_only_pair_with_same_family() {
        assert!(pair_band(
            &build_line_descriptor("#ifdef FOO"),
            &build_line_descriptor("#endif")
        )
        .is_none());
        assert!(matches!(
            pair_band(
                &build_line_descriptor("#ifdef FOO"),
                &build_line_descriptor("#ifdef FOO")
            ),
            Some(MatchBand::StrongExact)
        ));
    }

    #[test]
    fn prose_comment_still_does_not_pair_with_code() {
        assert!(pair_band(
            &build_line_descriptor(
                "// keep logger output enabled while validating the new SM behavior"
            ),
            &build_line_descriptor("#define ULTRON_LOGGER_MODE_ACTIVE")
        )
        .is_none());
    }

    #[test]
    fn callable_signatures_do_not_pair_with_same_named_calls() {
        assert!(pair_band(
            &build_line_descriptor("static void SM_UpdateMeasurementWindow(void);"),
            &build_line_descriptor("SM_UpdateMeasurementWindow();")
        )
        .is_none());
        assert!(pair_band(
            &build_line_descriptor("static void SM_UpdateMeasurementWindow(void)"),
            &build_line_descriptor("SM_UpdateMeasurementWindow();")
        )
        .is_none());
    }

    #[test]
    fn lcs_pairs_returns_empty_when_matrix_budget_is_exceeded() {
        let left = (0..200)
            .map(|index| format!("left_{index}"))
            .collect::<Vec<_>>();
        let right = (0..200)
            .map(|index| format!("right_{index}"))
            .collect::<Vec<_>>();

        assert!(lcs_pairs(&left, &right).is_empty());
    }

    #[test]
    fn replace_block_alignment_keeps_inserted_helper_signature_from_matching_call_site() {
        let left_cells = vec![
            test_changed_cell("SM_UpdateMeasurementWindow();", DiffChange::Delete),
            test_changed_cell(
                "SM_ADC_ActiveMargin = SM_GetPeakMargin();",
                DiffChange::Delete,
            ),
        ];
        let right_cells = vec![
            test_changed_cell(
                "static void SM_UpdateMeasurementWindow(void);",
                DiffChange::Insert,
            ),
            test_changed_cell(
                "static void SM_UpdateMeasurementWindow(void)",
                DiffChange::Insert,
            ),
            test_changed_cell("{", DiffChange::Insert),
            test_changed_cell(
                "SM_ADC_ActiveMargin = SM_GetPeakMargin();",
                DiffChange::Insert,
            ),
            test_changed_cell("}", DiffChange::Insert),
            test_changed_cell("SM_UpdateMeasurementWindow();", DiffChange::Insert),
            test_changed_cell(
                "SM_ADC_ActiveMargin = SM_GetPeakMargin();",
                DiffChange::Insert,
            ),
        ];

        let alignment = align_replace_block_rows(&left_cells, &right_cells);

        assert_eq!(
            alignment.row_pairs[0],
            (None, Some(0)),
            "{:#?}",
            alignment.row_pairs
        );
        assert_eq!(
            alignment.row_pairs[1],
            (None, Some(1)),
            "{:#?}",
            alignment.row_pairs
        );
        assert_eq!(
            alignment.row_pairs[2],
            (None, Some(2)),
            "{:#?}",
            alignment.row_pairs
        );
        assert_eq!(
            alignment.row_pairs[3],
            (None, Some(3)),
            "{:#?}",
            alignment.row_pairs
        );
        assert_eq!(
            alignment.row_pairs[4],
            (None, Some(4)),
            "{:#?}",
            alignment.row_pairs
        );
        assert_eq!(alignment.left_matches[0], Some(5));
        assert_eq!(alignment.left_matches[1], Some(6));
    }

    #[test]
    fn resync_candidate_cmp_prefers_stronger_match_before_closer_gap() {
        let closer_weaker = ResyncCandidate {
            left_index: 1,
            right_index: 1,
            band: MatchBand::WeakStructural,
        };
        let farther_stronger = ResyncCandidate {
            left_index: 2,
            right_index: 3,
            band: MatchBand::StrongExact,
        };

        assert!(resync_candidate_cmp(farther_stronger, closer_weaker).is_lt());
        assert!(resync_candidate_cmp(closer_weaker, farther_stronger).is_gt());
    }

    #[test]
    fn session_state_size_validation_rejects_oversized_payloads() {
        assert!(validate_session_state_size(MAX_SESSION_STATE_BYTES).is_ok());
        assert!(validate_session_state_size(MAX_SESSION_STATE_BYTES + 1).is_err());
    }
}
