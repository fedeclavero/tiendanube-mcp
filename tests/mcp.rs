use std::io::Write;
use std::process::{Child, Command, Stdio};
use std::time::Duration;

use reqwest::{Client, StatusCode};
use rmcp::{ServiceExt, model::CallToolRequestParams, transport::TokioChildProcess};
use serde_json::{Value, json};

const BINARY: &str = env!("CARGO_BIN_EXE_tiendanube-mcp");
const TOKEN: &str = "synthetic-initial-token-abcdefghijklmnopqrstuvwxyz";
const VERSION: &str = "2025-03-26";

struct RunningServer(Child);

impl Drop for RunningServer {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

async fn rpc(response: reqwest::Response) -> anyhow::Result<Value> {
    let response = response.error_for_status()?;
    let is_event_stream = response
        .headers()
        .get("content-type")
        .is_some_and(|value| value.as_bytes().starts_with(b"text/event-stream"));
    if !is_event_stream {
        return Ok(response.json().await?);
    }
    let raw = response.text().await?;
    let data = raw
        .lines()
        .find_map(|line| line.strip_prefix("data: ").filter(|body| !body.is_empty()))
        .ok_or_else(|| anyhow::anyhow!("RPC data missing in response"))?;
    Ok(serde_json::from_str(data)?)
}

#[tokio::test]
async fn streamable_http_enforces_auth_blocks_local_files_and_revokes_rotated_tokens()
-> anyhow::Result<()> {
    let state = tempfile::tempdir()?;
    std::fs::write(state.path().join("http-token"), TOKEN)?;
    let port = std::net::TcpListener::bind("127.0.0.1:0")?
        .local_addr()?
        .port();
    let _server = RunningServer(
        Command::new(BINARY)
            .env("TIENDANUBE_MCP_HOME", state.path())
            .env_remove("MCP_AUTH_TOKEN")
            .args(["serve", "--transport", "http", "--port", &port.to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()?,
    );
    let client = Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(6))
        .build()?;
    let endpoint = format!("http://127.0.0.1:{port}/mcp");
    let mut status = None;
    for _ in 0..150 {
        if let Ok(response) = client.get(&endpoint).send().await {
            status = Some(response.status());
            break;
        }
        tokio::time::sleep(Duration::from_millis(40)).await;
    }
    assert_eq!(status, Some(StatusCode::UNAUTHORIZED));
    assert_eq!(
        client
            .get(&endpoint)
            .bearer_auth(TOKEN)
            .header("Origin", "https://unrelated.invalid")
            .send()
            .await?
            .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        client
            .get(&endpoint)
            .bearer_auth(TOKEN)
            .header("Host", "unrelated.invalid")
            .send()
            .await?
            .status(),
        StatusCode::FORBIDDEN
    );

    let protected = format!("http://127.0.0.1:{port}/mcp/{TOKEN}");
    let response = client
        .post(&protected)
        .header("Accept", "application/json, text/event-stream")
        .json(&json!({
            "jsonrpc":"2.0","id":1,"method":"initialize","params":{
                "protocolVersion":VERSION,"capabilities":{},"clientInfo":{"name":"test","version":"1"}
            }
        }))
        .send()
        .await?;
    let session = response
        .headers()
        .get("mcp-session-id")
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("session id missing"))?;
    assert_eq!(
        rpc(response).await?["result"]["serverInfo"]["name"],
        "tiendanube-mcp"
    );
    let request = |data: Value| {
        client
            .post(&protected)
            .header("Accept", "application/json, text/event-stream")
            .header("Mcp-Session-Id", session.clone())
            .header("Mcp-Protocol-Version", VERSION)
            .json(&data)
    };
    let initialized = request(json!({"jsonrpc":"2.0","method":"notifications/initialized"}))
        .send()
        .await?;
    assert_eq!(initialized.status(), StatusCode::ACCEPTED);
    let list = rpc(
        request(json!({"jsonrpc":"2.0","id":2,"method":"tools/list"}))
            .send()
            .await?,
    )
    .await?;
    assert_eq!(list["result"]["tools"].as_array().map(Vec::len), Some(198));
    let start = rpc(request(json!({
        "jsonrpc":"2.0","id":3,"method":"tools/call",
        "params":{"name":"tiendanube_start_here","arguments":{}}
    }))
    .send()
    .await?)
    .await?;
    assert!(
        start["result"]["structuredContent"]["recipes"]
            .as_array()
            .is_some_and(|items| items.len() == 13)
    );
    let upload = rpc(request(json!({
        "jsonrpc":"2.0","id":4,"method":"tools/call",
        "params":{
            "name":"tiendanube_product_image_add_from_file",
            "arguments":{"product_id": 1, "file_path": "/etc/hosts"}
        }
    }))
    .send()
    .await?)
    .await?;
    assert_eq!(upload["result"]["isError"], true);
    let upload_text = upload["result"]["content"][0]["text"]
        .as_str()
        .unwrap_or_default();
    assert!(
        upload_text.contains("stdio"),
        "expected stdio-only error, got: {upload_text}"
    );

    assert_eq!(
        client
            .delete(&protected)
            .header("Mcp-Session-Id", session)
            .header("Mcp-Protocol-Version", VERSION)
            .send()
            .await?
            .status(),
        StatusCode::OK
    );

    let rotated = Command::new(BINARY)
        .env("TIENDANUBE_MCP_HOME", state.path())
        .args(["http-token", "--rotate", "--json"])
        .output()?;
    assert!(rotated.status.success());
    let result: Value = serde_json::from_slice(&rotated.stdout)?;
    assert_ne!(result["token"], TOKEN);
    assert_eq!(
        client.get(&protected).send().await?.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        client
            .get(&endpoint)
            .bearer_auth(TOKEN)
            .send()
            .await?
            .status(),
        StatusCode::UNAUTHORIZED
    );
    Ok(())
}

#[tokio::test]
async fn stdio_exposes_contract_and_keeps_oauth_in_terminal() -> anyhow::Result<()> {
    let state = tempfile::tempdir()?;
    let mut command = tokio::process::Command::new(BINARY);
    command
        .arg("serve")
        .env("TIENDANUBE_MCP_HOME", state.path())
        .env_remove("TIENDANUBE_STORE_ID")
        .env_remove("TIENDANUBE_ACCESS_TOKEN");
    let (transport, _) = TokioChildProcess::builder(command)
        .stderr(Stdio::null())
        .spawn()?;
    let running = ().serve(transport).await?;
    let tools = running.list_all_tools().await?;
    assert_eq!(tools.len(), 198);
    let resources = running.list_all_resources().await?;
    assert_eq!(resources.len(), 4);

    let oauth = running
        .call_tool(CallToolRequestParams::new("tiendanube_oauth_exchange_code"))
        .await?;
    assert_eq!(oauth.is_error, Some(true));

    let bad_path = running
        .call_tool(
            CallToolRequestParams::new("tiendanube_api_request")
                .with_arguments(json!({"path": "/v2/products"}).as_object().unwrap().clone()),
        )
        .await?;
    assert_eq!(bad_path.is_error, Some(true));

    let _ = running.cancel().await;
    Ok(())
}

#[test]
fn configure_via_stdin_and_tools_doc_work_end_to_end() -> anyhow::Result<()> {
    let state = tempfile::tempdir()?;
    let mut child = Command::new(BINARY)
        .env("TIENDANUBE_MCP_HOME", state.path())
        .env_remove("TIENDANUBE_STORE_ID")
        .env_remove("TIENDANUBE_ACCESS_TOKEN")
        .args([
            "configure",
            "--store-id",
            "42",
            "--token-stdin",
            "--no-verify",
            "--json",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    child
        .stdin
        .as_mut()
        .unwrap()
        .write_all(b"fixture-secret-token\n")?;
    let output = child.wait_with_output()?;
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let body: Value = serde_json::from_slice(&output.stdout)?;
    assert_eq!(body["ok"], true);
    assert!(!String::from_utf8_lossy(&output.stdout).contains("fixture-secret-token"));

    let doc = Command::new(BINARY).arg("tools-doc").output()?;
    assert!(doc.status.success());
    let md = String::from_utf8(doc.stdout)?;
    assert!(md.contains("`tiendanube_products_list`"));
    assert!(md.contains("`tiendanube_create_combo`"));
    Ok(())
}
