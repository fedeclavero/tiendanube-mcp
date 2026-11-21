use std::{
    net::{IpAddr, Ipv4Addr, SocketAddr},
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result, anyhow, bail, ensure};
use axum::{
    Router,
    extract::{OriginalUri, State},
    http::{HeaderMap, Method, StatusCode, header, uri::Authority},
    response::{Html, IntoResponse, Response},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use subtle::ConstantTimeEq;
use tokio::{net::TcpListener, sync::oneshot};
use url::{Host, Url};

use crate::{
    client::{DEFAULT_USER_AGENT, http_client},
    state::{self, PENDING},
};

pub(crate) const DEFAULT_PORT: u16 = 8765;
pub(crate) const DEFAULT_TIMEOUT: u64 = 600;
pub(crate) const PENDING_TTL: u64 = 900;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Region {
    #[default]
    Tiendanube,
    Nuvemshop,
}

impl Region {
    pub(crate) const fn site(self) -> &'static str {
        match self {
            Self::Tiendanube => "https://www.tiendanube.com",
            Self::Nuvemshop => "https://www.nuvemshop.com.br",
        }
    }

    pub(crate) const fn api_domain(self) -> &'static str {
        match self {
            Self::Tiendanube => "https://api.tiendanube.com",
            Self::Nuvemshop => "https://api.nuvemshop.com.br",
        }
    }

    pub(crate) const fn portal(self) -> &'static str {
        match self {
            Self::Tiendanube => "https://partners.tiendanube.com/",
            Self::Nuvemshop => "https://partners.nuvemshop.com.br/",
        }
    }

    fn token_endpoint(self) -> String {
        format!("{}/apps/authorize/token", self.site())
    }
}

pub(crate) fn parse_region(input: &str) -> std::result::Result<Region, String> {
    match input.trim().to_lowercase().as_str() {
        "tiendanube" | "latam" | "hispano" | "es" | "ar" | "mx" | "cl" | "co" => {
            Ok(Region::Tiendanube)
        }
        "nuvemshop" | "brasil" | "brazil" | "br" => Ok(Region::Nuvemshop),
        _ => Err("Usá tiendanube para Hispanoamérica o nuvemshop para Brasil.".into()),
    }
}

pub(crate) fn region_from(stored: &Value) -> Region {
    state::str_field(stored, "region")
        .and_then(|r| parse_region(r).ok())
        .unwrap_or_else(|| {
            if state::str_field(stored, "apiDomain")
                .is_some_and(|d| d.trim_end_matches('/') == Region::Nuvemshop.api_domain())
            {
                Region::Nuvemshop
            } else {
                Region::Tiendanube
            }
        })
}

pub(crate) fn validate_id(input: &str, label: &str) -> Result<()> {
    ensure!(
        !input.is_empty()
            && input.len() <= 32
            && input.bytes().all(|c| c.is_ascii_digit())
            && input.bytes().any(|c| c != b'0'),
        "El {label} debe ser un número positivo. Próximo paso: copialo desde la aplicación de la tienda."
    );
    Ok(())
}

pub(crate) fn validate_api_domain(input: &str) -> Result<&'static str> {
    let url = Url::parse(input).ok();
    for region in [Region::Tiendanube, Region::Nuvemshop] {
        if url
            .as_ref()
            .is_some_and(|host| host.as_str().trim_end_matches('/') == region.api_domain())
        {
            return Ok(region.api_domain());
        }
    }
    bail!(
        "El dominio de la API debe ser https://api.tiendanube.com o https://api.nuvemshop.com.br."
    )
}

pub(crate) fn default_redirect(port: u16) -> String {
    format!("http://localhost:{port}/callback")
}

fn loopback_host(url: &Url) -> Option<IpAddr> {
    match url.host() {
        Some(Host::Domain("localhost")) => Some(Ipv4Addr::LOCALHOST.into()),
        Some(Host::Ipv4(addr)) if addr.is_loopback() => Some(addr.into()),
        Some(Host::Ipv6(addr)) if addr.is_loopback() => Some(addr.into()),
        _ => None,
    }
}

pub(crate) fn validate_redirect(input: &str) -> Result<Url> {
    let url = Url::parse(input).map_err(|_| {
        anyhow!("Ingresá la URL de redirección absoluta que registraste en el Portal de Partners.")
    })?;
    ensure!(
        url.host().is_some()
            && (url.scheme() == "https"
                || (url.scheme() == "http" && loopback_host(&url).is_some()))
            && url.username().is_empty()
            && url.password().is_none()
            && url.fragment().is_none()
            && url.port_or_known_default() != Some(0)
            && !url
                .query_pairs()
                .any(|(key, _)| matches!(key.as_ref(), "code" | "state" | "error")),
        "Ingresá la URL HTTPS de tu aplicación, o una URL HTTP de loopback. Usá la URL registrada, sin el código de retorno."
    );
    Ok(url)
}

fn unix_time() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Attempt {
    state: String,
    pub(crate) app_id: String,
    pub(crate) region: Region,
    redirect_uri: String,
    created_at: u64,
}

impl Attempt {
    pub(crate) fn new(app_id: &str, region: Region, redirect: &Url) -> Result<Self> {
        validate_id(app_id, "App ID")?;
        let mut bytes = [0; 32];
        getrandom::fill(&mut bytes)
            .map_err(|_| anyhow!("No se pudo generar un estado OAuth seguro."))?;
        Ok(Self {
            state: URL_SAFE_NO_PAD.encode(bytes),
            app_id: app_id.to_owned(),
            region,
            redirect_uri: redirect.to_string(),
            created_at: unix_time(),
        })
    }

    pub(crate) fn url(&self) -> String {
        format!(
            "{}/apps/{}/authorize?state={}",
            self.region.site(),
            self.app_id,
            self.state
        )
    }

    pub(crate) fn redirect(&self) -> Result<Url> {
        validate_redirect(&self.redirect_uri)
    }

    fn check_pending(lock: &state::LockedState) -> Result<Self> {
        let pending = lock.read(PENDING)?.context(
            "No hay un inicio de sesión pendiente. Próximo paso: ejecutá `tiendanube-mcp login --start` y usá esa autorización."
        )?;
        let attempt: Self = serde_json::from_value(pending).map_err(|_| anyhow!(
            "El intento de conexión guardado es inválido. Próximo paso: iniciá la autorización de nuevo."
        ))?;
        attempt.check_age()?;
        Ok(attempt)
    }

    pub(crate) async fn load() -> Result<Self> {
        Self::check_pending(&state::lock().await?)
    }

    pub(crate) async fn save(&self) -> Result<()> {
        state::lock()
            .await?
            .write(PENDING, &serde_json::to_value(self)?)
    }

    fn check_age(&self) -> Result<()> {
        let now = unix_time();
        ensure!(
            now >= self.created_at && now - self.created_at <= PENDING_TTL,
            "El inicio de sesión venció. Próximo paso: ejecutá `tiendanube-mcp login --start` y usá la nueva autorización."
        );
        Ok(())
    }

    pub(crate) fn code_from_url(&self, input: &str) -> Result<String> {
        let redirect = self.redirect()?;
        let returned = Url::parse(input.trim()).map_err(|_| {
            anyhow!("Pegá la dirección completa de retorno que aparece en el navegador.")
        })?;
        ensure!(
            returned.origin() == redirect.origin()
                && returned.path() == redirect.path()
                && returned.username().is_empty()
                && returned.password().is_none()
                && returned.fragment().is_none(),
            "La URL de retorno no coincide con la URL registrada. Próximo paso: comprobá la URL de redirección en el Portal de Partners."
        );
        for (key, _) in redirect.query_pairs() {
            let values = |url: &Url| {
                url.query_pairs()
                    .filter_map(|(name, value)| (name == key).then(|| value.into_owned()))
                    .collect::<Vec<_>>()
            };
            ensure!(
                values(&redirect) == values(&returned),
                "La URL de retorno tiene parámetros distintos de los registrados."
            );
        }
        let mut states = returned
            .query_pairs()
            .filter_map(|(key, value)| (key == "state").then_some(value));
        let state = states.next().context("Tiendanube no devolvió el estado de seguridad. Próximo paso: iniciá de nuevo la autorización desde el enlace generado por login.")?;
        ensure!(
            states.next().is_none(),
            "La URL contiene más de un estado de seguridad."
        );
        self.validate_state(&state)?;
        if returned.query_pairs().any(|(key, _)| key == "error") {
            bail!(
                "Tiendanube no concedió el acceso a la aplicación. Próximo paso: repetí la autorización en la cuenta de la tienda."
            );
        }
        let mut codes = returned
            .query_pairs()
            .filter_map(|(key, value)| (key == "code").then_some(value));
        let code = codes
            .next()
            .context("La URL de retorno no contiene un código de autorización.")?;
        ensure!(
            codes.next().is_none(),
            "La URL contiene más de un código de autorización."
        );
        self.validate_code(&code, &state)
    }

    fn validate_state(&self, state: &str) -> Result<()> {
        self.check_age()?;
        ensure!(
            bool::from(self.state.as_bytes().ct_eq(state.as_bytes())),
            "El estado de OAuth no coincide. Próximo paso: usá el enlace del último intento de login."
        );
        Ok(())
    }

    pub(crate) fn validate_code(&self, code: &str, state: &str) -> Result<String> {
        self.validate_state(state)?;
        ensure!(
            !code.is_empty()
                && code.len() <= 4096
                && !code.chars().any(char::is_whitespace)
                && !code.chars().any(char::is_control),
            "El código de autorización no es válido."
        );
        Ok(code.to_owned())
    }

    pub(crate) async fn exchange(
        &self,
        code: &str,
        secret: &str,
        user_agent: Option<&str>,
    ) -> Result<TokenResult> {
        let lock = state::lock().await?;
        self.exchange_with(
            &lock,
            &http_client()?,
            &self.region.token_endpoint(),
            code,
            secret,
            user_agent,
        )
        .await
    }

    async fn exchange_with(
        &self,
        lock: &state::LockedState,
        client: &reqwest::Client,
        endpoint: &str,
        code: &str,
        secret: &str,
        user_agent: Option<&str>,
    ) -> Result<TokenResult> {
        let current = Self::check_pending(lock)?;
        current.validate_state(&self.state)?;
        ensure!(
            current.app_id == self.app_id
                && current.region == self.region
                && current.redirect_uri == self.redirect_uri,
            "Cambió la configuración del inicio de sesión. Próximo paso: volvé a iniciar la autorización."
        );
        self.validate_code(code, &self.state)?;
        let response = client.post(endpoint)
            .header(reqwest::header::ACCEPT, "application/json")
            .header(reqwest::header::USER_AGENT, user_agent.unwrap_or(DEFAULT_USER_AGENT))
            .json(&json!({"client_id": self.app_id, "client_secret": secret, "grant_type": "authorization_code", "code": code}))
            .send().await.map_err(|_| anyhow!(
                "No se pudo comunicar con Tiendanube. Próximo paso: revisá tu conexión y empezá un nuevo login si el código ya fue usado."
            ))?;
        let status = response.status();
        ensure!(
            status.is_success(),
            "Tiendanube rechazó el canje del código (HTTP {}). Próximo paso: revisá el App ID y el App Secret, y repetí el login con un código nuevo. El código dura unos cinco minutos y se usa una sola vez.",
            status.as_u16()
        );
        let mut response = response;
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| anyhow!("No se pudo leer la respuesta de autorización de Tiendanube."))?
        {
            ensure!(
                bytes.len().saturating_add(chunk.len()) <= 1024 * 1024,
                "Tiendanube devolvió una respuesta de autorización demasiado grande."
            );
            bytes.extend_from_slice(&chunk);
        }
        let data: Value = serde_json::from_slice(&bytes).map_err(|_| {
            anyhow!("Tiendanube devolvió una respuesta de autorización que no se pudo interpretar.")
        })?;
        let token = state::str_field(&data, "access_token").context(
            "Tiendanube no devolvió un token de acceso. Próximo paso: repetí la autorización en la cuenta titular."
        )?;
        let id = data
            .get("user_id")
            .filter(|value| !value.is_null())
            .unwrap_or(&data["store_id"]);
        let store_id = id.as_str().map(str::to_owned).or_else(|| id.as_u64().map(|n| n.to_string()))
            .context("La respuesta no contiene el ID de la tienda. Próximo paso: volvé a iniciar sesión o configurá el token de una app a medida.")?;
        validate_id(&store_id, "ID de la tienda")?;
        let scopes = state::scopes_in(&data["scope"]);
        let mut patch = json!({
            "storeId": store_id, "accessToken": token, "scopes": scopes, "clientId": self.app_id,
            "clientSecret": secret, "region": self.region, "apiDomain": self.region.api_domain(),
        });
        if let Some(user_agent) = user_agent {
            patch["userAgent"] = json!(user_agent);
        }
        let file = lock.update(&patch)?;
        lock.remove(PENDING)?;
        Ok(TokenResult {
            store_id,
            scopes,
            file,
        })
    }
}

pub(crate) struct TokenResult {
    pub(crate) store_id: String,
    pub(crate) scopes: Option<Vec<String>>,
    pub(crate) file: std::path::PathBuf,
}

pub(crate) struct CallbackServer {
    listener: TcpListener,
    attempt: Attempt,
}

impl CallbackServer {
    pub(crate) async fn bind(attempt: &Attempt) -> Result<Option<Self>> {
        let redirect = attempt.redirect()?;
        let Some(host) = loopback_host(&redirect).filter(|_| redirect.scheme() == "http") else {
            return Ok(None);
        };
        let port = redirect
            .port_or_known_default()
            .context("Falta el puerto de redirección.")?;
        let listener = TcpListener::bind(SocketAddr::new(host, port)).await.map_err(|error| {
            anyhow!("No se pudo abrir el puerto local {port} ({error}). Próximo paso: cerrá la otra aplicación que usa ese puerto, o ejecutá `login --start` y `login --finish`.")
        })?;
        Ok(Some(Self {
            listener,
            attempt: attempt.clone(),
        }))
    }

    pub(crate) async fn receive(self, timeout: Duration) -> Result<String> {
        let (send, receive) = oneshot::channel();
        let app = Router::new().fallback(callback).with_state(CallbackState {
            attempt: self.attempt,
            send: Arc::new(Mutex::new(Some(send))),
        });
        let server = tokio::spawn(async move { axum::serve(self.listener, app).await });
        let result = tokio::time::timeout(timeout, receive).await;
        server.abort();
        result.map_err(|_| anyhow!(
            "Pasó el tiempo de espera. Próximo paso: repetí `tiendanube-mcp login` o usá `login --start` seguido de `login --finish`."
        ))?.context("No se recibió la autorización en este equipo.")
    }
}

#[derive(Clone)]
struct CallbackState {
    attempt: Attempt,
    send: Arc<Mutex<Option<oneshot::Sender<String>>>>,
}

async fn callback(
    State(ctx): State<CallbackState>,
    OriginalUri(uri): OriginalUri,
    method: Method,
    headers: HeaderMap,
) -> Response {
    let html = |status, message| {
        (
            status,
            [
                (header::CACHE_CONTROL, "no-store"),
                (header::REFERRER_POLICY, "no-referrer"),
            ],
            Html(message),
        )
            .into_response()
    };
    if method != Method::GET {
        return html(
            StatusCode::METHOD_NOT_ALLOWED,
            "Abrí el enlace de autorización en tu navegador.",
        );
    }
    let Some(host) = headers
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .and_then(|h| h.parse::<Authority>().ok())
    else {
        return html(StatusCode::BAD_REQUEST, "La URL de retorno no es válida.");
    };
    let returned = format!("http://{host}{uri}");
    let Ok(code) = ctx.attempt.code_from_url(&returned) else {
        return html(
            StatusCode::BAD_REQUEST,
            "No se recibió una autorización válida. Volvé a la terminal si necesitás reintentar.",
        );
    };

    let sender = ctx.send.lock().ok().and_then(|mut sender| sender.take());
    if let Some(sender) = sender {
        // A short delay lets the HTTP response finish before the listener is stopped.
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(100)).await;
            let _ = sender.send(code);
        });
    }
    html(
        StatusCode::OK,
        "<!doctype html><meta charset=utf-8><title>Tiendanube MCP</title><h1>Autorización recibida</h1><p>Volvé a la instalación para ver el resultado.</p>",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn callback_requires_exact_origin_path_and_present_unique_state() -> Result<()> {
        let target = validate_redirect("https://merchant.example/callback?installation=42")?;
        let attempt = Attempt::new("123", Region::Nuvemshop, &target)?;
        let good = format!(
            "https://merchant.example/callback?installation=42&code=a%2Bb&state={}",
            attempt.state
        );
        assert_eq!(attempt.code_from_url(&good)?, "a+b");
        assert!(!attempt.url().contains("tiendanube.com"));
        assert!(
            attempt
                .url()
                .contains("https://www.nuvemshop.com.br/apps/123/authorize?state=")
        );
        assert!(
            attempt
                .code_from_url("https://merchant.example/callback?installation=42&code=a")
                .is_err()
        );
        for bad in [
            good.replace("merchant.example", "other.example"),
            good.replace("/callback", "/callback/"),
            good.replace("installation=42", "installation=44"),
            format!("{good}&state=other"),
            format!("{good}&code=another"),
        ] {
            assert!(attempt.code_from_url(&bad).is_err());
        }
        assert!(validate_redirect("http://untrusted.example/callback").is_err());
        assert!(validate_api_domain("https://api.tiendanube.com.example/").is_err());
        Ok(())
    }

    #[tokio::test]
    async fn local_listener_keeps_waiting_after_an_invalid_attempt() -> Result<()> {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
        let base = format!("http://{}", listener.local_addr()?);
        let attempt = Attempt::new(
            "123",
            Region::Tiendanube,
            &validate_redirect(&format!("{base}/callback"))?,
        )?;
        let valid = format!("{base}/callback?code=valid&state={}", attempt.state);
        let server = CallbackServer { listener, attempt };
        let task = tokio::spawn(server.receive(Duration::from_secs(5)));
        let client = reqwest::Client::builder().no_proxy().build()?;
        for query in ["?code=missing-state", "?code=wrong-state&state=bad"] {
            assert_eq!(
                client
                    .get(format!("{base}/callback{query}"))
                    .send()
                    .await?
                    .status(),
                StatusCode::BAD_REQUEST
            );
        }
        assert_eq!(client.get(valid).send().await?.status(), StatusCode::OK);
        assert_eq!(task.await??, "valid");
        Ok(())
    }

    #[tokio::test]
    async fn oauth_exchange_uses_the_official_request_shape_and_keeps_secrets_private() -> Result<()>
    {
        let dir = tempfile::tempdir()?;
        let lock = state::lock_in(dir.path().to_owned())?;
        let redirect = validate_redirect("http://localhost:8765/callback")?;
        let attempt = Attempt::new("123", Region::Tiendanube, &redirect)?;
        lock.write(PENDING, &serde_json::to_value(&attempt)?)?;

        let handler = |axum::Json(payload): axum::Json<Value>| async move {
            assert_eq!(
                payload,
                json!({
                    "client_id": "123", "client_secret": "fixture-secret", "code": "fixture-code",
                    "grant_type": "authorization_code",
                })
            );
            axum::Json(
                json!({"access_token":"fixture-token", "user_id": 42, "scope":"write_products,write_customers"}),
            )
        };
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
        let endpoint = format!("http://{}/apps/authorize/token", listener.local_addr()?);
        let server = tokio::spawn(async move {
            axum::serve(
                listener,
                Router::new().route("/apps/authorize/token", axum::routing::post(handler)),
            )
            .await
        });
        let client = reqwest::Client::builder().no_proxy().build()?;
        let token = attempt
            .exchange_with(
                &lock,
                &client,
                &endpoint,
                "fixture-code",
                "fixture-secret",
                None,
            )
            .await?;
        assert_eq!(token.store_id, "42");
        assert_eq!(
            token.scopes,
            Some(vec!["write_customers".into(), "write_products".into()])
        );
        let stored = lock
            .read("credentials.json")?
            .context("missing credentials")?;
        assert_eq!(stored["accessToken"], "fixture-token");
        assert_eq!(stored["clientSecret"], "fixture-secret");
        assert!(lock.read(PENDING)?.is_none());
        let reused = attempt
            .exchange_with(
                &lock,
                &client,
                &endpoint,
                "fixture-code",
                "fixture-secret",
                None,
            )
            .await;
        assert!(reused.is_err());
        server.abort();
        Ok(())
    }
}
