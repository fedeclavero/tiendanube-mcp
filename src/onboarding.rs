use std::{
    io::{self, IsTerminal, Read, Write},
    process::ExitCode,
    time::Duration,
};

use anyhow::{Context, Result, bail, ensure};
use clap::Args;
use serde_json::{Map, Value, json};
use url::Url;

use crate::{
    auth::{self, Attempt, CallbackServer, DEFAULT_PORT, DEFAULT_TIMEOUT, PENDING_TTL, Region},
    client::Api,
    installer::InstallArgs,
    state,
};

const CUSTOM_GUIDE: &str = "https://ayuda.tiendanube.com/es_ES/aplicaciones-a-medida/como-crear-una-aplicacion-a-medida-y-acceder-al-token-en-mi-tiendanube";
const SECRET_GUIDANCE: &str = "Ingresá la credencial en la terminal para que quede oculta, o suministrala por stdin desde un canal seguro.";

#[derive(Args)]
pub struct ConfigureArgs {
    /// Store ID as listed on the custom app page.
    #[arg(long)]
    store_id: Option<String>,
    /// Read the access token from standard input.
    #[arg(long)]
    token_stdin: bool,
    /// tiendanube (Hispanoamérica) or nuvemshop (Brasil).
    #[arg(long, value_parser = auth::parse_region)]
    region: Option<Region>,
    /// Official API origin to use.
    #[arg(long)]
    api_domain: Option<String>,
    /// Application name and contact.
    #[arg(long)]
    user_agent: Option<String>,
    /// Save credentials without making a request to the store.
    #[arg(long)]
    no_verify: bool,
    #[arg(long)]
    pub json: bool,
}

impl ConfigureArgs {
    pub async fn run(self) -> Result<ExitCode> {
        let stored = state::load()?;
        let current_store = state::env_value("TIENDANUBE_STORE_ID")
            .or_else(|| state::str_field(&stored, "storeId").map(str::to_owned));
        let current_token = state::env_value("TIENDANUBE_ACCESS_TOKEN").is_some()
            || state::str_field(&stored, "accessToken").is_some();
        let mut store = self
            .store_id
            .or_else(|| state::env_value("TIENDANUBE_STORE_ID"));
        let mut token = if self.token_stdin {
            Some(stdin_secret("el token de acceso")?)
        } else {
            state::env_value("TIENDANUBE_ACCESS_TOKEN")
        };
        let agent = user_agent(
            self.user_agent
                .or_else(|| state::env_value("TIENDANUBE_USER_AGENT")),
        )?;
        let no_values = store.is_none()
            && token.is_none()
            && self.region.is_none()
            && self.api_domain.is_none()
            && agent.is_none();
        if io::stdin().is_terminal() && !self.json && !self.token_stdin {
            if no_values && current_store.is_none() {
                store = Some(prompt("ID de tu tienda: ")?);
            }
            let replacing_store = store
                .as_deref()
                .is_some_and(|id| Some(id) != current_store.as_deref());
            if (no_values || replacing_store || (store.is_some() && !current_token))
                && token.is_none()
            {
                token = Some(password("Token de acceso (se guarda sin mostrarlo): ")?);
            }
        }

        let mut patch = Map::new();
        let mut saved = Vec::new();
        if let Some(store) = store {
            let store = store.trim();
            auth::validate_id(store, "ID de la tienda")?;
            patch.insert("storeId".into(), json!(store));
            saved.push("store id");
        }
        if let Some(token) = token {
            let token = token.trim();
            validate_secret(token, "token de acceso")?;
            ensure!(
                patch.contains_key("storeId") || current_store.is_some(),
                "Falta el ID de la tienda. Próximo paso: agregá `--store-id` y pasá el token por stdin."
            );
            patch.insert("accessToken".into(), json!(token));
            saved.push("access token");
        }
        let domain = self
            .api_domain
            .as_deref()
            .map(auth::validate_api_domain)
            .transpose()?;
        if let Some(domain) = domain.or_else(|| self.region.map(Region::api_domain)) {
            if let Some(region) = self.region {
                ensure!(
                    domain == region.api_domain(),
                    "La región y el dominio de la API deben corresponder al mismo país."
                );
            }
            patch.insert("apiDomain".into(), json!(domain));
            patch.insert(
                "region".into(),
                json!(if domain == Region::Nuvemshop.api_domain() {
                    Region::Nuvemshop
                } else {
                    Region::Tiendanube
                }),
            );
            saved.push("api domain");
        }
        if let Some(agent) = agent {
            patch.insert("userAgent".into(), json!(agent));
            saved.push("user agent");
        }
        if saved.is_empty() {
            bail!(
                "No hay datos para guardar. Próximo paso: ejecutá `tiendanube-mcp configure --store-id ID` en una terminal, o usá `--token-stdin`."
            );
        }
        let file = state::update(&Value::Object(patch)).await?;
        let report = verify_store(self.no_verify).await;
        let ok = report.as_ref().is_none_or(|r| r["ok"] == true);
        let mut result = json!({"ok": ok, "saved": saved, "file": file});
        let detail = report.as_ref().and_then(|r| r["error"].as_str());
        let mut lines = vec![format!("Saved: {} -> {}", saved.join(", "), file.display())];
        lines.push(if let Some(detail) = detail {
            detail.to_owned()
        } else if self.no_verify {
            "Verification skipped.".into()
        } else {
            "OK: Tiendanube respondió para la tienda configurada.".into()
        });
        if let Some(report) = report {
            result["doctor"] = report;
        }
        if ok {
            lines.push("Próximo paso: registrá el MCP con `install --client claude-code`, `install --client codex` o `install --client antigravity`.".into());
        }
        emit(self.json, &result, &lines)?;
        Ok(exit_code(ok))
    }
}

#[derive(Args)]
pub struct LoginArgs {
    /// App ID listed in the Partner Portal.
    #[arg(long)]
    client_id: Option<String>,
    /// Read the App Secret from standard input.
    #[arg(long, conflicts_with_all = ["start", "redirect_stdin"])]
    client_secret_stdin: bool,
    /// tiendanube (Hispanoamérica) or nuvemshop (Brasil).
    #[arg(long, value_parser = auth::parse_region)]
    region: Option<Region>,
    /// Exact redirect URL registered with Tiendanube.
    #[arg(long, conflicts_with = "port")]
    redirect_uri: Option<String>,
    /// Port for the default local callback.
    #[arg(long)]
    port: Option<u16>,
    /// Seconds to wait for the browser.
    #[arg(long, default_value_t = DEFAULT_TIMEOUT, value_parser = clap::value_parser!(u64).range(1..=900))]
    timeout: u64,
    /// Print a new authorization link and wait for a separate finish command.
    #[arg(long, conflicts_with_all = ["finish", "redirect_stdin", "redirect_url", "code"])]
    start: bool,
    /// Complete an authorization made with --start.
    #[arg(long)]
    finish: bool,
    /// Read the returned URL from standard input.
    #[arg(long, conflicts_with_all = ["redirect_url", "code"])]
    redirect_stdin: bool,
    #[arg(long, hide = true, conflicts_with = "code")]
    redirect_url: Option<String>,
    #[arg(long, hide = true, requires = "state")]
    code: Option<String>,
    #[arg(long, hide = true, requires = "code")]
    state: Option<String>,
    /// Show the URL without opening the browser.
    #[arg(long)]
    no_open: bool,
    #[arg(long)]
    user_agent: Option<String>,
    #[arg(long)]
    no_verify: bool,
    #[arg(long)]
    pub json: bool,
}

impl LoginArgs {
    fn redirect(&self) -> Result<Option<Url>> {
        let candidate = self
            .redirect_uri
            .clone()
            .or_else(|| self.port.map(auth::default_redirect))
            .or_else(|| state::env_value("TIENDANUBE_REDIRECT_URI"));
        candidate
            .as_deref()
            .map(auth::validate_redirect)
            .transpose()
    }

    fn explicit_app_id(&self) -> Option<String> {
        self.client_id
            .clone()
            .or_else(|| state::env_value("TIENDANUBE_CLIENT_ID"))
    }

    fn secret(&self, stored: &Value, attempt: &Attempt) -> Result<String> {
        let env_app = state::env_value("TIENDANUBE_CLIENT_ID");
        let secret = if self.client_secret_stdin {
            stdin_secret("el App Secret")?
        } else if let Some(secret) = env_app
            .as_deref()
            .is_none_or(|id| id == attempt.app_id)
            .then(|| state::env_value("TIENDANUBE_CLIENT_SECRET"))
            .flatten()
        {
            secret
        } else if state::str_field(stored, "clientId") == Some(&attempt.app_id)
            && auth::region_from(stored) == attempt.region
            && let Some(secret) = state::str_field(stored, "clientSecret")
        {
            secret.to_owned()
        } else if io::stdin().is_terminal() {
            password("App Secret (se guarda sin mostrarlo): ")?
        } else {
            bail!("Falta el App Secret. {SECRET_GUIDANCE} Usá `--client-secret-stdin`.");
        };
        let secret = secret.trim();
        validate_secret(secret, "App Secret")?;
        Ok(secret.to_owned())
    }

    pub async fn run(self) -> Result<ExitCode> {
        let stored = state::load()?;
        let redirect = self.redirect()?;
        let agent = user_agent(
            self.user_agent
                .clone()
                .or_else(|| state::env_value("TIENDANUBE_USER_AGENT"))
                .or_else(|| state::str_field(&stored, "userAgent").map(str::to_owned)),
        )?;
        let finish = self.finish
            || self.redirect_stdin
            || self.redirect_url.is_some()
            || self.code.is_some();

        let (attempt, code, secret) = if finish {
            let attempt = Attempt::load().await?;
            ensure!(
                self.explicit_app_id().is_none_or(|id| id == attempt.app_id)
                    && self.region.is_none_or(|region| region == attempt.region)
                    && redirect.as_ref().map(Url::as_str).is_none_or(|url| attempt
                        .redirect()
                        .ok()
                        .is_some_and(|registered| registered.as_str() == url)),
                "Los datos no coinciden con el inicio de sesión pendiente. Próximo paso: iniciá un login nuevo con los datos correctos."
            );
            let secret = self.secret(&stored, &attempt)?;
            let code = if let (Some(code), Some(state)) = (&self.code, &self.state) {
                attempt.validate_code(code, state)?
            } else {
                let returned = if let Some(url) = &self.redirect_url {
                    url.clone()
                } else if self.redirect_stdin {
                    stdin_secret("la URL de retorno")?
                } else if io::stdin().is_terminal() {
                    password("Pegá la URL completa de retorno (no se muestra): ")?
                } else {
                    bail!(
                        "Falta la URL de retorno. Próximo paso: usá `login --finish --redirect-stdin` desde un canal seguro, o ejecutá `login --finish` en una terminal interactiva."
                    );
                };
                attempt.code_from_url(&returned)?
            };
            (attempt, code, secret)
        } else {
            let app_id = if let Some(app_id) = self
                .explicit_app_id()
                .or_else(|| state::str_field(&stored, "clientId").map(str::to_owned))
            {
                app_id
            } else if io::stdin().is_terminal() && !self.json {
                prompt("App ID del Portal de Partners: ")?
            } else {
                bail!(
                    "Falta el App ID. Próximo paso: pasalo con `--client-id`; lo encontrás en el Portal de Partners."
                );
            };
            let region = self.region.unwrap_or_else(|| auth::region_from(&stored));
            let redirect = redirect.unwrap_or(auth::validate_redirect(&auth::default_redirect(
                DEFAULT_PORT,
            ))?);
            let attempt = Attempt::new(app_id.trim(), region, &redirect)?;
            if self.start {
                attempt.save().await?;
                let url = attempt.url();
                let opened = !self.no_open && open::that_detached(&url).is_ok();
                emit(
                    self.json,
                    &json!({
                        "ok": true, "authorize_url": url, "browser_opened": opened, "redirect_uri": redirect.as_str(),
                        "expires_in": PENDING_TTL, "next_step": "Después de aceptar el acceso, ejecutá login --finish y pegá la URL de retorno cuando el programa la pida."
                    }),
                    &[
                        format!("URL de redirección registrada: {redirect}"),
                        format!("Abrí este enlace desde tu tienda y concedé los permisos: {url}"),
                        "Después ejecutá `tiendanube-mcp login --finish` y pegá la URL de retorno."
                            .into(),
                    ],
                )?;
                return Ok(ExitCode::SUCCESS);
            }
            let secret = self.secret(&stored, &attempt)?;
            let callback = CallbackServer::bind(&attempt).await?;
            if callback.is_none() && !io::stdin().is_terminal() {
                bail!(
                    "La redirección necesita ingresar la URL de retorno. Próximo paso: ejecutá `login --start` y después `login --finish --redirect-stdin`."
                );
            }
            attempt.save().await?;
            let url = attempt.url();
            eprintln!("La URL de redirección registrada debe coincidir con {redirect}.");
            eprintln!("Iniciá sesión en la tienda y aceptá el acceso completo:\n{url}");
            if !self.no_open {
                let _ = open::that_detached(&url);
            }
            let code = if let Some(callback) = callback {
                callback.receive(Duration::from_secs(self.timeout)).await?
            } else {
                let returned = password("Pegá la URL completa de retorno (no se muestra): ")?;
                attempt.code_from_url(&returned)?
            };
            (attempt, code, secret)
        };

        let token = attempt.exchange(&code, &secret, agent.as_deref()).await?;
        let missing = token
            .scopes
            .as_deref()
            .map(state::missing_basic_write_scopes)
            .unwrap_or_default();
        let report = verify_store(self.no_verify).await;
        let ok = report.as_ref().is_none_or(|r| r["ok"] == true) && missing.is_empty();
        let mut lines = vec![
            format!(
                "Authorized. Store {}; scopes: {}.",
                token.store_id,
                token
                    .scopes
                    .as_ref()
                    .filter(|v| !v.is_empty())
                    .map_or_else(|| "(not reported)".into(), |v| v.join(", "))
            ),
            format!("Saved to {}.", token.file.display()),
        ];
        if let Some(problem) = report.as_ref().and_then(|r| r["error"].as_str()) {
            lines.push(problem.to_owned());
        }
        if !missing.is_empty() {
            lines.push(format!(
                "Faltan permisos de escritura: {}. Próximo paso: activá todos los permisos disponibles en Datos básicos, reinstalá la app en tu tienda y repetí login.",
                missing.join(", ")
            ));
        }
        if ok {
            lines.push("Próximo paso: registrá el cliente con `install --client claude-code`, `install --client codex` o `install --client antigravity`.".into());
        }
        let mut result = json!({"ok": ok, "storeId": token.store_id, "scopes": token.scopes, "file": token.file, "missingWriteScopes": missing});
        if let Some(report) = report {
            result["doctor"] = report;
        }
        emit(self.json, &result, &lines)?;
        Ok(exit_code(ok))
    }
}

pub(crate) async fn guided_install() -> Result<ExitCode> {
    println!("Tiendanube MCP\n");
    println!(
        "Instalá Claude Code, la app de ChatGPT con Codex o Antigravity, iniciá sesión en el cliente y cerralo antes de continuar."
    );
    println!(
        "1. Claude Code\n2. Codex en la app de ChatGPT\n3. Antigravity\n4. Todos (Claude Code, Codex y Antigravity)\n0. Salir"
    );
    let clients = loop {
        match prompt("Elegí una opción: ")?.as_str() {
            "1" => break vec!["claude-code".into()],
            "2" => break vec!["codex".into()],
            "3" => break vec!["antigravity".into()],
            "4" => {
                break vec!["claude-code".into(), "codex".into(), "antigravity".into()];
            }
            "0" | "" => return Ok(ExitCode::SUCCESS),
            _ => println!("Ingresá 1, 2, 3, 4 o 0."),
        }
    };
    let saved = state::resolve()?;
    let scopes_missing = saved
        .scopes
        .as_deref()
        .is_some_and(|scopes| !state::missing_basic_write_scopes(scopes).is_empty());
    if saved.store_id.is_none() || saved.access_token.is_none() || scopes_missing {
        if scopes_missing {
            println!(
                "La autorización anterior tiene permisos parciales. Actualizá los permisos de la aplicación y volvé a autorizar."
            );
        }
        let region = match prompt("¿Tu tienda es de Brasil (Nuvemshop)? [s/N]: ")?
            .to_lowercase()
            .as_str()
        {
            "s" | "si" | "sí" | "y" | "yes" => Region::Nuvemshop,
            _ => Region::Tiendanube,
        };
        println!("1. Aplicación a medida con token desde el administrador de tu tienda");
        println!("2. Aplicación del Portal de Partners con OAuth\n0. Salir");
        let code = loop {
            match prompt("Elegí cómo conectar tu tienda: ")?.as_str() {
                "1" => {
                    println!(
                        "En el menú del administrador de tu tienda, abrí Aplicaciones a medida y creá una aplicación para Tiendanube MCP."
                    );
                    println!(
                        "En Perfiles de acceso, elegí Acceso total para habilitar todas las operaciones. Guardá la aplicación y usá Revelar para obtener el token. Tiendanube lo muestra completo una sola vez."
                    );
                    println!("Guía oficial: {CUSTOM_GUIDE}");
                    let store = prompt("ID de tu tienda: ")?;
                    auth::validate_id(&store, "ID de la tienda")?;
                    let token = password("Token de acceso (se guarda sin mostrarlo): ")?;
                    validate_secret(&token, "token de acceso")?;
                    state::update(&json!({
                        "storeId": store, "accessToken": token, "region": region, "apiDomain": region.api_domain(),
                    })).await?;
                    let report = verify_store(false).await;
                    if let Some(error) = report.as_ref().and_then(|report| report["error"].as_str())
                    {
                        bail!("{error}");
                    }
                    break ExitCode::SUCCESS;
                }
                "2" => {
                    println!("Abrí {} y creá o editá tu aplicación.", region.portal());
                    println!(
                        "En Datos básicos activá todos los permisos disponibles, con escritura para las operaciones que la admiten. Si ya estaba instalada, reinstalala en la tienda para emitir un token con los permisos nuevos."
                    );
                    println!(
                        "Registrá la URL de redirección de tu aplicación. Podés probar {} si el portal admite un retorno local. Si no, usá una URL HTTPS bajo tu control.",
                        auth::default_redirect(DEFAULT_PORT)
                    );
                    let _ = open::that_detached(region.portal());
                    let redirect = prompt(
                        "URL de redirección que registraste (Enter para usar el retorno local): ",
                    )?;
                    break LoginArgs {
                        client_id: None,
                        client_secret_stdin: false,
                        region: Some(region),
                        redirect_uri: (!redirect.is_empty()).then_some(redirect),
                        port: None,
                        timeout: DEFAULT_TIMEOUT,
                        start: false,
                        finish: false,
                        redirect_stdin: false,
                        redirect_url: None,
                        code: None,
                        state: None,
                        no_open: false,
                        user_agent: None,
                        no_verify: false,
                        json: false,
                    }
                    .run()
                    .await?;
                }
                "0" | "" => return Ok(ExitCode::SUCCESS),
                _ => println!("Ingresá 1, 2 o 0."),
            }
        };
        if code != ExitCode::SUCCESS {
            return Ok(code);
        }
    }
    InstallArgs::for_clients(clients).run().await
}

async fn verify_store(skip: bool) -> Option<Value> {
    if skip {
        return None;
    }
    let result = Api::new()
        .request("GET", "/store", None, &Value::Null, None)
        .await;
    Some(match result {
        Ok(result) => json!({"ok": true, "store": {
            "id": result.data["id"], "name": result.data["name"], "plan": result.data["plan_name"],
            "country": result.data["country"], "currency": result.data["main_currency"]
        }}),
        Err(error) => json!({
            "ok": false,
            "error": format!("No se pudo verificar la tienda: {error}. Próximo paso: ejecutá `tiendanube-mcp doctor` y corregí la conexión.")
        }),
    })
}

fn user_agent(candidate: Option<String>) -> Result<Option<String>> {
    candidate
        .map(|value| {
            let value = value.trim();
            ensure!(
                !value.is_empty() && reqwest::header::HeaderValue::from_str(value).is_ok(),
                "El User-Agent no es válido."
            );
            Ok(value.to_owned())
        })
        .transpose()
}

fn validate_secret(secret: &str, label: &str) -> Result<()> {
    ensure!(
        !secret.is_empty()
            && secret.len() <= 16 * 1024
            && !secret.chars().any(char::is_whitespace)
            && !secret.chars().any(char::is_control),
        "El {label} no es válido. Próximo paso: copialo completo desde el portal de Tiendanube y volvé a ingresarlo."
    );
    Ok(())
}

fn stdin_secret(label: &str) -> Result<String> {
    let mut text = String::new();
    io::stdin()
        .take(32 * 1024)
        .read_to_string(&mut text)
        .with_context(|| format!("No se pudo leer {label} por stdin."))?;
    let value = text.trim();
    ensure!(
        !value.is_empty() && text.len() < 32 * 1024,
        "Ingresá {label} completo por stdin."
    );
    Ok(value.to_owned())
}

fn prompt(label: &str) -> Result<String> {
    print!("{label}");
    io::stdout().flush()?;
    let mut input = String::new();
    io::stdin().read_line(&mut input)?;
    Ok(input.trim().to_owned())
}

fn password(label: &str) -> Result<String> {
    ensure!(io::stdin().is_terminal(), "{SECRET_GUIDANCE}");
    Ok(rpassword::prompt_password(label)?.trim().to_owned())
}

fn emit(json_mode: bool, data: &Value, lines: &[String]) -> Result<()> {
    if json_mode {
        println!("{}", serde_json::to_string_pretty(data)?);
    } else {
        for line in lines {
            println!("{line}");
        }
    }
    Ok(())
}

fn exit_code(ok: bool) -> ExitCode {
    if ok {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
