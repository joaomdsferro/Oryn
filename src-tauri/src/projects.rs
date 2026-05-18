use crate::saved::SavedRequest;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const DEFAULT_PROJECT_NAME: &str = "Default";
const DEFAULT_COLLECTION_NAME: &str = "Imported";
const DEFAULT_ENV_NAME: &str = "Default";

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct ProjectMeta {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct ProjectIndex {
    pub projects: Vec<ProjectMeta>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct ProjectMetaFile {
    #[serde(default)]
    active_environment_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CollectionFile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub sort_order: i32,
    pub requests: Vec<SavedRequest>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CollectionMeta {
    pub id: String,
    pub name: String,
    pub request_count: usize,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct EnvVariable {
    pub name: String,
    pub value: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct EnvironmentFile {
    pub id: String,
    pub name: String,
    pub variables: Vec<EnvVariable>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct EnvironmentMeta {
    pub id: String,
    pub name: String,
    pub variable_count: usize,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct AppContext {
    #[serde(default)]
    pub active_project_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ActiveContext {
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub environment_id: Option<String>,
    pub environment_name: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RequestMeta {
    pub id: String,
    pub collection_id: String,
    pub name: String,
    pub method: String,
    pub url: String,
    pub saved_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CollectionTree {
    pub id: String,
    pub name: String,
    pub requests: Vec<RequestMeta>,
}

// ── Paths ─────────────────────────────────────────────────────────────────────

fn projects_root(data_dir: &Path) -> PathBuf {
    data_dir.join("projects")
}

fn index_path(data_dir: &Path) -> PathBuf {
    projects_root(data_dir).join("index.json")
}

fn app_context_path(data_dir: &Path) -> PathBuf {
    data_dir.join("app_context.json")
}

fn project_dir(data_dir: &Path, project_id: &str) -> PathBuf {
    projects_root(data_dir).join(project_id)
}

fn project_meta_path(data_dir: &Path, project_id: &str) -> PathBuf {
    project_dir(data_dir, project_id).join("meta.json")
}

fn collections_dir(data_dir: &Path, project_id: &str) -> PathBuf {
    project_dir(data_dir, project_id).join("collections")
}

fn environments_dir(data_dir: &Path, project_id: &str) -> PathBuf {
    project_dir(data_dir, project_id).join("environments")
}

fn collection_path(data_dir: &Path, project_id: &str, collection_id: &str) -> PathBuf {
    collections_dir(data_dir, project_id).join(format!("{collection_id}.json"))
}

fn environment_path(data_dir: &Path, project_id: &str, env_id: &str) -> PathBuf {
    environments_dir(data_dir, project_id).join(format!("{env_id}.json"))
}

fn legacy_saved_path(data_dir: &Path) -> PathBuf {
    data_dir.join("saved.json")
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

// ── IO helpers ────────────────────────────────────────────────────────────────

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| e.to_string())
}

fn load_index(data_dir: &Path) -> Result<ProjectIndex, String> {
    let path = index_path(data_dir);
    if !path.exists() {
        return Ok(ProjectIndex::default());
    }
    read_json(&path)
}

fn save_index(data_dir: &Path, index: &ProjectIndex) -> Result<(), String> {
    std::fs::create_dir_all(projects_root(data_dir)).map_err(|e| e.to_string())?;
    write_json(&index_path(data_dir), index)
}

fn load_app_context(data_dir: &Path) -> AppContext {
    let path = app_context_path(data_dir);
    if !path.exists() {
        return AppContext::default();
    }
    read_json(&path).unwrap_or_default()
}

fn save_app_context(data_dir: &Path, ctx: &AppContext) -> Result<(), String> {
    write_json(&app_context_path(data_dir), ctx)
}

fn load_project_meta_file(data_dir: &Path, project_id: &str) -> ProjectMetaFile {
    let path = project_meta_path(data_dir, project_id);
    if !path.exists() {
        return ProjectMetaFile::default();
    }
    read_json(&path).unwrap_or_default()
}

fn save_project_meta_file(data_dir: &Path, project_id: &str, meta: &ProjectMetaFile) -> Result<(), String> {
    write_json(&project_meta_path(data_dir, project_id), meta)
}

fn touch_project(data_dir: &Path, project_id: &str) -> Result<(), String> {
    let mut index = load_index(data_dir)?;
    if let Some(p) = index.projects.iter_mut().find(|p| p.id == project_id) {
        p.updated_at = now_iso();
        save_index(data_dir, &index)?;
    }
    Ok(())
}

fn find_project_name(data_dir: &Path, project_id: &str) -> Option<String> {
    load_index(data_dir)
        .ok()?
        .projects
        .into_iter()
        .find(|p| p.id == project_id)
        .map(|p| p.name)
}

fn find_environment_name(data_dir: &Path, project_id: &str, env_id: &str) -> Option<String> {
    load_environment(data_dir, project_id, env_id)
        .ok()
        .map(|e| e.name)
}

fn load_collection(data_dir: &Path, project_id: &str, collection_id: &str) -> Result<CollectionFile, String> {
    read_json(&collection_path(data_dir, project_id, collection_id))
}

fn save_collection(data_dir: &Path, project_id: &str, col: &CollectionFile) -> Result<(), String> {
    write_json(&collection_path(data_dir, project_id, &col.id), col)
}

fn load_environment(data_dir: &Path, project_id: &str, env_id: &str) -> Result<EnvironmentFile, String> {
    read_json(&environment_path(data_dir, project_id, env_id))
}

fn save_environment(data_dir: &Path, project_id: &str, env: &EnvironmentFile) -> Result<(), String> {
    write_json(&environment_path(data_dir, project_id, &env.id), env)
}

// ── Migration ─────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct LegacySavedStore {
    requests: Vec<SavedRequest>,
}

pub fn ensure_migrated(data_dir: &Path) -> Result<(), String> {
    let index_path = index_path(data_dir);
    if index_path.exists() {
        return Ok(());
    }
    let legacy_path = legacy_saved_path(data_dir);
    if legacy_path.exists() || crate::vars::vars_file_exists(data_dir) {
        migrate_legacy_data(data_dir)?;
    }
    Ok(())
}

pub fn migrate_legacy_data(data_dir: &Path) -> Result<(), String> {
    if index_path(data_dir).exists() {
        return Ok(());
    }

    let project_id = uuid::Uuid::new_v4().to_string();
    let collection_id = uuid::Uuid::new_v4().to_string();
    let env_id = uuid::Uuid::new_v4().to_string();
    let ts = now_iso();

    std::fs::create_dir_all(collections_dir(data_dir, &project_id)).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(environments_dir(data_dir, &project_id)).map_err(|e| e.to_string())?;

    let mut requests = Vec::new();
    let legacy_path = legacy_saved_path(data_dir);
    if legacy_path.exists() {
        if let Ok(raw) = std::fs::read_to_string(&legacy_path) {
            if let Ok(store) = serde_json::from_str::<LegacySavedStore>(&raw) {
                requests = store.requests;
            }
        }
        let backup = data_dir.join("saved.json.bak");
        let _ = std::fs::rename(&legacy_path, &backup);
    }

    let env_vars: Vec<EnvVariable> = crate::vars::load_all_entries(data_dir)
        .into_iter()
        .map(|v| EnvVariable { name: v.name, value: v.value })
        .collect();

    save_environment(
        data_dir,
        &project_id,
        &EnvironmentFile {
            id: env_id.clone(),
            name: DEFAULT_ENV_NAME.to_string(),
            variables: env_vars,
        },
    )?;

    save_collection(
        data_dir,
        &project_id,
        &CollectionFile {
            id: collection_id.clone(),
            name: DEFAULT_COLLECTION_NAME.to_string(),
            sort_order: 0,
            requests,
        },
    )?;

    save_project_meta_file(
        data_dir,
        &project_id,
        &ProjectMetaFile {
            active_environment_id: Some(env_id.clone()),
        },
    )?;

    let index = ProjectIndex {
        projects: vec![ProjectMeta {
            id: project_id.clone(),
            name: DEFAULT_PROJECT_NAME.to_string(),
            created_at: ts.clone(),
            updated_at: ts,
        }],
    };
    save_index(data_dir, &index)?;

    save_app_context(
        data_dir,
        &AppContext {
            active_project_id: Some(project_id),
        },
    )?;

    Ok(())
}

// ── Variable resolution ───────────────────────────────────────────────────────

pub fn resolve_placeholders(
    data_dir: &Path,
    project_id: Option<&str>,
    environment_id: Option<&str>,
) -> Result<Vec<(String, String)>, String> {
    let mut values = crate::vars::load_all_values(data_dir);

    if let (Some(pid), Some(eid)) = (project_id, environment_id) {
        if let Ok(env) = load_environment(data_dir, pid, eid) {
            for v in env.variables {
                if let Some(entry) = values.iter_mut().find(|(n, _)| n == &v.name) {
                    entry.1 = v.value;
                } else {
                    values.push((v.name, v.value));
                }
            }
        }
    }

    let project_secrets = if let Some(pid) = project_id {
        crate::secrets::load_for_project(data_dir, pid)?
    } else {
        vec![]
    };
    let global_secrets = crate::secrets::load_global_decrypted(data_dir)?;

    for (name, value) in project_secrets {
        if let Some(entry) = values.iter_mut().find(|(n, _)| n == &name) {
            entry.1 = value;
        } else {
            values.push((name, value));
        }
    }
    for (name, value) in global_secrets {
        if let Some(entry) = values.iter_mut().find(|(n, _)| n == &name) {
            entry.1 = value;
        } else {
            values.push((name, value));
        }
    }

    Ok(values)
}

// ── Project CRUD ──────────────────────────────────────────────────────────────

pub fn list_projects_inner(data_dir: &Path) -> Result<Vec<ProjectMeta>, String> {
    ensure_migrated(data_dir)?;
    Ok(load_index(data_dir)?.projects)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_projects(data_dir: tauri::State<'_, crate::DataDir>) -> Result<Vec<ProjectMeta>, String> {
    list_projects_inner(&data_dir.0)
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_project(
    name: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<ProjectMeta, String> {
    ensure_migrated(&data_dir.0)?;
    let id = uuid::Uuid::new_v4().to_string();
    let ts = now_iso();
    std::fs::create_dir_all(collections_dir(&data_dir.0, &id)).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(environments_dir(&data_dir.0, &id)).map_err(|e| e.to_string())?;
    save_project_meta_file(&data_dir.0, &id, &ProjectMetaFile::default())?;

    let default_col_id = uuid::Uuid::new_v4().to_string();
    save_collection(
        &data_dir.0,
        &id,
        &CollectionFile {
            id: default_col_id,
            name: "General".to_string(),
            sort_order: 0,
            requests: vec![],
        },
    )?;

    let meta = ProjectMeta {
        id: id.clone(),
        name: name.trim().to_string(),
        created_at: ts.clone(),
        updated_at: ts,
    };
    let mut index = load_index(&data_dir.0)?;
    index.projects.push(meta.clone());
    save_index(&data_dir.0, &index)?;
    Ok(meta)
}

#[tauri::command(rename_all = "snake_case")]
pub fn rename_project(
    project_id: String,
    name: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<(), String> {
    let mut index = load_index(&data_dir.0)?;
    let entry = index
        .projects
        .iter_mut()
        .find(|p| p.id == project_id)
        .ok_or_else(|| "Project not found".to_string())?;
    entry.name = name.trim().to_string();
    entry.updated_at = now_iso();
    save_index(&data_dir.0, &index)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_project(
    project_id: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<(), String> {
    let mut index = load_index(&data_dir.0)?;
    index.projects.retain(|p| p.id != project_id);
    save_index(&data_dir.0, &index)?;
    let dir = project_dir(&data_dir.0, &project_id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    let mut ctx = load_app_context(&data_dir.0);
    if ctx.active_project_id.as_deref() == Some(project_id.as_str()) {
        ctx.active_project_id = index.projects.first().map(|p| p.id.clone());
        save_app_context(&data_dir.0, &ctx)?;
    }
    Ok(())
}

// ── Active context ────────────────────────────────────────────────────────────

#[tauri::command(rename_all = "snake_case")]
pub fn get_active_context(data_dir: tauri::State<'_, crate::DataDir>) -> Result<ActiveContext, String> {
    ensure_migrated(&data_dir.0)?;
    let ctx = load_app_context(&data_dir.0);
    let project_id = ctx.active_project_id.clone();
    let project_name = project_id
        .as_ref()
        .and_then(|id| find_project_name(&data_dir.0, id));
    let (environment_id, environment_name) = match project_id.as_ref() {
        Some(pid) => {
            let meta = load_project_meta_file(&data_dir.0, pid);
            let eid = meta.active_environment_id.clone();
            let ename = eid
                .as_ref()
                .and_then(|id| find_environment_name(&data_dir.0, pid, id));
            (eid, ename)
        }
        None => (None, None),
    };
    Ok(ActiveContext {
        project_id,
        project_name,
        environment_id,
        environment_name,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_active_context(
    project_id: Option<String>,
    environment_id: Option<String>,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<ActiveContext, String> {
    ensure_migrated(&data_dir.0)?;
    if let Some(ref pid) = project_id {
        let index = load_index(&data_dir.0)?;
        if !index.projects.iter().any(|p| p.id == *pid) {
            return Err("Project not found".to_string());
        }
        if let Some(ref eid) = environment_id {
            let path = environment_path(&data_dir.0, pid, eid);
            if !path.exists() {
                return Err("Environment not found".to_string());
            }
        }
        let mut meta = load_project_meta_file(&data_dir.0, pid);
        meta.active_environment_id = environment_id.clone();
        save_project_meta_file(&data_dir.0, pid, &meta)?;
    }
    let mut ctx = load_app_context(&data_dir.0);
    ctx.active_project_id = project_id;
    save_app_context(&data_dir.0, &ctx)?;
    get_active_context(data_dir)
}

// ── Collection CRUD ───────────────────────────────────────────────────────────

fn list_collections_inner(data_dir: &Path, project_id: &str) -> Result<Vec<CollectionMeta>, String> {
    let dir = collections_dir(data_dir, project_id);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let col: CollectionFile = read_json(&path)?;
        out.push(CollectionMeta {
            id: col.id,
            name: col.name,
            request_count: col.requests.len(),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_collections(
    project_id: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<Vec<CollectionMeta>, String> {
    ensure_migrated(&data_dir.0)?;
    list_collections_inner(&data_dir.0, &project_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_collection_tree(
    project_id: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<Vec<CollectionTree>, String> {
    let collections = list_collections_inner(&data_dir.0, &project_id)?;
    let mut trees = Vec::new();
    for col in collections {
        let file = load_collection(&data_dir.0, &project_id, &col.id)?;
        trees.push(CollectionTree {
            id: col.id.clone(),
            name: col.name,
            requests: file
                .requests
                .iter()
                .map(|r| RequestMeta {
                    id: r.id.clone(),
                    collection_id: col.id.clone(),
                    name: r.name.clone(),
                    method: r.method.clone(),
                    url: r.url.clone(),
                    saved_at: r.saved_at.clone(),
                })
                .collect(),
        });
    }
    Ok(trees)
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_collection(
    project_id: String,
    name: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<CollectionMeta, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let col = CollectionFile {
        id: id.clone(),
        name: name.trim().to_string(),
        sort_order: 0,
        requests: vec![],
    };
    save_collection(&data_dir.0, &project_id, &col)?;
    touch_project(&data_dir.0, &project_id)?;
    Ok(CollectionMeta {
        id,
        name: col.name,
        request_count: 0,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn rename_collection(
    project_id: String,
    collection_id: String,
    name: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<(), String> {
    let mut col = load_collection(&data_dir.0, &project_id, &collection_id)?;
    col.name = name.trim().to_string();
    save_collection(&data_dir.0, &project_id, &col)?;
    touch_project(&data_dir.0, &project_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_collection(
    project_id: String,
    collection_id: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<(), String> {
    let path = collection_path(&data_dir.0, &project_id, &collection_id);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    touch_project(&data_dir.0, &project_id)
}

// ── Environment CRUD ──────────────────────────────────────────────────────────

#[tauri::command(rename_all = "snake_case")]
pub fn list_environments(
    project_id: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<Vec<EnvironmentMeta>, String> {
    ensure_migrated(&data_dir.0)?;
    let dir = environments_dir(&data_dir.0, &project_id);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let env: EnvironmentFile = read_json(&path)?;
        out.push(EnvironmentMeta {
            id: env.id,
            name: env.name,
            variable_count: env.variables.len(),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
pub fn load_environment_cmd(
    project_id: String,
    environment_id: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<EnvironmentFile, String> {
    load_environment(&data_dir.0, &project_id, &environment_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_environment(
    project_id: String,
    name: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<EnvironmentMeta, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let env = EnvironmentFile {
        id: id.clone(),
        name: name.trim().to_string(),
        variables: vec![],
    };
    save_environment(&data_dir.0, &project_id, &env)?;
    touch_project(&data_dir.0, &project_id)?;
    Ok(EnvironmentMeta {
        id,
        name: env.name,
        variable_count: 0,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn rename_environment(
    project_id: String,
    environment_id: String,
    name: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<(), String> {
    let mut env = load_environment(&data_dir.0, &project_id, &environment_id)?;
    env.name = name.trim().to_string();
    save_environment(&data_dir.0, &project_id, &env)?;
    touch_project(&data_dir.0, &project_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_environment(
    project_id: String,
    environment_id: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<(), String> {
    let path = environment_path(&data_dir.0, &project_id, &environment_id);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    let mut meta = load_project_meta_file(&data_dir.0, &project_id);
    if meta.active_environment_id.as_deref() == Some(environment_id.as_str()) {
        meta.active_environment_id = None;
        save_project_meta_file(&data_dir.0, &project_id, &meta)?;
    }
    touch_project(&data_dir.0, &project_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn duplicate_environment(
    project_id: String,
    environment_id: String,
    new_name: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<EnvironmentMeta, String> {
    let src = load_environment(&data_dir.0, &project_id, &environment_id)?;
    let id = uuid::Uuid::new_v4().to_string();
    let env = EnvironmentFile {
        id: id.clone(),
        name: new_name.trim().to_string(),
        variables: src.variables,
    };
    save_environment(&data_dir.0, &project_id, &env)?;
    touch_project(&data_dir.0, &project_id)?;
    Ok(EnvironmentMeta {
        id,
        name: env.name,
        variable_count: env.variables.len(),
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_environment_variables(
    project_id: String,
    environment_id: String,
    variables: Vec<EnvVariable>,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<(), String> {
    let mut env = load_environment(&data_dir.0, &project_id, &environment_id)?;
    env.variables = variables;
    save_environment(&data_dir.0, &project_id, &env)?;
    touch_project(&data_dir.0, &project_id)
}

// ── Request CRUD (project-scoped) ─────────────────────────────────────────────

fn default_protocol() -> String {
    "rest".to_string()
}
fn default_body_mode() -> String {
    "none".to_string()
}

#[tauri::command(rename_all = "snake_case")]
pub fn save_request(
    project_id: String,
    collection_id: String,
    name: String,
    protocol: String,
    method: String,
    url: String,
    params: Vec<[String; 2]>,
    headers: Vec<[String; 2]>,
    body: Option<String>,
    body_mode: String,
    graphql_query: String,
    graphql_variables: String,
    response: Option<crate::HttpResponse>,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<String, String> {
    let mut col = load_collection(&data_dir.0, &project_id, &collection_id)?;
    let id = uuid::Uuid::new_v4().to_string();
    col.requests.push(SavedRequest {
        id: id.clone(),
        name,
        protocol,
        method,
        url,
        params,
        headers,
        body,
        body_mode,
        graphql_query,
        graphql_variables,
        response,
        saved_at: now_iso(),
    });
    save_collection(&data_dir.0, &project_id, &col)?;
    touch_project(&data_dir.0, &project_id)?;
    Ok(id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn load_saved(
    project_id: String,
    collection_id: String,
    id: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<SavedRequest, String> {
    let col = load_collection(&data_dir.0, &project_id, &collection_id)?;
    col.requests
        .into_iter()
        .find(|r| r.id == id)
        .ok_or_else(|| "Saved request not found".to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_saved(
    project_id: String,
    collection_id: String,
    id: String,
    protocol: String,
    method: String,
    url: String,
    params: Vec<[String; 2]>,
    headers: Vec<[String; 2]>,
    body: Option<String>,
    body_mode: String,
    graphql_query: String,
    graphql_variables: String,
    response: Option<crate::HttpResponse>,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<(), String> {
    let mut col = load_collection(&data_dir.0, &project_id, &collection_id)?;
    let entry = col
        .requests
        .iter_mut()
        .find(|r| r.id == id)
        .ok_or_else(|| "Saved request not found".to_string())?;
    entry.protocol = protocol;
    entry.method = method;
    entry.url = url;
    entry.params = params;
    entry.headers = headers;
    entry.body = body;
    entry.body_mode = body_mode;
    entry.graphql_query = graphql_query;
    entry.graphql_variables = graphql_variables;
    entry.response = response;
    entry.saved_at = now_iso();
    save_collection(&data_dir.0, &project_id, &col)?;
    touch_project(&data_dir.0, &project_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_saved(
    project_id: String,
    collection_id: String,
    id: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<(), String> {
    let mut col = load_collection(&data_dir.0, &project_id, &collection_id)?;
    col.requests.retain(|r| r.id != id);
    save_collection(&data_dir.0, &project_id, &col)?;
    touch_project(&data_dir.0, &project_id)
}

// ── Import helpers (non-command) ──────────────────────────────────────────────

pub fn store_request_in_collection(
    data_dir: &Path,
    project_id: &str,
    collection_id: &str,
    name: &str,
    method: &str,
    url: &str,
    params: Vec<[String; 2]>,
    headers: Vec<[String; 2]>,
) -> Result<(), String> {
    let mut col = load_collection(data_dir, project_id, collection_id)?;
    col.requests.push(SavedRequest {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        protocol: default_protocol(),
        method: method.to_string(),
        url: url.to_string(),
        params,
        headers,
        body: None,
        body_mode: default_body_mode(),
        graphql_query: String::new(),
        graphql_variables: String::new(),
        response: None,
        saved_at: now_iso(),
    });
    save_collection(data_dir, project_id, &col)?;
    touch_project(data_dir, project_id)
}

pub fn create_environment_with_vars(
    data_dir: &Path,
    project_id: &str,
    name: &str,
    variables: Vec<EnvVariable>,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    save_environment(
        data_dir,
        project_id,
        &EnvironmentFile {
            id: id.clone(),
            name: name.to_string(),
            variables,
        },
    )?;
    touch_project(data_dir, project_id)?;
    Ok(id)
}

pub fn ensure_collection(
    data_dir: &Path,
    project_id: &str,
    name: &str,
) -> Result<String, String> {
    let dir = collections_dir(data_dir, project_id);
    if dir.exists() {
        for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                let col: CollectionFile = read_json(&path)?;
                if col.name == name {
                    return Ok(col.id);
                }
            }
        }
    } else {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    let id = uuid::Uuid::new_v4().to_string();
    save_collection(
        data_dir,
        project_id,
        &CollectionFile {
            id: id.clone(),
            name: name.to_string(),
            sort_order: 0,
            requests: vec![],
        },
    )?;
    Ok(id)
}

pub fn ensure_project(data_dir: &Path, name: &str) -> Result<String, String> {
    ensure_migrated(data_dir)?;
    let index = load_index(data_dir)?;
    if let Some(p) = index.projects.iter().find(|p| p.name == name) {
        return Ok(p.id.clone());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let ts = now_iso();
    std::fs::create_dir_all(collections_dir(data_dir, &id)).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(environments_dir(data_dir, &id)).map_err(|e| e.to_string())?;
    save_project_meta_file(data_dir, &id, &ProjectMetaFile::default())?;
    let mut index = load_index(data_dir)?;
    index.projects.push(ProjectMeta {
        id: id.clone(),
        name: name.to_string(),
        created_at: ts.clone(),
        updated_at: ts,
    });
    save_index(data_dir, &index)?;
    Ok(id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn migrate_legacy_data_cmd(data_dir: tauri::State<'_, crate::DataDir>) -> Result<(), String> {
    migrate_legacy_data(&data_dir.0)
}
