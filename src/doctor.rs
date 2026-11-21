use std::{collections::BTreeSet, process::ExitCode};

use anyhow::Result;
use clap::Args;
use serde_json::{Value, json};

use crate::{
    catalog::endpoints,
    client::{Api, ApiError},
    installer, state,
};

const CONFIGURE: &str = "Configurá la tienda con tiendanube-mcp configure o autorizá tu aplicación con tiendanube-mcp login.";
const GRANT: &str = "Habilitá todos los permisos disponibles de la aplicación y volvé a autorizarla en la tienda para emitir un token nuevo. Para una app personalizada, guardá su token nuevo con configure.";

#[derive(Args)]
pub(crate) struct DoctorArgs {
    /// Check only local credentials and client settings.
    #[arg(long, conflicts_with = "no_probe")]
    offline: bool,
    /// Verify the store without testing each read scope.
    #[arg(long)]
    no_probe: bool,
    #[arg(long)]
    pub(crate) json: bool,
}

fn initial_report(creds: &state::Credentials, offline: bool) -> Value {
    let mut report = json!({
        "ok": false,
        "offline": offline,
        "storeVerified": false,
        "credentials": {
            "storeId": creds.store_id,
            "tokenSet": creds.access_token.as_ref().is_some_and(|token| !token.is_empty()),
            "from": {
                "storeId": creds.store_source,
                "accessToken": creds.token_source,
            },
            "file": state::credentials_path(),
            "userAgent": creds.user_agent,
            "apiDomain": creds.api_domain,
        },
        "mode": "read-write",
        "readScopes": {},
        "missingReadScopes": [],
        "missingWriteScopes": [],
        "problems": [],
        "nextSteps": [],
    });
    if let Some(scopes) = &creds.scopes {
        report["grantedScopes"] = json!(scopes);
    }
    report
}

fn identity(data: &Value) -> Value {
    let name = data["name"]
        .as_str()
        .or_else(|| data["name"].as_object()?.values().find_map(Value::as_str));
    let mut store = json!({});
    for (target, source) in [
        ("id", "id"),
        ("plan", "plan_name"),
        ("country", "country"),
        ("currency", "main_currency"),
    ] {
        if let Some(value) = data.get(source) {
            store[target] = value.clone();
        }
    }
    if let Some(name) = name {
        store["name"] = json!(name);
    }
    if let Some(languages) = data["languages"].as_array() {
        store["languages"] = json!(languages);
    }
    store
}

pub(crate) async fn diagnose(api: &Api, probe_scopes: bool) -> Result<Value> {
    diagnose_inner(api, probe_scopes, false).await
}

async fn diagnose_inner(api: &Api, probe_scopes: bool, offline: bool) -> Result<Value> {
    let creds = state::resolve()?;
    let mut report = initial_report(&creds, offline);
    if creds.store_id.as_deref().is_none_or(str::is_empty)
        || creds.access_token.as_deref().is_none_or(str::is_empty)
    {
        report["problems"] = json!(["Falta el ID de tienda o el token de acceso."]);
        report["nextSteps"] = json!([CONFIGURE]);
        return Ok(report);
    }

    let mut problems = Vec::new();
    let mut next_steps = Vec::new();
    if !offline {
        match api.request("GET", "/store", None, &Value::Null, None).await {
            Ok(response) => {
                report["store"] = identity(&response.data);
                report["storeVerified"] = json!(true);
            }
            Err(error) => {
                let status = error.downcast_ref::<ApiError>().map(|error| error.status);
                let (problem, action) = match status {
                    Some(401) => (
                        "Tiendanube rechazó el token de esta tienda (HTTP 401).".to_owned(),
                        "Revisá el ID de tienda y configurá un token vigente, o ejecutá tiendanube-mcp login para volver a autorizar la aplicación.",
                    ),
                    Some(403) => (
                        "Tiendanube denegó la consulta de la tienda (HTTP 403).".to_owned(),
                        GRANT,
                    ),
                    Some(402) => (
                        "Tiendanube suspendió el acceso a la API para este plan (HTTP 402)."
                            .to_owned(),
                        "Revisá el estado de facturación de la tienda en Tiendanube.",
                    ),
                    Some(status) => (
                        format!("La consulta a la tienda devolvió HTTP {status}."),
                        "Revisá el ID de tienda, la región y el estado de la API. Después volvé a ejecutar doctor.",
                    ),
                    None => (
                        "No se pudo confirmar la conexión con Tiendanube.".to_owned(),
                        "Revisá tu configuración y la conexión a Internet. Después volvé a ejecutar doctor.",
                    ),
                };
                report["problems"] = json!([problem]);
                report["nextSteps"] = json!([action]);
                return Ok(report);
            }
        }
    }

    if probe_scopes && !offline {
        let mut seen = BTreeSet::new();
        let mut missing = Vec::new();
        for endpoint in endpoints() {
            if endpoint.method != "GET"
                || !endpoint.scope.starts_with("read_")
                || !endpoint
                    .scope
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte == b'_')
                || endpoint.path.contains('{')
                || !seen.insert(endpoint.scope.as_str())
            {
                continue;
            }
            let query = if endpoint.list {
                json!({"page": 1, "per_page": 1})
            } else {
                Value::Null
            };
            let result = api
                .request(
                    "GET",
                    &endpoint.path,
                    endpoint.version.as_deref(),
                    &query,
                    None,
                )
                .await;
            let state = match result {
                Ok(_) => "ok",
                Err(error) => match error.downcast_ref::<ApiError>() {
                    Some(error) if error.status == 403 => {
                        missing.push(endpoint.scope.as_str());
                        "missing"
                    }
                    Some(error)
                        if error.status == 404
                            && error
                                .payload
                                .to_string()
                                .to_ascii_lowercase()
                                .contains("last page") =>
                    {
                        "ok"
                    }
                    _ => "unknown",
                },
            };
            report["readScopes"][&endpoint.scope] = json!(state);
        }
        if !missing.is_empty() {
            problems.push(format!(
                "Estas consultas devolvieron HTTP 403: {}. Algunos recursos también requieren un tipo de aplicación o plan específico.",
                missing.join(", ")
            ));
        }
        report["missingReadScopes"] = json!(missing);
    }

    if let Some(scopes) = creds.scopes.as_ref().filter(|scopes| !scopes.is_empty()) {
        let missing = state::missing_basic_write_scopes(scopes);
        if !missing.is_empty() {
            problems.push(format!(
                "Faltan permisos de escritura en la autorización: {}.",
                missing.join(", ")
            ));
        }
        report["missingWriteScopes"] = json!(missing);
    } else {
        report["scopeNote"] = json!(
            "El token no informa sus permisos de escritura. Revisalos en la aplicación de Tiendanube. El diagnóstico usa consultas."
        );
    }

    if problems.is_empty() {
        if offline {
            next_steps.push("Las credenciales están guardadas. Ejecutá doctor sin --offline para verificar el acceso a la tienda.");
        } else {
            next_steps.push(
                "La tienda respondió. Usá tiendanube_start_here para descubrir las herramientas.",
            );
        }
    } else {
        next_steps.push(GRANT);
    }
    report["ok"] = json!(problems.is_empty());
    report["problems"] = json!(problems);
    report["nextSteps"] = json!(next_steps);
    Ok(report)
}

pub(crate) fn render_report(report: &Value) -> String {
    let confirmed = report["storeVerified"] == true;
    let ok = report["ok"] == true;
    let mut lines = vec![match (ok, confirmed) {
        (true, true) => "OK: la conexión con Tiendanube funciona.".to_owned(),
        (true, false) => "OK: las credenciales están configuradas localmente.".to_owned(),
        (false, _) => "Se encontraron problemas.".to_owned(),
    }];
    let credentials = &report["credentials"];
    lines.push(format!(
        "Credenciales de la tienda {}, token {}, archivo {}.",
        credentials["storeId"].as_str().unwrap_or("(sin ID)"),
        if credentials["tokenSet"] == true {
            "configurado"
        } else {
            "ausente"
        },
        credentials["file"].as_str().unwrap_or("?"),
    ));
    if let Some(store) = report.get("store") {
        let store_id = store["id"]
            .as_str()
            .map(str::to_owned)
            .unwrap_or_else(|| store["id"].to_string());
        lines.push(format!(
            "Tienda {} (ID {store_id}).",
            store["name"].as_str().unwrap_or("?"),
        ));
    }
    if let Some(scopes) = report["readScopes"]
        .as_object()
        .filter(|scopes| !scopes.is_empty())
    {
        let states: Vec<_> = scopes
            .iter()
            .map(|(scope, status)| format!("{scope}={}", status.as_str().unwrap_or("unknown")))
            .collect();
        lines.push(format!(
            "Permisos de lectura comprobados: {}",
            states.join(", ")
        ));
    }
    if let Some(scopes) = report["grantedScopes"]
        .as_array()
        .filter(|scopes| !scopes.is_empty())
    {
        let scopes: Vec<_> = scopes.iter().filter_map(Value::as_str).collect();
        lines.push(format!(
            "Permisos informados en la autorización: {}",
            scopes.join(", ")
        ));
    }
    for (key, prefix) in [("problems", "Problema"), ("nextSteps", "Next step")] {
        for text in report[key]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
        {
            lines.push(format!("{prefix}: {text}"));
        }
    }
    if let Some(note) = report["scopeNote"].as_str() {
        lines.push(note.to_owned());
    }
    lines.join("\n")
}

impl DoctorArgs {
    pub(crate) fn check(json: bool) -> Self {
        Self {
            offline: false,
            no_probe: false,
            json,
        }
    }

    pub(crate) async fn run(self) -> Result<ExitCode> {
        let api = Api::new();
        let mut report = diagnose_inner(&api, !self.no_probe, self.offline).await?;
        let clients = installer::client_status()?;
        let registered: Vec<_> = clients
            .iter()
            .filter(|client| client.registered)
            .map(|client| client.label)
            .collect();
        report["clients"] = json!(clients);
        if report["ok"] == true
            && registered.is_empty()
            && let Some(steps) = report["nextSteps"].as_array_mut()
        {
            steps.push(json!("Registrá el MCP en tu cliente con install --client claude-code, install --client codex o install --client antigravity."));
        }
        if self.json {
            println!("{}", serde_json::to_string_pretty(&report)?);
        } else {
            println!("{}", render_report(&report));
            if !registered.is_empty() {
                println!("Registrado en {}.", registered.join(", "));
            }
        }
        Ok(if report["ok"] == true {
            ExitCode::SUCCESS
        } else {
            ExitCode::FAILURE
        })
    }
}
