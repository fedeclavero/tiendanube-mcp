use std::io::ErrorKind;

use anyhow::{Result, anyhow, bail, ensure};
use axum::{
    Json, Router,
    extract::Request,
    http::{StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use clap::Args;
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
};
use serde_json::json;
use subtle::ConstantTimeEq;
use url::Url;

use crate::{server::Server, state};

const TOKEN_FILE: &str = "http-token";
const CLI: &str = "tiendanube-mcp";

fn validate_token(token: &str, min_len: usize) -> Result<String> {
    ensure!(
        token.len() >= min_len
            && !token.chars().any(char::is_whitespace)
            && !token.chars().any(char::is_control),
        "El token HTTP es inválido (debe tener al menos {min_len} caracteres sin espacios). Próximo paso: ejecutá `{CLI} http-token --rotate` o definí MCP_AUTH_TOKEN."
    );
    Ok(token.to_owned())
}

fn read_token() -> Result<Option<String>> {
    let raw = match state::read_bytes(TOKEN_FILE) {
        Ok(raw) => raw,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    let token = std::str::from_utf8(&raw)?.trim();
    if token.len() < 16
        || !token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
    {
        bail!("El token HTTP es inválido. Próximo paso: ejecutá `{CLI} http-token --rotate`.");
    }
    Ok(Some(token.to_owned()))
}

fn get_or_create_token(rotate: bool) -> Result<String> {
    let lock = state::lock_blocking()?;
    if !rotate && let Some(token) = read_token()? {
        return Ok(token);
    }
    let mut secret = [0; 32];
    getrandom::fill(&mut secret).map_err(|_| anyhow!("No se pudo generar un token seguro"))?;
    let token = URL_SAFE_NO_PAD.encode(secret);
    lock.write_bytes(TOKEN_FILE, format!("{token}\n").as_bytes())?;
    Ok(token)
}

fn active_token() -> Option<String> {
    if let Some(env_token) = state::env_value("MCP_AUTH_TOKEN") {
        return validate_token(env_token.trim(), 16).ok();
    }
    read_token().ok().flatten()
}

#[derive(Args)]
pub struct TokenArgs {
    #[arg(long)]
    rotate: bool,
    #[arg(long)]
    public_url: Option<String>,
    #[arg(long)]
    pub json: bool,
}

impl TokenArgs {
    pub fn run(self) -> Result<()> {
        let base = if let Some(ref base) = self.public_url {
            let url = Url::parse(base).map_err(|_| {
                anyhow!("La URL pública debe usar HTTPS y tener un dominio válido.")
            })?;
            if url.scheme() != "https"
                || url.host().is_none()
                || !url.username().is_empty()
                || url.password().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
            {
                bail!(
                    "La URL pública debe usar HTTPS y tener un dominio válido, sin credenciales, parámetros ni fragmento."
                );
            }
            Some(base.trim_end_matches('/'))
        } else {
            None
        };
        let token = get_or_create_token(self.rotate)?;
        let mut result = json!({
            "ok": true,
            "token": token,
            "bearer_header": format!("Authorization: Bearer {token}"),
            "local_url": "http://127.0.0.1:3000/mcp",
        });
        let connector = base.map(|base| format!("{base}/mcp/{token}"));
        if let Some(url) = &connector {
            result["connector_url"] = json!(url);
        }
        if self.json {
            println!("{}", serde_json::to_string_pretty(&result)?);
        } else {
            println!(
                "Token: {token}\nCabecera: Authorization: Bearer <token>\nURL local: http://127.0.0.1:3000/mcp (arrancá el servidor con `{CLI} serve --transport http`)"
            );
            if let Some(url) = connector {
                println!("URL autenticada: {url}");
            }
        }
        Ok(())
    }
}

async fn require_token(request: Request, next: Next) -> Response {
    // Re-read the atomically replaced file so that rotation revokes the old token immediately.
    let token = active_token();
    let bearer = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split_once(' '))
        .filter(|(kind, _)| kind.eq_ignore_ascii_case("Bearer"))
        .map(|(_, token)| token.trim());
    let path = request.uri().path();
    let path_token = path
        .strip_prefix("/mcp/")
        .filter(|rest| !rest.is_empty() && !rest.contains('/'))
        .or_else(|| {
            path.strip_prefix("/t/")
                .and_then(|rest| rest.strip_suffix("/mcp"))
                .filter(|rest| !rest.is_empty() && !rest.contains('/'))
        });
    if let Some(token) = token
        && [bearer, path_token]
            .into_iter()
            .flatten()
            .any(|other| bool::from(token.as_bytes().ct_eq(other.as_bytes())))
    {
        let close_session = request.method() == axum::http::Method::DELETE;
        let response = next.run(request).await;
        // Older MCP clients expect a completed 200/204 for DELETE.
        if close_session && response.status() == StatusCode::ACCEPTED {
            return StatusCode::OK.into_response();
        }
        return response;
    }
    let body = json!({
        "jsonrpc": "2.0",
        "error": {
            "code": -32001,
            "message": format!("Unauthorized: missing or wrong MCP token. Next step: send `Authorization: Bearer <token>` or use `{CLI} http-token`."),
        },
        "id": null,
    });
    (
        StatusCode::UNAUTHORIZED,
        [(header::WWW_AUTHENTICATE, "Bearer")],
        Json(body),
    )
        .into_response()
}

pub async fn serve(host: &str, port: u16, allowed_hosts: Vec<String>) -> Result<()> {
    let address = match host {
        "localhost" | "127.0.0.1" => "127.0.0.1",
        "::1" => "::1",
        _ => bail!(
            "Por seguridad el transporte HTTP solo escucha en loopback. Próximo paso: usá --host 127.0.0.1 y, si necesitás URL pública, un túnel HTTPS con --allowed-host <dominio-del-túnel>."
        ),
    };
    let mut hosts = vec![
        "127.0.0.1".to_owned(),
        "localhost".to_owned(),
        "[::1]".to_owned(),
    ];
    let mut origins = vec![
        "http://127.0.0.1:*".to_owned(),
        "http://localhost:*".to_owned(),
        "http://[::1]:*".to_owned(),
    ];
    for name in allowed_hosts {
        let host: axum::http::uri::Authority = name
            .trim()
            .parse()
            .map_err(|_| anyhow!("--allowed-host admite un dominio o dominio:puerto"))?;
        if host.as_str().contains('@') || host.as_str().contains('*') {
            bail!("--allowed-host admite un dominio exacto");
        }
        hosts.push(host.to_string());
        origins.push(format!("https://{host}"));
        origins.push(format!("http://{host}"));
    }
    if let Some(env_token) = state::env_value("MCP_AUTH_TOKEN") {
        validate_token(env_token.trim(), 16)?;
    } else {
        get_or_create_token(false)?;
    }
    let server = Server::new(false)?;
    let config = StreamableHttpServerConfig::default()
        .with_allowed_hosts(hosts)
        .with_allowed_origins(origins)
        .with_legacy_session_mode(true)
        .with_max_request_body_bytes(15 * 1024 * 1024);
    let service = StreamableHttpService::new(
        move || Ok(server.clone()),
        LocalSessionManager::default().into(),
        config,
    );
    let router = Router::new()
        .route_service("/mcp", service.clone())
        .route_service("/mcp/{token}", service.clone())
        .route_service("/t/{token}/mcp", service)
        .layer(middleware::from_fn(require_token));
    let listener = tokio::net::TcpListener::bind((address, port)).await?;
    eprintln!(
        "tiendanube-mcp {} listening on http://{address}:{port}/mcp",
        env!("CARGO_PKG_VERSION")
    );
    axum::serve(listener, router).await?;
    Ok(())
}
