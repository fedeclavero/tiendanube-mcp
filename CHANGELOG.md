# Changelog

## 2.0.0

Native Rust rewrite verified against the TypeScript baseline with `rust-anything`, standalone Windows 11 distribution, and full-access onboarding for Claude Code and Codex.

- **Native Rust binaries (zero runtime dependencies)**: rewritten in Rust (`rmcp`, `axum`, `reqwest`/`rustls`, `rust_decimal`, `jsonschema`). Prebuilt binaries for Linux x86-64, macOS Apple Silicon, macOS Intel, and standalone Windows 11 x86-64 (static CRT — no Node.js, Python, Git, Rust, or Visual C++ Redistributable required).
- **Windows 11 guided installer (`Instalar.cmd`)**: extracts and installs into `%LOCALAPPDATA%\Programs\tiendanube-mcp` (no admin rights needed), runs `tiendanube-mcp onboard` to guide full-permission setup, and registers **Claude Code** and/or **Codex (ChatGPT desktop app)**.
- **Full access by default (removed read-only mode)**: all **198 tools** are always available with full read and write access; onboarding and diagnostics guide merchants to enable all available permissions from day one and flag missing write scopes when reported by OAuth.
- **Security & reliability fixes**:
  - Kept OAuth token exchange strictly in the local terminal (`tiendanube-mcp login`) so `access_token` and `client_secret` never pass through the chat; `tiendanube_oauth_exchange_code` redirects agents to the terminal flow.
  - Restricted local image file uploads (`tiendanube_product_image_add_from_file` and `image_files` in `tiendanube_create_combo`) to local `stdio` transport; blocked over HTTP.
  - Hardened Streamable HTTP transport: loopback-only binding, `Host` and `Origin` DNS-rebinding checks, `http-token` management with live rotation revocation, and `DELETE` session compatibility (`200 OK`).
  - Atomic locked credential storage (`0600` on Unix) that clears stale tokens/scopes when switching stores or regions while preserving existing credentials on upgrade.
  - Exact `Decimal` arithmetic for combo prices and weights, stricter image decode dimension/memory limits, and encoded path-traversal blocking (`%2e`, `%2f`, `/vN`, `/YYYY-MM`).
  - Safe config patching for Claude Code (`~/.claude.json` JSONC-preserving) and Codex (`~/.codex/config.toml` comment/table-preserving), automatic migration of legacy `npx` registrations, timestamped backups, and real MCP `stdio` handshake verification before writing.
- **Link-only AI install docs**: updated `README.md`, `README.es.md`, `llms.txt`, and `guides/AGENT_INSTALL.md` so pasting the GitHub link into Claude Code or Codex gives unambiguous download, SHA-256 verification, registration, and verification steps.

## 1.1.0

Install-from-scratch by an AI agent, and agents that actually use the tools.

- **Self-install tooling**: `configure`, `login`, `install`, `doctor`, `clients`, `uninstall`.
- **Credentials**: `~/.config/tiendanube-mcp/credentials.json` (Windows `%APPDATA%\tiendanube-mcp`).
- **Agents use the MCP, not a browser**: `tiendanube_start_here`, `tiendanube_find_tool`, `tiendanube_get_recipe`, `tiendanube_doctor`, `tiendanube_api_request`, `tiendanube_create_combo`, `tiendanube_product_image_add_from_file`.
- **HTTP transport** with required token (`MCP_AUTH_TOKEN`).
- 198 tools (190 API + 8 helpers).

## 1.0.0

- Initial TypeScript release with 191 tools across 9 domains covering 39 Tiendanube / Nuvemshop API resources.
