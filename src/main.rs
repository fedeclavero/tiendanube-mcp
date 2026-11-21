mod auth;
mod catalog;
mod client;
mod doctor;
mod format;
mod guidance;
mod http;
mod installer;
mod onboarding;
mod server;
mod state;
mod workflows;

use std::process::ExitCode;

use anyhow::Result;
use clap::{Args, Parser, Subcommand, ValueEnum};
use serde_json::json;

#[derive(Parser)]
#[command(
    version,
    about = "Servidor MCP de Tiendanube / Nuvemshop y su instalación guiada (guides/AGENT_INSTALL.md)"
)]
struct Cli {
    /// Alias de compatibilidad para `doctor`.
    #[arg(long, hide = true)]
    check: bool,
    /// Salida JSON para `--check`.
    #[arg(long, hide = true)]
    json: bool,
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand)]
enum Command {
    /// Guía la conexión de Tiendanube / Nuvemshop con Claude Code o Codex.
    Onboard,
    /// Guarda las credenciales de la tienda (ID, token, región y User-Agent).
    #[command(visible_alias = "setup")]
    Configure(onboarding::ConfigureArgs),
    /// Autoriza una aplicación del Portal de Partners mediante OAuth.
    #[command(visible_alias = "authorize")]
    Login(onboarding::LoginArgs),
    /// Arranca el servidor MCP (por defecto stdio).
    Serve(ServeArgs),
    /// Diagnostica la instalación, la tienda y los permisos.
    Doctor(doctor::DoctorArgs),
    /// Registra el servidor en Claude Code y/o Codex.
    Install(installer::InstallArgs),
    /// Quita el servidor de Claude Code y/o Codex.
    Uninstall(installer::UninstallArgs),
    /// Lista el estado de los clientes compatibles (Claude Code y Codex).
    Clients(installer::ClientsArgs),
    /// Muestra o rota el token del transporte HTTP.
    HttpToken(http::TokenArgs),
    /// Imprime la referencia completa de herramientas en Markdown.
    ToolsDoc,
}

#[derive(Clone, ValueEnum)]
enum Transport {
    Stdio,
    Http,
}

#[derive(Args)]
struct ServeArgs {
    #[arg(long, default_value = "stdio")]
    transport: Transport,
    #[arg(long, default_value = "127.0.0.1")]
    host: String,
    #[arg(long, default_value_t = 3000)]
    port: u16,
    #[arg(long = "allowed-host")]
    allowed_hosts: Vec<String>,
}

impl Command {
    fn json(&self) -> bool {
        match self {
            Self::Configure(args) => args.json,
            Self::Login(args) => args.json,
            Self::Doctor(args) => args.json,
            Self::Install(args) => args.json,
            Self::Uninstall(args) => args.json,
            Self::Clients(args) => args.json,
            Self::HttpToken(args) => args.json,
            Self::Onboard | Self::Serve(_) | Self::ToolsDoc => false,
        }
    }

    async fn run(self) -> Result<ExitCode> {
        match self {
            Self::Onboard => return onboarding::guided_install().await,
            Self::Configure(args) => return args.run().await,
            Self::Login(args) => return args.run().await,
            Self::Serve(args) => match args.transport {
                Transport::Stdio => server::Server::new(true)?.stdio().await?,
                Transport::Http => http::serve(&args.host, args.port, args.allowed_hosts).await?,
            },
            Self::Doctor(args) => return args.run().await,
            Self::Install(args) => return args.run().await,
            Self::Uninstall(args) => return args.run().await,
            Self::Clients(args) => return args.run().await,
            Self::HttpToken(args) => args.run()?,
            Self::ToolsDoc => print!("{}", guidance::tool_reference()),
        }
        Ok(ExitCode::SUCCESS)
    }
}

async fn run_default_server() -> Result<ExitCode> {
    if state::env_value("TRANSPORT").is_some_and(|value| value.eq_ignore_ascii_case("http")) {
        let host = state::env_value("HOST").unwrap_or_else(|| "127.0.0.1".to_owned());
        let port = state::env_value("PORT")
            .map(|value| value.parse::<u16>())
            .transpose()?
            .unwrap_or(3000);
        let allowed_hosts = state::env_value("ALLOWED_HOSTS")
            .map(|value| {
                value
                    .split(',')
                    .map(str::trim)
                    .filter(|host| !host.is_empty())
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default();
        http::serve(&host, port, allowed_hosts).await?;
    } else {
        server::Server::new(true)?.stdio().await?;
    }
    Ok(ExitCode::SUCCESS)
}

#[tokio::main]
async fn main() -> ExitCode {
    let cli = Cli::parse();
    let (as_json, result) = if let Some(command) = cli.command {
        (command.json(), command.run().await)
    } else if cli.check {
        (cli.json, doctor::DoctorArgs::check(cli.json).run().await)
    } else {
        (false, run_default_server().await)
    };
    match result {
        Ok(code) => code,
        Err(error) => {
            if as_json {
                println!("{}", json!({"ok": false, "error": error.to_string()}));
            } else {
                eprintln!("{error}");
            }
            ExitCode::FAILURE
        }
    }
}
