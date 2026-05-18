use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct SavedRequest {
    pub id: String,
    pub name: String,
    #[serde(default = "default_protocol")]
    pub protocol: String,
    pub method: String,
    pub url: String,
    pub params: Vec<[String; 2]>,
    pub headers: Vec<[String; 2]>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default = "default_body_mode")]
    pub body_mode: String,
    #[serde(default)]
    pub graphql_query: String,
    #[serde(default)]
    pub graphql_variables: String,
    pub response: Option<crate::HttpResponse>,
    pub saved_at: String,
}

fn default_protocol() -> String {
    "rest".to_string()
}
fn default_body_mode() -> String {
    "none".to_string()
}

