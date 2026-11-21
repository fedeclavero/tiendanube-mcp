use std::{
    fs,
    path::Path,
    process::{Command, Output},
};

use serde_json::{Value, json};

const BINARY: &str = env!("CARGO_BIN_EXE_tiendanube-mcp");

fn command(root: &Path) -> Command {
    let mut cmd = Command::new(BINARY);
    cmd.env("CLAUDE_CONFIG_DIR", root.join("Claude ñ profile"))
        .env("CODEX_HOME", root.join("Codex ñ profile"))
        .env("TIENDANUBE_MCP_HOME", root.join("Tiendanube ñ state"))
        .env_remove("TIENDANUBE_STORE_ID")
        .env_remove("TIENDANUBE_ACCESS_TOKEN")
        .env_remove("TIENDANUBE_API_DOMAIN")
        .env_remove("TRANSPORT");
    cmd
}

fn json_output(output: &Output) -> Value {
    serde_json::from_slice(&output.stdout).unwrap_or_else(|error| {
        panic!(
            "{error}\nstdout: {}\nstderr: {}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        )
    })
}

#[test]
fn native_server_registers_launches_and_uninstalls_in_both_clients() {
    let user = tempfile::tempdir().expect("create isolated user configuration");
    let root = user.path();
    let args = [
        "install",
        "--client",
        "claude-code",
        "--client",
        "codex",
        "--json",
    ];
    let first = command(root).args(args).output().expect("first install");
    assert!(first.status.success(), "{}", json_output(&first));
    let first = json_output(&first);
    assert_eq!(first["launch_check"]["server"], "tiendanube-mcp");
    assert_eq!(first["launch_check"]["has_start_here"], true);
    assert_eq!(first["installed"].as_array().unwrap().len(), 2);

    let claude = root.join("Claude ñ profile/.claude.json");
    let codex = root.join("Codex ñ profile/config.toml");
    let config: Value = serde_json::from_slice(&fs::read(&claude).unwrap()).unwrap();
    assert_eq!(config["mcpServers"]["tiendanube"]["args"], json!(["serve"]));
    assert_eq!(
        config["mcpServers"]["tiendanube"]["env"]["TIENDANUBE_MCP_HOME"],
        json!(root.join("Tiendanube ñ state"))
    );
    assert!(
        fs::read_to_string(&codex)
            .unwrap()
            .contains("[mcp_servers.tiendanube]")
    );
    let next = command(root)
        .args(args)
        .output()
        .expect("idempotent install");
    let next = json_output(&next);
    assert_eq!(next["installed"][0]["status"], "unchanged");
    assert_eq!(next["installed"][1]["status"], "unchanged");

    let removals = command(root)
        .args(["uninstall", "--client", "all", "--json"])
        .output()
        .unwrap();
    let report = json_output(&removals);
    assert!(removals.status.success(), "{report}");
    assert_eq!(report["clients"][0]["status"], "removed");
    assert_eq!(report["clients"][1]["status"], "removed");
    let config: Value = serde_json::from_slice(&fs::read(claude).unwrap()).unwrap();
    assert!(config["mcpServers"]["tiendanube"].is_null());
    assert!(
        !fs::read_to_string(codex)
            .unwrap()
            .contains("[mcp_servers.tiendanube]")
    );
}

#[test]
fn invalid_executable_and_removed_clients_leave_the_profiles_untouched() {
    let root = tempfile::tempdir().unwrap();
    let output = command(root.path())
        .args(["install", "--client", "codex", "--command"])
        .arg(root.path().join("not-an-executable"))
        .arg("--json")
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert_eq!(json_output(&output)["launch_check"]["ok"], false);
    let removed = command(root.path())
        .args(["install", "--client", "all,cursor", "--json"])
        .output()
        .unwrap();
    assert!(!removed.status.success());
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
}

#[test]
fn doctor_offline_reports_missing_write_scopes_without_printing_secrets() {
    let root = tempfile::tempdir().unwrap();
    let store = root.path().join("Tiendanube ñ state");
    fs::create_dir(&store).unwrap();
    let credentials = json!({
        "storeId": "42",
        "accessToken": "test-access-token-should-not-be-printed",
        "clientSecret": "test-client-secret-should-not-be-printed",
        "scopes": ["write_products", "write_orders"],
        "readOnly": true
    });
    fs::write(store.join("credentials.json"), credentials.to_string()).unwrap();
    let output = command(root.path())
        .args(["doctor", "--offline", "--json"])
        .output()
        .unwrap();
    assert!(!output.status.success());
    let report = json_output(&output);
    assert_eq!(report["mode"], "read-write");
    assert_eq!(report["storeVerified"], false);
    assert_eq!(report["credentials"]["storeId"], "42");
    assert_eq!(report["credentials"]["tokenSet"], true);
    assert!(
        report["missingWriteScopes"]
            .as_array()
            .unwrap()
            .contains(&json!("write_customers"))
    );
    let response = String::from_utf8_lossy(&output.stdout);
    assert!(!response.contains("test-access-token-should-not-be-printed"));
    assert!(!response.contains("test-client-secret-should-not-be-printed"));
}
