use std::{path::PathBuf, time::Instant};
use tokio::sync::{oneshot, Mutex};

mod secrets;
mod history;
mod saved;
mod vars;
mod import;
mod projects;

pub struct DataDir(pub PathBuf);

struct CancelHandle(Mutex<Option<oneshot::Sender<()>>>);

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct HttpResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<[String; 2]>,
    #[serde(default)]
    pub request_headers: Vec<[String; 2]>,
    pub body: String,
    pub elapsed_ms: u64,
}

pub fn resolve_placeholders(value: &str, values: &[(String, String)]) -> String {
    let mut result = value.to_string();
    for (name, val) in values {
        result = result.replace(&format!("{{{{{}}}}}", name), val);
    }
    result
}

pub fn build_url(base: &str, params: &[[String; 2]]) -> String {
    let active: Vec<_> = params
        .iter()
        .filter(|[k, _]| !k.trim().is_empty())
        .collect();
    if active.is_empty() {
        return base.to_string();
    }
    let qs = active
        .iter()
        .map(|[k, v]| {
            format!(
                "{}={}",
                urlencoding::encode(k.trim()),
                urlencoding::encode(v.as_str())
            )
        })
        .collect::<Vec<_>>()
        .join("&");
    if base.contains('?') {
        format!("{}&{}", base, qs)
    } else {
        format!("{}?{}", base, qs)
    }
}

/// Pure HTTP send: builds a reqwest client, dispatches the request, and assembles
/// an `HttpResponse`. No placeholder resolution, no cancellation, no persistence —
/// the Tauri command wraps this with those concerns.
pub async fn perform_request(
    method: &str,
    full_url: &str,
    headers: &[[String; 2]],
    body: Option<&str>,
) -> Result<HttpResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .connect_timeout(std::time::Duration::from_secs(10))
        .user_agent("oryn/0.1.1")
        .http1_only()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let start = Instant::now();

    let base = match method.to_uppercase().as_str() {
        "GET" => client.get(full_url),
        "POST" => client.post(full_url),
        "PUT" => client.put(full_url),
        "PATCH" => client.patch(full_url),
        "DELETE" => client.delete(full_url),
        other => return Err(format!("Unknown method: {other}")),
    };

    let with_headers = headers.iter().fold(base, |r, [k, v]| {
        if k.is_empty() { r } else { r.header(k.as_str(), v.as_str()) }
    });

    let req = match body {
        Some(b) if !b.is_empty() => with_headers.body(b.to_string()),
        _ => with_headers,
    };

    let built = req.build().map_err(|e| {
        let msg = e.to_string();
        if e.is_builder() {
            format!("Invalid URL `{full_url}` — {msg}")
        } else {
            msg
        }
    })?;
    let request_headers: Vec<[String; 2]> = built
        .headers()
        .iter()
        .map(|(k, v)| [k.to_string(), v.to_str().unwrap_or("").to_string()])
        .collect();

    let res = client.execute(built).await.map_err(|e| {
        if e.is_timeout() { "Request timed out after 30s.".to_string() }
        else if e.is_connect() { format!("Could not connect: {e}") }
        else { e.to_string() }
    })?;

    let elapsed_ms = start.elapsed().as_millis() as u64;
    let status = res.status().as_u16();
    let status_text = res.status().canonical_reason().unwrap_or("").to_string();

    let res_headers: Vec<[String; 2]> = res
        .headers()
        .iter()
        .map(|(k, v)| [k.to_string(), v.to_str().unwrap_or("").to_string()])
        .collect();

    let response_body = res.text().await.map_err(|e| {
        if e.is_timeout() { "Timed out reading response body.".to_string() }
        else { e.to_string() }
    })?;

    Ok(HttpResponse {
        status,
        status_text,
        headers: res_headers,
        request_headers,
        body: response_body,
        elapsed_ms,
    })
}

#[tauri::command(rename_all = "snake_case")]
async fn send_request(
    method: String,
    url: String,
    params: Vec<[String; 2]>,
    headers: Vec<[String; 2]>,
    body: Option<String>,
    project_id: Option<String>,
    environment_id: Option<String>,
    collection_id: Option<String>,
    request_id: Option<String>,
    request_name: Option<String>,
    state: tauri::State<'_, CancelHandle>,
    data_dir: tauri::State<'_, DataDir>,
) -> Result<HttpResponse, String> {
    let _ = projects::ensure_migrated(&data_dir.0);

    let (tx, rx) = oneshot::channel::<()>();
    *state.0.lock().await = Some(tx);

    let all_values = projects::resolve_placeholders(
        &data_dir.0,
        project_id.as_deref(),
        environment_id.as_deref(),
    )?;

    let resolved_url = resolve_placeholders(&url, &all_values);
    let resolved_params: Vec<[String; 2]> = params
        .iter()
        .map(|[k, v]| [
            resolve_placeholders(k, &all_values),
            resolve_placeholders(v, &all_values),
        ])
        .collect();
    let resolved_headers: Vec<[String; 2]> = headers
        .iter()
        .map(|[k, v]| [k.clone(), resolve_placeholders(v, &all_values)])
        .collect();
    let resolved_body = body.as_ref().map(|b| resolve_placeholders(b, &all_values));

    let full_url = build_url(&resolved_url, &resolved_params);

    let response = tokio::select! {
        result = perform_request(&method, &full_url, &resolved_headers, resolved_body.as_deref()) => result?,
        _ = rx => return Err("cancelled".to_string()),
    };

    let project_name = project_id
        .as_ref()
        .and_then(|id| {
            projects::list_projects_inner(&data_dir.0)
                .ok()?
                .into_iter()
                .find(|p| p.id == *id)
                .map(|p| p.name)
        });

    let _ = history::push(
        &data_dir.0,
        history::HistoryEntry {
            id: uuid::Uuid::new_v4().to_string(),
            method: method.clone(),
            url: url.clone(),
            params: params.clone(),
            headers: headers.clone(),
            body: body.clone(),
            response: response.clone(),
            sent_at: chrono::Utc::now().to_rfc3339(),
            project_id: project_id.clone(),
            project_name,
            collection_id,
            request_id,
            request_name,
        },
    );

    Ok(response)
}

#[tauri::command(rename_all = "snake_case")]
async fn cancel_request(state: tauri::State<'_, CancelHandle>) -> Result<(), String> {
    if let Some(tx) = state.0.lock().await.take() {
        let _ = tx.send(());
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            use tauri::Manager;
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let _ = projects::ensure_migrated(&data_dir);
            app.manage(DataDir(data_dir));
            Ok(())
        })
        .manage(CancelHandle(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            send_request,
            cancel_request,
            secrets::list_secrets,
            secrets::get_secret,
            secrets::set_secret,
            secrets::delete_secret,
            history::list_history,
            history::load_history_entry,
            projects::list_projects,
            projects::create_project,
            projects::rename_project,
            projects::delete_project,
            projects::get_active_context,
            projects::set_active_context,
            projects::list_collections,
            projects::list_collection_tree,
            projects::create_collection,
            projects::rename_collection,
            projects::delete_collection,
            projects::list_environments,
            projects::load_environment_cmd,
            projects::create_environment,
            projects::rename_environment,
            projects::delete_environment,
            projects::duplicate_environment,
            projects::set_environment_variables,
            projects::save_request,
            projects::load_saved,
            projects::update_saved,
            projects::delete_saved,
            projects::migrate_legacy_data_cmd,
            vars::list_vars,
            vars::set_var,
            vars::delete_var,
            import::import_collection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pair(k: &str, v: &str) -> [String; 2] { [k.to_string(), v.to_string()] }

    #[test]
    fn build_url_with_no_params_returns_base() {
        assert_eq!(build_url("https://api.example.com/users", &[]), "https://api.example.com/users");
    }

    #[test]
    fn build_url_appends_query_with_separator() {
        let out = build_url("https://api.example.com/users", &[pair("id", "42")]);
        assert_eq!(out, "https://api.example.com/users?id=42");
    }

    #[test]
    fn build_url_appends_to_existing_query() {
        let out = build_url("https://api.example.com/users?role=admin", &[pair("id", "42")]);
        assert_eq!(out, "https://api.example.com/users?role=admin&id=42");
    }

    #[test]
    fn build_url_skips_empty_keys() {
        let out = build_url("https://api.example.com/users", &[pair("", "ignored"), pair("id", "42")]);
        assert_eq!(out, "https://api.example.com/users?id=42");
    }

    #[test]
    fn build_url_url_encodes_special_chars() {
        let out = build_url("https://api.example.com/search", &[pair("q", "hello world&foo=bar")]);
        assert_eq!(out, "https://api.example.com/search?q=hello%20world%26foo%3Dbar");
    }

    #[test]
    fn resolve_placeholders_substitutes_known_names() {
        let values = vec![
            ("TOKEN".to_string(), "abc123".to_string()),
            ("HOST".to_string(), "example.com".to_string()),
        ];
        assert_eq!(
            resolve_placeholders("Bearer {{TOKEN}} at {{HOST}}", &values),
            "Bearer abc123 at example.com"
        );
    }

    #[test]
    fn resolve_placeholders_leaves_unknown_intact() {
        let values = vec![("KNOWN".to_string(), "x".to_string())];
        assert_eq!(
            resolve_placeholders("{{KNOWN}} and {{UNKNOWN}}", &values),
            "x and {{UNKNOWN}}"
        );
    }

    #[test]
    fn resolve_placeholders_handles_empty_input() {
        assert_eq!(resolve_placeholders("", &[]), "");
        assert_eq!(resolve_placeholders("plain text", &[]), "plain text");
    }
}
