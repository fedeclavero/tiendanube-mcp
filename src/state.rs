use std::{
    env,
    fs::{self, File, OpenOptions},
    io::{ErrorKind, Read, Write},
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use anyhow::{Context, Result, bail, ensure};
use fs2::FileExt;
use serde_json::{Value, json};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

use crate::client::LATAM_API;

const CREDENTIALS: &str = "credentials.json";
pub(crate) const PENDING: &str = "pending-login.json";
const RECORD_LIMIT: u64 = 1024 * 1024;

pub struct Credentials {
    pub store_id: Option<String>,
    pub access_token: Option<String>,
    pub user_agent: Option<String>,
    pub api_domain: Option<String>,
    pub api_version: Option<String>,
    pub scopes: Option<Vec<String>>,
    pub store_source: &'static str,
    pub token_source: &'static str,
}

fn env_path(name: &str) -> Option<PathBuf> {
    env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

pub(crate) fn config_dir() -> PathBuf {
    if let Some(dir) = env_path("TIENDANUBE_MCP_HOME") {
        return std::path::absolute(&dir).unwrap_or(dir);
    }
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let base = if cfg!(windows) {
        env_path("APPDATA").unwrap_or_else(|| home.join("AppData/Roaming"))
    } else {
        env_path("XDG_CONFIG_HOME").unwrap_or_else(|| home.join(".config"))
    };
    base.join("tiendanube-mcp")
}

pub fn credentials_path() -> PathBuf {
    config_dir().join(CREDENTIALS)
}

fn ensure_dir() -> Result<PathBuf> {
    let dir = config_dir();
    ensure!(
        dir.is_absolute(),
        "La carpeta de estado debe tener una ruta absoluta. Próximo paso: revisá TIENDANUBE_MCP_HOME o la configuración de tu usuario."
    );
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder
        .create(&dir)
        .context("No se pudo crear la carpeta de Tiendanube MCP")?;
    ensure!(
        fs::symlink_metadata(&dir)?.is_dir(),
        "La carpeta de estado debe ser un directorio real. Próximo paso: elegí una carpeta privada con TIENDANUBE_MCP_HOME."
    );
    Ok(dir)
}

fn secure_options() -> OpenOptions {
    let mut options = OpenOptions::new();
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x0020_0000); // FILE_FLAG_OPEN_REPARSE_POINT
    }
    options
}

fn read_from(dir: &Path, name: &str) -> Result<Option<Value>> {
    match fs::symlink_metadata(dir) {
        Ok(metadata) if !metadata.is_dir() => bail!(
            "La carpeta de estado no es un directorio real. Próximo paso: revisá TIENDANUBE_MCP_HOME."
        ),
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error).context("No se pudo leer la carpeta de estado"),
        _ => {}
    }
    let path = dir.join(name);
    let file = match secure_options().read(true).open(&path) {
        Ok(file) => file,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(_) => bail!(
            "No se pudo abrir {name}. Próximo paso: verificá que sea un archivo local y revisá sus permisos."
        ),
    };
    ensure!(
        file.metadata()?.is_file(),
        "{name} debe ser un archivo local."
    );
    let mut raw = Vec::new();
    file.take(RECORD_LIMIT + 1).read_to_end(&mut raw)?;
    ensure!(
        raw.len() as u64 <= RECORD_LIMIT,
        "{name} supera el tamaño admitido."
    );
    let value: Value = serde_json::from_slice(&raw).map_err(|_| {
        anyhow::anyhow!(
            "{name} no es JSON válido. Próximo paso: movelo a una copia privada y repetí la configuración."
        )
    })?;
    ensure!(value.is_object(), "{name} debe contener un objeto JSON.");
    Ok(Some(value))
}

pub(crate) fn load() -> Result<Value> {
    Ok(read_from(&config_dir(), CREDENTIALS)?.unwrap_or_else(|| json!({})))
}

pub(crate) fn str_field<'a>(record: &'a Value, key: &str) -> Option<&'a str> {
    record[key]
        .as_str()
        .filter(|value| !value.trim().is_empty())
}

pub(crate) fn env_value(name: &str) -> Option<String> {
    env::var(name).ok().filter(|value| !value.trim().is_empty())
}

pub(crate) fn scopes_in(value: &Value) -> Option<Vec<String>> {
    let list: Vec<_> = match value {
        Value::String(text) => text
            .split(|c: char| c == ',' || c.is_whitespace())
            .collect(),
        Value::Array(array) => array.iter().filter_map(Value::as_str).collect(),
        _ => return None,
    };
    let mut output: Vec<_> = list
        .into_iter()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .map(str::to_owned)
        .collect();
    output.sort_unstable();
    output.dedup();
    Some(output)
}

pub(crate) fn missing_basic_write_scopes(scopes: &[String]) -> Vec<&'static str> {
    [
        "write_content",
        "write_products",
        "write_customers",
        "write_orders",
        "write_coupons",
        "write_scripts",
        "write_shipping",
    ]
    .into_iter()
    .filter(|required| !scopes.iter().any(|scope| scope == required))
    .collect()
}

fn resolve_field(env_key: &str, stored: &Value, json_key: &str) -> (Option<String>, &'static str) {
    if let Some(value) = env_value(env_key) {
        return (Some(value), "env");
    }
    if let Some(value) = str_field(stored, json_key) {
        return (Some(value.to_owned()), "file");
    }
    (None, "none")
}

pub fn resolve() -> Result<Credentials> {
    let stored = load()?;
    let (store_id, store_source) = resolve_field("TIENDANUBE_STORE_ID", &stored, "storeId");
    let (access_token, token_source) =
        resolve_field("TIENDANUBE_ACCESS_TOKEN", &stored, "accessToken");
    let (user_agent, _) = resolve_field("TIENDANUBE_USER_AGENT", &stored, "userAgent");
    let (api_domain, _) = resolve_field("TIENDANUBE_API_DOMAIN", &stored, "apiDomain");
    let same_store = store_id.as_deref() == str_field(&stored, "storeId");
    let same_api = api_origin(api_domain.as_deref()) == api_origin(str_field(&stored, "apiDomain"));
    ensure!(
        token_source != "file" || (same_store && same_api),
        "La tienda o la región del entorno no coincide con el token guardado. Próximo paso: quitá el valor del entorno o suministrá un token para esa tienda."
    );
    let same_installation =
        same_store && same_api && access_token.as_deref() == str_field(&stored, "accessToken");
    let scopes = (same_installation && access_token.is_some())
        .then(|| scopes_in(&stored["scopes"]))
        .flatten();
    Ok(Credentials {
        store_id,
        access_token,
        user_agent,
        api_domain,
        api_version: env_value("TIENDANUBE_API_VERSION"),
        scopes,
        store_source,
        token_source,
    })
}

fn api_origin(domain: Option<&str>) -> &str {
    domain.unwrap_or(LATAM_API).trim_end_matches('/')
}

pub(crate) struct LockedState {
    dir: PathBuf,
    _file: File,
}

pub(crate) fn lock_in(dir: PathBuf) -> Result<LockedState> {
    let path = dir.join("credentials.lock");
    let file = secure_options()
        .read(true)
        .write(true)
        .create(true)
        .open(path)?;
    ensure!(
        file.metadata()?.is_file(),
        "El bloqueo de credenciales debe ser un archivo."
    );
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        match FileExt::try_lock_exclusive(&file) {
            Ok(()) => return Ok(LockedState { dir, _file: file }),
            Err(error) if error.raw_os_error() == fs2::lock_contended_error().raw_os_error() => {
                if Instant::now() >= deadline {
                    bail!(
                        "Otro proceso está actualizando las credenciales. Próximo paso: esperá unos segundos y reintentá."
                    );
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(error) => {
                return Err(error).context("No se pudo bloquear el archivo de credenciales");
            }
        }
    }
}

pub(crate) fn lock_blocking() -> Result<LockedState> {
    lock_in(ensure_dir()?)
}

pub(crate) fn read_bytes(name: &str) -> std::io::Result<Vec<u8>> {
    let dir = config_dir();
    match fs::symlink_metadata(&dir) {
        Ok(metadata) if !metadata.is_dir() => {
            return Err(std::io::Error::new(
                ErrorKind::InvalidData,
                "La carpeta de estado no es un directorio real.",
            ));
        }
        Err(error) => return Err(error),
        _ => {}
    }
    let file = secure_options().read(true).open(dir.join(name))?;
    if !file.metadata()?.is_file() {
        return Err(std::io::Error::new(
            ErrorKind::InvalidData,
            format!("{name} debe ser un archivo local."),
        ));
    }
    let mut raw = Vec::new();
    file.take(RECORD_LIMIT + 1).read_to_end(&mut raw)?;
    if raw.len() as u64 > RECORD_LIMIT {
        return Err(std::io::Error::new(
            ErrorKind::InvalidData,
            format!("{name} supera el tamaño admitido."),
        ));
    }
    Ok(raw)
}

pub(crate) async fn lock() -> Result<LockedState> {
    tokio::task::spawn_blocking(lock_blocking).await?
}

impl LockedState {
    pub(crate) fn read(&self, name: &str) -> Result<Option<Value>> {
        read_from(&self.dir, name)
    }

    pub(crate) fn write_bytes(&self, name: &str, bytes: &[u8]) -> Result<()> {
        let mut temporary = tempfile::NamedTempFile::new_in(&self.dir)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            temporary
                .as_file()
                .set_permissions(fs::Permissions::from_mode(0o600))?;
        }
        temporary.write_all(bytes)?;
        temporary.as_file().sync_all()?;
        temporary.persist(self.dir.join(name))?;
        #[cfg(unix)]
        File::open(&self.dir)?.sync_all()?;
        Ok(())
    }

    pub(crate) fn write(&self, name: &str, value: &Value) -> Result<()> {
        let mut bytes = serde_json::to_vec_pretty(value)?;
        bytes.push(b'\n');
        self.write_bytes(name, &bytes)
    }

    pub(crate) fn remove(&self, name: &str) -> Result<()> {
        match fs::remove_file(self.dir.join(name)) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error).with_context(|| format!("No se pudo borrar {name}")),
        }
    }

    pub(crate) fn update(&self, patch: &Value) -> Result<PathBuf> {
        let stored = self.read(CREDENTIALS)?.unwrap_or_else(|| json!({}));
        let merged = merge(&stored, patch)?;
        self.write(CREDENTIALS, &merged)?;
        Ok(self.dir.join(CREDENTIALS))
    }
}

fn merge(stored: &Value, patch: &Value) -> Result<Value> {
    let mut fields = stored
        .as_object()
        .cloned()
        .context("Las credenciales deben ser un objeto.")?;
    let changes = patch
        .as_object()
        .context("La actualización debe ser un objeto.")?;
    // Avoid leaving a previous store's credential or OAuth scope metadata paired with a new one.
    let other_store = changes
        .get("storeId")
        .is_some_and(|v| Some(v) != fields.get("storeId"));
    let other_token = changes
        .get("accessToken")
        .is_some_and(|v| Some(v) != fields.get("accessToken"));
    let other_api = changes
        .get("apiDomain")
        .is_some_and(|v| api_origin(v.as_str()) != api_origin(str_field(stored, "apiDomain")));
    if other_store || other_api {
        fields.remove("accessToken");
    }
    if other_store || other_token || other_api {
        for key in ["scopes", "clientId", "clientSecret"] {
            fields.remove(key);
        }
    }
    for (key, value) in changes {
        if value.is_null() {
            fields.remove(key);
        } else {
            fields.insert(key.clone(), value.clone());
        }
    }
    fields.remove("readOnly");
    fields.insert(
        "savedAt".into(),
        json!(OffsetDateTime::now_utc().format(&Rfc3339)?),
    );
    Ok(Value::Object(fields))
}

pub(crate) async fn update(patch: &Value) -> Result<PathBuf> {
    lock().await?.update(patch)
}

pub(crate) fn purge_secrets() -> Result<()> {
    let state = lock_blocking()?;
    state.remove(PENDING)?;
    if state.read(CREDENTIALS)?.is_some() {
        state.update(&json!({"accessToken": null, "clientSecret": null, "scopes": null}))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn store_change_never_reuses_another_stores_token_or_scopes() -> Result<()> {
        let old = json!({
            "storeId": "12", "accessToken": "old", "scopes": ["write_products"],
            "clientId": "1", "clientSecret": "secret", "userAgent": "use this",
            "readOnly": true, "unknownLegacyField": 7
        });
        let next = merge(&old, &json!({"storeId": "42"}))?;
        assert!(next.get("accessToken").is_none());
        assert!(next.get("clientSecret").is_none());
        assert!(next.get("scopes").is_none());
        assert!(next.get("readOnly").is_none());
        assert_eq!(next["unknownLegacyField"], 7);
        assert_eq!(next["userAgent"], "use this");
        assert_eq!(next["storeId"], "42");
        Ok(())
    }

    #[test]
    fn writes_are_atomic_and_leave_private_credentials() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let state = lock_in(dir.path().to_owned())?;
        state.update(&json!({"storeId": "42", "accessToken": "fake"}))?;
        state.update(&json!({"userAgent": "new value"}))?;
        assert_eq!(state.read(CREDENTIALS)?.unwrap()["accessToken"], "fake");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(dir.path().join(CREDENTIALS))?
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        Ok(())
    }
}
