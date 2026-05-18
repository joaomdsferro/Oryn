use serde::{Deserialize, Serialize};
use std::path::Path;

const MAX_GLOBAL_HISTORY: usize = 20;
const MAX_PROJECT_HISTORY: usize = 10;

#[derive(Serialize, Deserialize, Clone)]
pub struct HistoryEntry {
    pub id: String,
    pub method: String,
    pub url: String,
    pub params: Vec<[String; 2]>,
    pub headers: Vec<[String; 2]>,
    #[serde(default)]
    pub body: Option<String>,
    pub response: crate::HttpResponse,
    pub sent_at: String,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub project_name: Option<String>,
    #[serde(default)]
    pub collection_id: Option<String>,
    #[serde(default)]
    pub request_id: Option<String>,
    #[serde(default)]
    pub request_name: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct HistoryMeta {
    pub id: String,
    pub method: String,
    pub url: String,
    pub sent_at: String,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub project_name: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
struct HistoryStore {
    entries: Vec<HistoryEntry>,
}

fn global_store_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join("history.json")
}

fn project_store_path(data_dir: &Path, project_id: &str) -> std::path::PathBuf {
    data_dir
        .join("projects")
        .join(project_id)
        .join("history.json")
}

fn load_global_store(data_dir: &Path) -> Result<HistoryStore, String> {
    let path = global_store_path(data_dir);
    if !path.exists() {
        return Ok(HistoryStore::default());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn save_global_store(data_dir: &Path, store: &HistoryStore) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    std::fs::write(global_store_path(data_dir), raw).map_err(|e| e.to_string())
}

fn load_project_store(data_dir: &Path, project_id: &str) -> Result<HistoryStore, String> {
    let path = project_store_path(data_dir, project_id);
    if !path.exists() {
        return Ok(HistoryStore::default());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn save_project_store(data_dir: &Path, project_id: &str, store: &HistoryStore) -> Result<(), String> {
    let path = project_store_path(data_dir, project_id);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| e.to_string())
}

pub fn push(data_dir: &Path, entry: HistoryEntry) -> Result<(), String> {
    let mut global = load_global_store(data_dir)?;
    global.entries.insert(0, entry.clone());
    global.entries.truncate(MAX_GLOBAL_HISTORY);
    save_global_store(data_dir, &global)?;

    if let Some(project_id) = entry.project_id.clone() {
        let mut project_store = load_project_store(data_dir, &project_id)?;
        project_store.entries.insert(0, entry);
        project_store.entries.truncate(MAX_PROJECT_HISTORY);
        save_project_store(data_dir, &project_id, &project_store)?;
    }

    Ok(())
}

fn entry_to_meta(e: &HistoryEntry) -> HistoryMeta {
    HistoryMeta {
        id: e.id.clone(),
        method: e.method.clone(),
        url: e.url.clone(),
        sent_at: e.sent_at.clone(),
        project_id: e.project_id.clone(),
        project_name: e.project_name.clone(),
    }
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_history(
    project_only: Option<bool>,
    project_id: Option<String>,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<Vec<HistoryMeta>, String> {
    if project_only == Some(true) {
        let pid = project_id.ok_or_else(|| "project_id required".to_string())?;
        let store = load_project_store(&data_dir.0, &pid)?;
        return Ok(store.entries.iter().map(entry_to_meta).collect());
    }
    let store = load_global_store(&data_dir.0)?;
    Ok(store.entries.iter().map(entry_to_meta).collect())
}

#[tauri::command(rename_all = "snake_case")]
pub fn load_history_entry(
    id: String,
    project_only: Option<bool>,
    project_id: Option<String>,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<HistoryEntry, String> {
    if project_only == Some(true) {
        let pid = project_id.ok_or_else(|| "project_id required".to_string())?;
        let store = load_project_store(&data_dir.0, &pid)?;
        return store
            .entries
            .into_iter()
            .find(|e| e.id == id)
            .ok_or_else(|| "History entry not found".to_string());
    }
    let store = load_global_store(&data_dir.0)?;
    store
        .entries
        .into_iter()
        .find(|e| e.id == id)
        .ok_or_else(|| "History entry not found".to_string())
}
