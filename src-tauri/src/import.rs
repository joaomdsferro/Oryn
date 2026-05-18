use base64::{engine::general_purpose::STANDARD as B64, Engine};
use crate::projects::EnvVariable;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Serialize)]
pub struct ImportResult {
    pub requests: usize,
    pub vars: usize,
    pub secrets: usize,
}

// ── Postman collection format ─────────────────────────────────────────────────

#[allow(dead_code)]
#[derive(Deserialize)]
struct PostmanCollection {
    info: Option<PostmanInfo>,
    auth: Option<PostmanAuth>,
    item: Option<Vec<PostmanItem>>,
    variable: Option<Vec<PostmanVariable>>,
    // environment file format
    values: Option<Vec<PostmanEnvValue>>,
}

#[allow(dead_code)]
#[derive(Deserialize)]
struct PostmanInfo {
    name: Option<String>,
}

#[derive(Deserialize)]
struct PostmanItem {
    name: Option<String>,
    request: Option<PostmanRequest>,
    item: Option<Vec<PostmanItem>>,
}

#[derive(Deserialize)]
struct PostmanRequest {
    method: Option<String>,
    header: Option<Vec<PostmanHeader>>,
    url: Option<PostmanUrl>,
    auth: Option<PostmanAuth>,
}

#[derive(Deserialize)]
struct PostmanHeader {
    key: String,
    value: String,
    disabled: Option<bool>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum PostmanUrl {
    Simple(String),
    Object {
        raw: Option<String>,
        query: Option<Vec<PostmanQuery>>,
    },
}

#[derive(Deserialize)]
struct PostmanQuery {
    key: Option<String>,
    value: Option<String>,
    disabled: Option<bool>,
}

#[derive(Deserialize)]
struct PostmanVariable {
    key: Option<String>,
    value: Option<serde_json::Value>,
    #[serde(rename = "type")]
    var_type: Option<String>,
}

#[derive(Deserialize)]
struct PostmanEnvValue {
    key: Option<String>,
    value: Option<serde_json::Value>,
    enabled: Option<bool>,
    #[serde(rename = "type")]
    var_type: Option<String>,
}

#[derive(Deserialize, Clone)]
struct PostmanAuth {
    #[serde(rename = "type")]
    auth_type: Option<String>,
    basic: Option<Vec<PostmanAuthKV>>,
    bearer: Option<Vec<PostmanAuthKV>>,
    apikey: Option<Vec<PostmanAuthKV>>,
}

#[derive(Deserialize, Clone)]
struct PostmanAuthKV {
    key: Option<String>,
    value: Option<serde_json::Value>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn is_secret_name(name: &str) -> bool {
    let l = name.to_lowercase();
    l.contains("key") || l.contains("token") || l.contains("secret")
        || l.contains("password") || l.contains("pass")
        || l.contains("auth") || l.contains("bearer")
        || l.contains("credential") || l.contains("private")
}

fn value_to_string(v: serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s,
        serde_json::Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn is_ref(s: &str) -> bool {
    s.starts_with("{{") && s.ends_with("}}")
}

fn extract_ref_name(s: &str) -> &str {
    s.trim_start_matches('{').trim_end_matches('}')
}

fn safe_name(s: &str) -> String {
    let raw: String = s
        .chars()
        .map(|c| if c.is_alphanumeric() { c.to_ascii_uppercase() } else { '_' })
        .collect();
    raw.trim_matches('_').to_string()
}

fn find_kv(params: &[PostmanAuthKV], target: &str) -> String {
    params
        .iter()
        .find(|p| p.key.as_deref() == Some(target))
        .and_then(|p| p.value.clone())
        .map(value_to_string)
        .unwrap_or_default()
}

/// If `value` is a `{{ref}}`, look it up from stored vars then secrets.
/// Returns the resolved string, or the original value if not a ref or not found.
fn resolve_ref(data_dir: &std::path::Path, value: &str) -> String {
    if !is_ref(value) {
        return value.to_string();
    }
    let name = extract_ref_name(value);
    crate::vars::get_value_by_name(data_dir, name)
        .or_else(|| crate::secrets::get_decrypted_by_name(data_dir, name))
        .unwrap_or_else(|| value.to_string())
}

fn flatten_items(items: Vec<PostmanItem>) -> Vec<(String, PostmanRequest)> {
    let mut result = Vec::new();
    for item in items {
        if let Some(children) = item.item {
            result.extend(flatten_items(children));
        } else if let Some(req) = item.request {
            result.push((item.name.unwrap_or_default(), req));
        }
    }
    result
}

/// Converts a Postman auth block into Authorization headers, storing credentials
/// as secrets. Variables are already stored at this point so refs can be resolved.
///
/// Returns (headers_to_prepend, new_secret_count).
fn apply_auth(
    auth: &PostmanAuth,
    data_dir: &std::path::Path,
    prefix: &str,
    seen: &mut HashSet<String>,
) -> Result<(Vec<[String; 2]>, usize), String> {
    let mut headers = Vec::new();
    let mut count = 0usize;
    let p = safe_name(prefix);

    match auth.auth_type.as_deref().unwrap_or("") {
        "basic" => {
            let params = auth.basic.as_deref().unwrap_or_default();
            let raw_user = find_kv(params, "username");
            let raw_pass = find_kv(params, "password");

            // Resolve refs through stored vars/secrets
            let username = resolve_ref(data_dir, &raw_user);
            let password = resolve_ref(data_dir, &raw_pass);

            // Only proceed if we have an actual password (not still a ref)
            if !password.is_empty() && !is_ref(&password) {
                let encoded = B64.encode(format!("{username}:{password}"));
                let secret_name = format!("{p}_BASIC_AUTH");
                if seen.insert(secret_name.clone()) {
                    crate::secrets::store_by_name(data_dir, &secret_name, &encoded)?;
                    count += 1;
                }
                headers.push([
                    "Authorization".to_string(),
                    format!("Basic {{{{{secret_name}}}}}"),
                ]);
            }
            // If still a ref (variable not found / empty), skip — malformed
            // Authorization headers are worse than no header at all
        }

        "bearer" => {
            let params = auth.bearer.as_deref().unwrap_or_default();
            let raw_token = find_kv(params, "token");
            let token = resolve_ref(data_dir, &raw_token);

            if !token.is_empty() {
                if is_ref(&token) {
                    // Ref exists but value wasn't found — pass it through as-is;
                    // it will be resolved at send time if the user stores the secret.
                    headers.push(["Authorization".to_string(), format!("Bearer {token}")]);
                } else {
                    let secret_name = format!("{p}_BEARER_TOKEN");
                    if seen.insert(secret_name.clone()) {
                        crate::secrets::store_by_name(data_dir, &secret_name, &token)?;
                        count += 1;
                    }
                    headers.push([
                        "Authorization".to_string(),
                        format!("Bearer {{{{{secret_name}}}}}"),
                    ]);
                }
            }
        }

        "apikey" => {
            let params = auth.apikey.as_deref().unwrap_or_default();
            let header_key = find_kv(params, "key");
            let raw_value = find_kv(params, "value");
            let location = find_kv(params, "in");
            let value = resolve_ref(data_dir, &raw_value);

            if !value.is_empty() && location.as_str() != "query" {
                let hdr = if header_key.is_empty() { "X-API-Key".to_string() } else { header_key };
                if is_ref(&value) {
                    headers.push([hdr, value]);
                } else {
                    let secret_name = format!("{p}_API_KEY");
                    if seen.insert(secret_name.clone()) {
                        crate::secrets::store_by_name(data_dir, &secret_name, &value)?;
                        count += 1;
                    }
                    headers.push([hdr, format!("{{{{{secret_name}}}}}")]);
                }
            }
        }

        _ => {}
    }

    Ok((headers, count))
}

// ── Command ───────────────────────────────────────────────────────────────────

fn collect_env_variable(
    name: &str,
    value: &str,
    var_type: Option<&str>,
    env_vars: &mut Vec<EnvVariable>,
    secrets_count: &mut usize,
    seen: &mut HashSet<String>,
    data_dir: &std::path::Path,
) -> Result<(), String> {
    if !seen.insert(name.to_string()) {
        return Ok(());
    }
    let is_secret = var_type == Some("secret") || is_secret_name(name);
    if is_secret {
        crate::secrets::store_by_name(data_dir, name, value)?;
        *secrets_count += 1;
    } else {
        env_vars.push(EnvVariable {
            name: name.to_string(),
            value: value.to_string(),
        });
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn import_collection(
    json: String,
    project_id: Option<String>,
    project_name: Option<String>,
    collection_name: Option<String>,
    data_dir: tauri::State<'_, crate::DataDir>,
) -> Result<ImportResult, String> {
    let col: PostmanCollection = serde_json::from_str(&json)
        .map_err(|e| format!("Could not parse JSON: {e}"))?;

    let mut vars_count = 0usize;
    let mut secrets_count = 0usize;
    let mut seen: HashSet<String> = HashSet::new();
    let mut env_vars: Vec<EnvVariable> = Vec::new();

    let col_name = collection_name
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            col.info
                .as_ref()
                .and_then(|i| i.name.clone())
        })
        .unwrap_or_else(|| "Imported".to_string());

    let pid = match project_id {
        Some(id) => id,
        None => {
            let name = project_name.unwrap_or_else(|| "Imported".to_string());
            crate::projects::ensure_project(&data_dir.0, &name)?
        }
    };

    let collection_id = crate::projects::ensure_collection(&data_dir.0, &pid, &col_name)?;

    // ── 1. Variables → environment (secrets stay global) ──

    for var in col.variable.unwrap_or_default() {
        let name = match var.key.filter(|k| !k.trim().is_empty()) {
            Some(k) => k,
            None => continue,
        };
        let value = var.value.map(value_to_string).unwrap_or_default();
        let before = env_vars.len();
        collect_env_variable(
            &name,
            &value,
            var.var_type.as_deref(),
            &mut env_vars,
            &mut secrets_count,
            &mut seen,
            &data_dir.0,
        )?;
        if env_vars.len() > before {
            vars_count += 1;
        }
    }

    for val in col.values.unwrap_or_default() {
        if val.enabled == Some(false) {
            continue;
        }
        let name = match val.key.filter(|k| !k.trim().is_empty()) {
            Some(k) => k,
            None => continue,
        };
        let value = val.value.map(value_to_string).unwrap_or_default();
        let before = env_vars.len();
        collect_env_variable(
            &name,
            &value,
            val.var_type.as_deref(),
            &mut env_vars,
            &mut secrets_count,
            &mut seen,
            &data_dir.0,
        )?;
        if env_vars.len() > before {
            vars_count += 1;
        }
    }

    if !env_vars.is_empty() {
        let _ = crate::projects::create_environment_with_vars(
            &data_dir.0,
            &pid,
            "Imported",
            env_vars,
        );
    }

    // ── 2. Collection-level auth (now vars are stored and can be resolved) ──

    let (col_auth_headers, col_auth_secrets) = match col.auth.as_ref() {
        Some(auth) => apply_auth(auth, &data_dir.0, &col_name, &mut seen)?,
        None => (vec![], 0),
    };
    secrets_count += col_auth_secrets;

    // ── 3. Requests ──────────────────────────────────────────────────────────

    let requests = flatten_items(col.item.unwrap_or_default());
    let requests_count = requests.len();

    for (name, req) in requests {
        let method = req.method.unwrap_or_else(|| "GET".to_string()).to_uppercase();

        let (url, params) = match req.url {
            None => (String::new(), vec![]),
            Some(PostmanUrl::Simple(raw)) => {
                (raw.split('?').next().unwrap_or("").to_string(), vec![])
            }
            Some(PostmanUrl::Object { raw, query }) => {
                let base = raw
                    .unwrap_or_default()
                    .split('?')
                    .next()
                    .unwrap_or("")
                    .to_string();
                let params: Vec<[String; 2]> = query
                    .unwrap_or_default()
                    .into_iter()
                    .filter(|q| q.disabled != Some(true))
                    .filter_map(|q| {
                        let k = q.key?.trim().to_string();
                        if k.is_empty() {
                            return None;
                        }
                        Some([k, q.value.unwrap_or_default()])
                    })
                    .collect();
                (base, params)
            }
        };

        // Request-level auth overrides collection auth; absent = inherit
        let (req_auth_headers, req_auth_secrets) = match req.auth.as_ref() {
            Some(auth) => apply_auth(auth, &data_dir.0, &name, &mut seen)?,
            None => (col_auth_headers.clone(), 0),
        };
        secrets_count += req_auth_secrets;

        let explicit_headers: Vec<[String; 2]> = req
            .header
            .unwrap_or_default()
            .into_iter()
            .filter(|h| h.disabled != Some(true) && !h.key.is_empty())
            .map(|h| [h.key, h.value])
            .collect();

        // Auth headers first, then explicit headers (explicit overrides on collision)
        let mut headers = req_auth_headers;
        headers.extend(explicit_headers);

        crate::projects::store_request_in_collection(
            &data_dir.0,
            &pid,
            &collection_id,
            &name,
            &method,
            &url,
            params,
            headers,
        )?;
    }

    Ok(ImportResult {
        requests: requests_count,
        vars: vars_count,
        secrets: secrets_count,
    })
}
