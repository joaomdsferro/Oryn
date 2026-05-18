use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, Clone)]
pub struct SecretMeta {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub project_id: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct SecretFull {
    pub id: String,
    pub name: String,
    pub value: String,
}

#[derive(Serialize, Deserialize)]
struct SecretEntry {
    id: String,
    name: String,
    encrypted_value: String,
    nonce: String,
    #[serde(default)]
    project_id: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
struct SecretsStore {
    secrets: Vec<SecretEntry>,
}

fn key_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join(".key")
}

fn store_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join("secrets.json")
}

pub fn load_or_create_key(data_dir: &Path) -> Result<Vec<u8>, String> {
    let path = key_path(data_dir);
    if path.exists() {
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        if bytes.len() == 32 {
            return Ok(bytes);
        }
    }
    let key = Aes256Gcm::generate_key(OsRng);
    let key_bytes = key.to_vec();
    std::fs::write(&path, &key_bytes).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(key_bytes)
}

fn encrypt(key: &[u8], plaintext: &str) -> Result<(String, String), String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let nonce = Aes256Gcm::generate_nonce(OsRng);
    let encrypted = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok((B64.encode(&encrypted), B64.encode(nonce.as_slice())))
}

fn decrypt(key: &[u8], encrypted_b64: &str, nonce_b64: &str) -> Result<String, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let encrypted = B64.decode(encrypted_b64).map_err(|e| e.to_string())?;
    let nonce_bytes = B64.decode(nonce_b64).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, encrypted.as_slice())
        .map_err(|e| e.to_string())?;
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}

fn load_store(data_dir: &Path) -> Result<SecretsStore, String> {
    let path = store_path(data_dir);
    if !path.exists() {
        return Ok(SecretsStore::default());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn save_store(data_dir: &Path, store: &SecretsStore) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    std::fs::write(store_path(data_dir), raw).map_err(|e| e.to_string())
}

pub fn get_decrypted_by_name(data_dir: &Path, name: &str) -> Option<String> {
    let key = load_or_create_key(data_dir).ok()?;
    let store = load_store(data_dir).ok()?;
    let entry = store
        .secrets
        .iter()
        .find(|s| s.name == name && s.project_id.is_none())?;
    decrypt(&key, &entry.encrypted_value, &entry.nonce).ok()
}

pub fn store_by_name(data_dir: &Path, name: &str, value: &str) -> Result<(), String> {
    let key = load_or_create_key(data_dir)?;
    let (encrypted_value, nonce) = encrypt(&key, value)?;
    let mut store = load_store(data_dir)?;
    if let Some(entry) = store.secrets.iter_mut().find(|s| s.name == name) {
        entry.encrypted_value = encrypted_value;
        entry.nonce = nonce;
    } else {
        let new_id = uuid::Uuid::new_v4().to_string();
        store.secrets.push(SecretEntry {
            id: new_id,
            name: name.to_string(),
            encrypted_value,
            nonce,
            project_id: None,
        });
    }
    save_store(data_dir, &store)
}

fn decrypt_entries(
    store: &SecretsStore,
    key: &[u8],
    project_id_filter: Option<Option<&str>>,
) -> Result<Vec<(String, String)>, String> {
    store
        .secrets
        .iter()
        .filter(|s| match project_id_filter {
            Some(None) => s.project_id.is_none(),
            Some(Some(pid)) => s.project_id.as_deref() == Some(pid),
            None => true,
        })
        .map(|s| {
            let value = decrypt(key, &s.encrypted_value, &s.nonce)?;
            Ok((s.name.clone(), value))
        })
        .collect()
}

pub fn load_global_decrypted(data_dir: &Path) -> Result<Vec<(String, String)>, String> {
    let key = load_or_create_key(data_dir)?;
    let store = load_store(data_dir)?;
    decrypt_entries(&store, &key, Some(None))
}

pub fn load_for_project(data_dir: &Path, project_id: &str) -> Result<Vec<(String, String)>, String> {
    let key = load_or_create_key(data_dir)?;
    let store = load_store(data_dir)?;
    decrypt_entries(&store, &key, Some(Some(project_id)))
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_secrets(
    project_id: Option<String>,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<Vec<SecretMeta>, String> {
    let store = load_store(&data_dir.0)?;
    Ok(store
        .secrets
        .iter()
        .filter(|s| match project_id.as_deref() {
            None => s.project_id.is_none(),
            Some(pid) => s.project_id.as_deref() == Some(pid),
        })
        .map(|s| SecretMeta {
            id: s.id.clone(),
            name: s.name.clone(),
            project_id: s.project_id.clone(),
        })
        .collect())
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_secret(
    id: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<SecretFull, String> {
    let key = load_or_create_key(&data_dir.0)?;
    let store = load_store(&data_dir.0)?;
    let entry = store
        .secrets
        .iter()
        .find(|s| s.id == id)
        .ok_or_else(|| "Secret not found".to_string())?;
    let value = decrypt(&key, &entry.encrypted_value, &entry.nonce)?;
    Ok(SecretFull { id: entry.id.clone(), name: entry.name.clone(), value })
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_secret(
    id: Option<String>,
    name: String,
    value: String,
    project_id: Option<String>,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<String, String> {
    let key = load_or_create_key(&data_dir.0)?;
    let (encrypted_value, nonce) = encrypt(&key, &value)?;
    let mut store = load_store(&data_dir.0)?;
    if let Some(ref existing_id) = id {
        if let Some(entry) = store.secrets.iter_mut().find(|s| s.id == *existing_id) {
            entry.name = name;
            entry.encrypted_value = encrypted_value;
            entry.nonce = nonce;
            entry.project_id = project_id;
            let ret_id = entry.id.clone();
            save_store(&data_dir.0, &store)?;
            return Ok(ret_id);
        }
    }
    let new_id = uuid::Uuid::new_v4().to_string();
    store.secrets.push(SecretEntry {
        id: new_id.clone(),
        name,
        encrypted_value,
        nonce,
        project_id,
    });
    save_store(&data_dir.0, &store)?;
    Ok(new_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_secret(
    id: String,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<(), String> {
    let mut store = load_store(&data_dir.0)?;
    store.secrets.retain(|s| s.id != id);
    save_store(&data_dir.0, &store)
}
