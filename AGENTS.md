# AGENTS.md

## 1. If a user asked you to install, update, or connect this MCP server

The end user is typically non-technical and may be afraid to open a terminal or edit files. Execute [guides/AGENT_INSTALL.md](guides/AGENT_INSTALL.md) end-to-end yourself on the machine running **Claude Code**, **Codex**, or **Antigravity** (Desktop or `agy`) — never hand shell commands back to the user:

1. **Check for existing credentials first (`%APPDATA%\tiendanube-mcp\credentials.json` on Windows, `~/.config/tiendanube-mcp/credentials.json` on Linux/macOS).** If updating an existing installation, **NEVER rotate keys, create a new app, or re-authorize**: download and verify the latest release binary, replace the executable, run `tiendanube-mcp doctor --no-probe --json`, and run `tiendanube-mcp install --client <claude-code|codex|antigravity|all> --json`.
2. For a fresh install, ask permission **once** in plain friendly language, explaining that you will guide them step-by-step to obtain credentials with **full read and write access** (there is no read-only mode), ask them for the keys, save and handle them locally yourself, and configure their AI app without them opening any terminal.
3. Identify which client received the request (`claude-code`, `codex`, `antigravity`, `agy`, or `all`), download the native release binary and `SHA256SUMS.txt` from [GitHub Releases](https://github.com/fedeclavero/tiendanube-mcp/releases/latest), verify the SHA-256 hash, extract into a stable user folder (`%LOCALAPPDATA%\Programs\tiendanube-mcp` on Windows, `~/.local/bin` on macOS/Linux), and confirm `tiendanube-mcp --version`.
4. If no valid credentials exist yet, guide the merchant click-by-click ([guides/GETTING_CREDENTIALS.md](guides/GETTING_CREDENTIALS.md)) to enable **ALL available read and write permissions**, ask them for the credentials, and save them yourself via `tiendanube-mcp configure --store-id <ID> --token-stdin --json` or `tiendanube-mcp login --client-id <APP_ID> --client-secret-stdin --json` (cleaning temp variables right after; never commit keys or repeat them in your final summary).
5. Register the server using `tiendanube-mcp install --client <claude-code|codex|antigravity|agy|all> --json` (never edit JSON/TOML client configs by hand). Verify `ok: true` and `launch_check.ok: true`.
6. Run `tiendanube-mcp doctor --json` and fix any `nextSteps` yourself. Tell the user simply to close and reopen their AI app (or press *Refresh* in Antigravity), then call `tiendanube_start_here` and `tiendanube_store_get`.

## 2. If this MCP is already connected and you must work on the user's store

**Use the `tiendanube_*` tools. Do not open a browser, `agent-browser`, Playwright, or the admin panel for store tasks.**

| The user asks for... | Call |
| --- | --- |
| anything, not sure which tool | `tiendanube_start_here`, then `tiendanube_find_tool {"query":"..."}` |
| a multi-step job | `tiendanube_get_recipe {"id":"..."}` (`combo`, `bulk-price`, `stock`, `create-product`, `images`, `seo`, `coupon`, `orders-to-ship`, ...) |
| combos / packs / kits from existing products (with images) | `tiendanube_create_combo` (generate the picture with your image tool, pass the local path in `image_files`) |
| upload an image file | `tiendanube_product_image_add_from_file` |
| products, stock, prices, orders, customers, coupons, pages, webhooks | the matching `tiendanube_*` tool |
| something no tool covers | `tiendanube_api_request` |
| any error / 401 / 403 | read `Next step:` in the error; setup problems: `tiendanube_doctor` |

Rules: i18n text fields are language objects (`{"es": "..."}`); price, SKU, weight, and stock live on **variants**; new products and combos are created as drafts (`published: false`), ask before publishing; before deleting or changing many records explain what will change and how many items are affected, then proceed once the owner agrees.

## 3. If you are working on this repository

- Stack: Rust (edition 2024, MSRV 1.89), `rmcp` 3.11, `axum` 0.8, `reqwest` 0.13 (`rustls`), `jsonschema` 0.46, `rust_decimal`, `image`, `clap` 4.
- Quality checks:
  - `cargo fmt --all -- --check`
  - `cargo clippy --locked --all-targets -- -D warnings`
  - `cargo test --locked --all-targets`
  - `cargo package --locked --no-verify`
- Layout:
  - `src/main.rs` — CLI entry point (`serve`, `onboard`, `configure`, `login`, `install`, `uninstall`, `clients`, `doctor`, `http-token`, `tools-doc`) and default stdio/HTTP dispatch.
  - `src/server.rs` — MCP server (`rmcp`), JSON Schema input validation + defaults, 198 tool dispatch, 4 Markdown resources.
  - `src/http.rs` — Streamable HTTP transport (loopback-only, `Host`/`Origin` validation, Bearer + `/mcp/{token}` + `/t/{token}/mcp`, token rotation, local files disabled).
  - `src/client.rs` — Tiendanube/Nuvemshop HTTPS client (dual auth headers, leaky-bucket rate-limit pacing, safe GET-only 429 retries, secret stripping, route validation).
  - `src/catalog.rs` — Declarative catalog runner backed by `src/data/endpoints.json` and `src/data/mcp_contract.json`.
  - `src/guidance.rs` — `tiendanube_start_here`, `tiendanube_find_tool`, `tiendanube_get_recipe`, resources, and `tools-doc` generator backed by `src/data/guidance.json`.
  - `src/workflows.rs` — `tiendanube_create_combo` (exact `Decimal` math, HTML escaping, draft by default) and `tiendanube_product_image_add_from_file` (magic-byte + decode limits, stdio-only).
  - `src/state.rs`, `src/auth.rs`, `src/onboarding.rs`, `src/doctor.rs`, `src/installer.rs` — Private credential storage (`0600`, atomic lock), OAuth flow, guided onboarding, diagnostics, and Claude Code / Codex / Antigravity (`agy`) registration (preserving comments/settings/env with backups and stdio verification).
  - `packaging/windows/` — Standalone Windows 11 `Instalar.cmd` and `smoke-test.ps1`.
- Rules: no secrets in code, logs, or chat; stdio server writes logs to stderr only; keep `README.md` and `README.es.md` in sync; keep full read-write mode (no read-only mode); error messages must end with an actionable next step.
