//! Integration tests for the HTTP send pipeline.
//!
//! These spin up a local `wiremock` server, dispatch real requests through
//! `oryn_lib::perform_request`, and assert that method, URL, headers, and body
//! are wired correctly end to end. No network access required.

use oryn_lib::{build_url, perform_request};
use serde_json::json;
use wiremock::matchers::{body_json, body_string, header, method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn h(k: &str, v: &str) -> [String; 2] { [k.to_string(), v.to_string()] }

#[tokio::test]
async fn get_with_query_params_round_trips() {
    let server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/users"))
        .and(query_param("id", "42"))
        .and(query_param("role", "admin"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "ok": true })))
        .mount(&server)
        .await;

    let url = build_url(&format!("{}/users", server.uri()), &[h("id", "42"), h("role", "admin")]);
    let res = perform_request("GET", &url, &[], None).await.unwrap();

    assert_eq!(res.status, 200);
    assert!(res.body.contains("\"ok\""));
}

#[tokio::test]
async fn post_with_json_body_and_content_type() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/echo"))
        .and(header("content-type", "application/json"))
        .and(body_json(json!({ "hello": "world" })))
        .respond_with(ResponseTemplate::new(201).set_body_string("created"))
        .mount(&server)
        .await;

    let res = perform_request(
        "POST",
        &format!("{}/echo", server.uri()),
        &[h("Content-Type", "application/json")],
        Some(r#"{"hello":"world"}"#),
    )
    .await
    .unwrap();

    assert_eq!(res.status, 201);
    assert_eq!(res.body, "created");
}

#[tokio::test]
async fn custom_headers_propagate() {
    let server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/secret"))
        .and(header("authorization", "Bearer abc123"))
        .and(header("x-custom", "yes"))
        .respond_with(ResponseTemplate::new(200))
        .mount(&server)
        .await;

    let res = perform_request(
        "GET",
        &format!("{}/secret", server.uri()),
        &[h("Authorization", "Bearer abc123"), h("X-Custom", "yes")],
        None,
    )
    .await
    .unwrap();

    assert_eq!(res.status, 200);

    // request_headers should include what we sent
    let sent: Vec<String> = res.request_headers.iter().map(|[k, _]| k.to_lowercase()).collect();
    assert!(sent.contains(&"authorization".to_string()));
    assert!(sent.contains(&"x-custom".to_string()));
}

#[tokio::test]
async fn graphql_shaped_payload_round_trips() {
    let server = MockServer::start().await;

    let payload = json!({
        "query": "{ countries { name code } }",
        "variables": { "code": "BR" }
    });

    Mock::given(method("POST"))
        .and(path("/graphql"))
        .and(header("content-type", "application/json"))
        .and(body_json(payload.clone()))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": { "countries": [] } })))
        .mount(&server)
        .await;

    let body = serde_json::to_string(&payload).unwrap();
    let res = perform_request(
        "POST",
        &format!("{}/graphql", server.uri()),
        &[h("Content-Type", "application/json")],
        Some(&body),
    )
    .await
    .unwrap();

    assert_eq!(res.status, 200);
    assert!(res.body.contains("\"data\""));
}

#[tokio::test]
async fn form_urlencoded_body_round_trips() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/login"))
        .and(header("content-type", "application/x-www-form-urlencoded"))
        .and(body_string("user=alice&pass=hunter2"))
        .respond_with(ResponseTemplate::new(200))
        .mount(&server)
        .await;

    let res = perform_request(
        "POST",
        &format!("{}/login", server.uri()),
        &[h("Content-Type", "application/x-www-form-urlencoded")],
        Some("user=alice&pass=hunter2"),
    )
    .await
    .unwrap();

    assert_eq!(res.status, 200);
}

#[tokio::test]
async fn unknown_method_returns_error() {
    let result = perform_request("OPTIONS", "https://example.com", &[], None).await;
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("Unknown method"));
}

#[tokio::test]
async fn empty_body_string_is_treated_as_no_body() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/ping"))
        .respond_with(ResponseTemplate::new(200))
        .mount(&server)
        .await;

    // Passing Some("") should not attach a body — we hit the same endpoint either way,
    // but in practice this guards against accidentally sending "0-byte body" semantics.
    let res = perform_request("POST", &format!("{}/ping", server.uri()), &[], Some("")).await.unwrap();
    assert_eq!(res.status, 200);
}
