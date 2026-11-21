use std::fmt;
use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Result, anyhow, bail};
use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, percent_decode_str, utf8_percent_encode};
use reqwest::{Client, Method, Url, header::HeaderMap};
use serde_json::{Value, json};

use crate::state;

pub const DEFAULT_USER_AGENT: &str =
    "Tiendanube MCP (https://github.com/fedeclavero/tiendanube-mcp)";
pub const DEFAULT_API_VERSION: &str = "2025-03";
pub const LATAM_API: &str = "https://api.tiendanube.com";
pub const BRAZIL_API: &str = "https://api.nuvemshop.com.br";
const MAX_RESPONSE: usize = 16 * 1024 * 1024;
const COMPONENT_ENCODING: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'~')
    .remove(b'!')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')')
    .remove(b'*');

pub struct ApiResponse {
    pub data: Value,
    pub headers: HeaderMap,
}

#[derive(Debug)]
pub struct ApiError {
    pub status: u16,
    pub method: String,
    pub path: String,
    pub payload: Value,
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Tiendanube API {} on {} {}",
            self.status, self.method, self.path
        )
    }
}
impl std::error::Error for ApiError {}

pub fn http_client() -> Result<Client> {
    Ok(Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .https_only(true)
        .no_proxy()
        .timeout(Duration::from_secs(30))
        .build()?)
}

#[derive(Clone)]
pub struct Api {
    client: std::result::Result<Client, String>,
    pause_until: Arc<AtomicU64>,
    #[cfg(test)]
    fixture: Option<(String, String)>,
}

impl Api {
    pub fn new() -> Self {
        Self {
            client: http_client().map_err(|error| error.to_string()),
            pause_until: Arc::new(AtomicU64::new(0)),
            #[cfg(test)]
            fixture: None,
        }
    }

    #[cfg(test)]
    pub(crate) fn mock(origin: &str, token: &str) -> Self {
        Self {
            client: Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(3))
                .build()
                .map_err(|error| error.to_string()),
            fixture: Some((origin.into(), token.into())),
            pause_until: Arc::new(AtomicU64::new(0)),
        }
    }

    fn settings(&self) -> Result<(String, String, String, String, String)> {
        #[cfg(test)]
        if let Some((origin, token)) = &self.fixture {
            return Ok((
                origin.clone(),
                "42".into(),
                token.clone(),
                DEFAULT_USER_AGENT.into(),
                DEFAULT_API_VERSION.into(),
            ));
        }
        let credentials = state::resolve()?;
        let missing = || {
            anyhow!(
                "Store ID and access token are required. Next step: run tiendanube-mcp onboard or follow guides/AGENT_INSTALL.md."
            )
        };
        let store = credentials.store_id.ok_or_else(missing)?;
        if store.is_empty() || !store.bytes().all(|c| c.is_ascii_digit()) {
            bail!(
                "Store ID must be numeric. Next step: use the store ID shown by Tiendanube in configure."
            );
        }
        let token = credentials.access_token.ok_or_else(missing)?;
        if token.is_empty() || token.chars().any(char::is_whitespace) {
            bail!(
                "The access token is invalid. Next step: run tiendanube-mcp configure with the token from your store."
            );
        }
        let origin = credentials
            .api_domain
            .as_deref()
            .unwrap_or(LATAM_API)
            .trim_end_matches('/');
        if !matches!(origin, LATAM_API | BRAZIL_API) {
            bail!(
                "The API domain must be one of the two official origins. Next step: use {LATAM_API} or {BRAZIL_API}."
            );
        }
        let agent = credentials
            .user_agent
            .unwrap_or_else(|| DEFAULT_USER_AGENT.to_owned());
        let version = credentials
            .api_version
            .unwrap_or_else(|| DEFAULT_API_VERSION.to_owned());
        Ok((origin.into(), store, token, agent, version))
    }

    pub async fn request(
        &self,
        method: &str,
        path: &str,
        version: Option<&str>,
        query: &Value,
        body: Option<&Value>,
    ) -> Result<ApiResponse> {
        validate_path(path)?;
        let method = match method {
            "GET" => Method::GET,
            "POST" => Method::POST,
            "PUT" => Method::PUT,
            "PATCH" => Method::PATCH,
            "DELETE" => Method::DELETE,
            _ => bail!("Unsupported HTTP method. Next step: use GET, POST, PUT, PATCH or DELETE."),
        };
        let (origin, store, token, agent, default_version) = self.settings()?;
        let version = version.unwrap_or(&default_version);
        if !matches!(version, "2025-03" | "v1" | "unstable") {
            bail!("Unsupported API version. Next step: use 2025-03, v1 or unstable.");
        }
        let mut url = Url::parse(&format!("{origin}/{version}/{store}{path}"))?;
        for (key, value) in query.as_object().into_iter().flatten() {
            if [
                "access_token",
                "authorization",
                "authentication",
                "client_secret",
            ]
            .iter()
            .any(|secret| key.eq_ignore_ascii_case(secret))
            {
                bail!(
                    "Credentials are configured privately. Next step: remove credential fields from query."
                );
            }
            if value.is_null() || value.as_str() == Some("") {
                continue;
            }
            let value = if let Some(values) = value.as_array() {
                values.iter().map(query_value).collect::<Vec<_>>().join(",")
            } else {
                query_value(value)
            };
            url.query_pairs_mut().append_pair(key, &value);
        }
        let client = self.client.as_ref().map_err(|error| anyhow!("{error}"))?;
        for attempt in 0..=3 {
            let time = self
                .pause_until
                .load(Ordering::Relaxed)
                .saturating_sub(epoch_ms());
            if time > 0 {
                tokio::time::sleep(Duration::from_millis(time.min(15_000))).await;
            }
            let mut request = client
                .request(method.clone(), url.clone())
                .header("Authentication", format!("bearer {token}"))
                .bearer_auth(&token)
                .header("User-Agent", &agent)
                .header("Content-Type", "application/json; charset=utf-8")
                .header("Accept", "application/json");
            if let Some(body) = body {
                request = request.json(body);
            }
            let mut response = request.send().await.map_err(|error| {
                let detail = if error.is_timeout() { "request timed out" } else { "connection failed" };
                if method == Method::GET {
                    anyhow!("Tiendanube {detail}. Next step: retry or narrow the query.")
                } else {
                    anyhow!("Tiendanube {detail}. Next step: check whether the change took effect before retrying.")
                }
            })?;
            let status = response.status().as_u16();
            let headers = response.headers().clone();
            let remaining = numeric_header(&headers, "x-rate-limit-remaining");
            if remaining.is_some_and(|limit| limit <= 2) || status == 429 {
                let wait = numeric_header(&headers, "x-rate-limit-reset")
                    .filter(|value| *value > 0)
                    .or_else(|| {
                        numeric_header(&headers, "retry-after")
                            .map(|seconds| seconds.saturating_mul(1000))
                    })
                    .unwrap_or(if status == 429 { 2000 } else { 1000 })
                    .min(15_000);
                self.pause_until
                    .fetch_max(epoch_ms().saturating_add(wait), Ordering::Relaxed);
            }
            if status == 429 && method == Method::GET && attempt < 3 {
                continue;
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = response.chunk().await.map_err(|_| anyhow!("Tiendanube response interrupted. Next step: check the operation status before retrying."))? {
                if bytes.len() + chunk.len() > MAX_RESPONSE {
                    bail!("The Tiendanube response exceeds 16 MiB. Next step: narrow the fields or lower per_page.");
                }
                bytes.extend_from_slice(&chunk);
            }
            let mut data = if bytes.is_empty() {
                json!({})
            } else {
                serde_json::from_slice(&bytes)
                    .unwrap_or_else(|_| json!({"raw":String::from_utf8_lossy(&bytes)}))
            };
            if !(200..300).contains(&status) {
                return Err(ApiError {
                    status,
                    method: method.to_string(),
                    path: url.path().into(),
                    payload: remove_token_fields(data),
                }
                .into());
            }
            if status == 204 || bytes.is_empty() {
                data = json!({"success":true});
            }
            return Ok(ApiResponse {
                data: remove_token_fields(data),
                headers,
            });
        }
        bail!("Tiendanube rate limit reached. Next step: wait a few seconds and try again.")
    }
}

fn remove_token_fields(mut value: Value) -> Value {
    match &mut value {
        Value::Object(object) => {
            object.retain(|key, _| {
                !["access_token", "client_secret", "refresh_token"]
                    .iter()
                    .any(|secret| key.eq_ignore_ascii_case(secret))
            });
            for value in object.values_mut() {
                *value = remove_token_fields(std::mem::take(value));
            }
        }
        Value::Array(values) => {
            for value in values {
                *value = remove_token_fields(std::mem::take(value));
            }
        }
        _ => {}
    }
    value
}

fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn numeric_header(headers: &HeaderMap, key: &str) -> Option<u64> {
    headers.get(key)?.to_str().ok()?.trim().parse().ok()
}

fn query_value(value: &Value) -> String {
    value
        .as_str()
        .map_or_else(|| value.to_string(), str::to_owned)
}

pub fn id_segment(value: &str) -> Result<String> {
    if value.is_empty()
        || matches!(value, "." | "..")
        || value
            .chars()
            .any(|c| matches!(c, '/' | '\\' | '%') || c.is_control())
    {
        bail!("Invalid ID. Next step: use the exact ID returned by the corresponding list tool.");
    }
    Ok(utf8_percent_encode(value, COMPONENT_ENCODING).to_string())
}

pub fn validate_path(path: &str) -> Result<()> {
    if !path.starts_with('/')
        || path.contains("//")
        || path.contains(['?', '#', '\\'])
        || path.chars().any(|ch| ch.is_control() || ch.is_whitespace())
    {
        bail!(
            "Invalid route. Next step: pass a store-relative path such as /products and give filters in query."
        );
    }
    for raw in path.split('/').skip(1) {
        let decoded = percent_decode_str(raw)
            .decode_utf8()
            .map_err(|_| anyhow!("Invalid route encoding."))?;
        if matches!(decoded.as_ref(), "." | "..")
            || decoded.contains(['/', '\\', '%'])
            || decoded.chars().any(char::is_control)
        {
            bail!(
                "Invalid route segment. Next step: use the path listed in the Tiendanube API guide."
            );
        }
    }
    let first = path.split('/').nth(1).unwrap_or_default();
    let is_date_version = first.len() == 7
        && first.as_bytes()[4] == b'-'
        && first[..4].bytes().all(|b| b.is_ascii_digit())
        && first[5..].bytes().all(|b| b.is_ascii_digit());
    let is_v_version =
        first.starts_with('v') && first.len() > 1 && first[1..].bytes().all(|b| b.is_ascii_digit());
    if first == "unstable" || is_date_version || is_v_version {
        bail!("The path includes an API version. Next step: put it in the api_version argument.");
    }
    Ok(())
}

pub fn format_error(error: &anyhow::Error, scope: &str) -> String {
    let Some(api) = error.downcast_ref::<ApiError>() else {
        return error.to_string();
    };
    let next = match api.status {
        400 => "Check the example arguments and required User-Agent (tiendanube-mcp configure --user-agent).".to_owned(),
        401 => "Run tiendanube_doctor and authorize the store again with tiendanube-mcp login or configure.".to_owned(),
        402 => "Check the store's plan and payment status in Tiendanube.".to_owned(),
        403 => format!("Enable the permissions for this tool ({scope}) in your app, authorize the store again, and check tiendanube_doctor. Availability can depend on the app or plan."),
        404 => "Verify the ID with the corresponding list tool and check whether your app has access to the resource.".to_owned(),
        409 | 422 => "Review the request fields, item state and official API documentation before retrying.".to_owned(),
        429 => "Wait a few seconds. Before retrying a write, check whether the change took effect.".to_owned(),
        _ => "For a write, check its result in Tiendanube before retrying. Otherwise call tiendanube_doctor.".to_owned(),
    };
    let detail = match api.status {
        400 | 404 | 409 | 422 => api
            .payload
            .get("message")
            .and_then(Value::as_str)
            .filter(|message| {
                !message.contains("access_token") && !message.contains("client_secret")
            })
            .map(|message| {
                format!(
                    "\nAPI message: {}",
                    message.chars().take(800).collect::<String>()
                )
            })
            .unwrap_or_default(),
        _ => String::new(),
    };
    format!(
        "Error {} on {} {}.{detail}\nNext step: {next}",
        api.status, api.method, api.path
    )
}
