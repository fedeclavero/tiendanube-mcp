# Changelog

## 1.1.0

Install-from-scratch by an AI agent, and agents that actually use the tools.

- **Self-install tooling**: `configure` (save credentials once to a private user-level file shared by every AI app), `login` (OAuth with a local callback, plus a paste-the-redirect-URL fallback), `install --client ...` (Claude Code, Claude Desktop, Codex, Gemini CLI, Cursor, Windsurf, VS Code, OpenCode, Antigravity, Cline; merge without touching other servers, timestamped backup, idempotent, Windows aware), `doctor` (credential source, store, missing read permissions, exact next steps), `clients`, `uninstall`. Everything is non-interactive and supports `--json`.
- **Credentials**: env vars still win; otherwise the server reads `~/.config/tiendanube-mcp/credentials.json` (Windows `%APPDATA%\tiendanube-mcp`). Client configs no longer need secrets. Default mode is read-write; read-only is opt-in.
- **Agents use the MCP, not a browser**: server `instructions` on initialize, new entry-point tools `tiendanube_start_here`, `tiendanube_find_tool` (Spanish or English), `tiendanube_get_recipe`, `tiendanube_doctor`, last-resort `tiendanube_api_request` (fixed origin, path validated), resources `tiendanube://guide/*`. Every API tool description now leads with "use this tool, not the browser or the admin panel" and the main tools carry exact example arguments (validated against their schemas in the tests).
- **Workflows**: `tiendanube_create_combo` (combo/pack from existing products with computed price and stock, draft by default, dry run, warnings about the API limits for Kits) and `tiendanube_product_image_add_from_file` (upload a local image; verified by file signature).
- **Errors** now end with a concrete `Next step:`.
- **HTTP transport** now requires a token (`MCP_AUTH_TOKEN`, or one is generated): `Authorization: Bearer` or `/mcp/<token>`; needed to expose it safely through a tunnel (ChatGPT connectors).
- 198 tools (190 API + 8 helpers), 83 in read-only mode. New tests: `npm test` also runs the setup test suite.
- Docs: rewritten agent install guide and credentials guide (all scopes, OAuth, plan B), recipes for combos and images.

## 1.0.0

- 191 tools across 9 domains (190 API tools + OAuth helper) covering 39 Tiendanube / Nuvemshop API resources, including `unstable` resources.
- Dual auth headers, per-tool API versioning, leaky-bucket rate-limit handling, actionable error messages (403 names the missing scope).
- Read-only mode, pagination envelope, `fields` filter, JSON/Markdown output, 25 000-character guard.
- stdio and stateless streamable HTTP transports; `--check`, `--version`, `--help`.
- Documentation resources, bilingual README, agent install guide, credentials guide, prompt recipes, troubleshooting.
