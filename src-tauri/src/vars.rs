use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, Clone)]
pub struct VarEntry {
    pub id: String,
    pub name: String,
    pub value: String,
}

fn vars_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join("vars.json")
}

fn load_all(data_dir: &Path) -> Vec<VarEntry> {
    let path = vars_path(data_dir);
    let Ok(data) = std::fs::read_to_string(&path) else {
        return vec![];
    };
    serde_json::from_str(&data).unwrap_or_default()
}

fn save_all(data_dir: &Path, vars: &[VarEntry]) -> Result<(), String> {
    let data = serde_json::to_string_pretty(vars).map_err(|e| e.to_string())?;
    std::fs::write(vars_path(data_dir), data).map_err(|e| e.to_string())
}

pub fn get_value_by_name(data_dir: &Path, name: &str) -> Option<String> {
    load_all(data_dir)
        .into_iter()
        .find(|v| v.name == name)
        .map(|v| v.value)
}

pub fn load_all_values(data_dir: &Path) -> Vec<(String, String)> {
    load_all(data_dir)
        .into_iter()
        .map(|v| (v.name, v.value))
        .collect()
}

pub fn load_all_entries(data_dir: &Path) -> Vec<VarEntry> {
    load_all(data_dir)
}

pub fn vars_file_exists(data_dir: &Path) -> bool {
    vars_path(data_dir).exists()
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_vars(data_dir: tauri::State<'_, crate::DataDir>) -> Vec<VarEntry> {
    load_all(&data_dir.0)
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_var(
    id: Option<String>,
    name: String,
    value: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<String, String> {
    let mut vars = load_all(&data_dir.0);
    if let Some(ref existing_id) = id {
        if let Some(entry) = vars.iter_mut().find(|v| v.id == *existing_id) {
            entry.name = name;
            entry.value = value;
            let ret = entry.id.clone();
            save_all(&data_dir.0, &vars)?;
            return Ok(ret);
        }
    }
    let new_id = uuid::Uuid::new_v4().to_string();
    vars.push(VarEntry { id: new_id.clone(), name, value });
    save_all(&data_dir.0, &vars)?;
    Ok(new_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_var(
    id: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<(), String> {
    let mut vars = load_all(&data_dir.0);
    vars.retain(|v| v.id != id);
    save_all(&data_dir.0, &vars)
}
