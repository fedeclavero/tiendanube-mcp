# Agent install guide: connect the Tiendanube MCP server

> **This file is written for AI coding agents** (Claude Code, OpenAI Codex, OpenCode, Gemini CLI, Cursor, Windsurf, Copilot agent mode, …). A human asked you to install the Tiendanube MCP server and connect it to their store. Follow the steps in order. **Talk to the user in the language they use** (the questions below are given in English and Spanish).

Project: <https://github.com/fedeclavero/tiendanube-mcp> · Install source: `github:fedeclavero/tiendanube-mcp` · Binary: `tiendanube-mcp`

## Hard rules

1. **Never ask for the user's Tiendanube admin email/password.** You only need a *Store ID* and an *access token* (plus optional values listed below).
2. **Treat the access token as a secret.** Never echo it back, never put it in a file inside a git repository, never commit it, never print it in logs or summaries. Write it only into the MCP client's *user-level* config (or an env var the user sets).
3. **Default to read-only** (`TIENDANUBE_READ_ONLY=true`) unless the user explicitly asks for write access. Explain how to switch later.
4. **Do not modify the store while verifying.** Verification uses read-only calls only (`--check`, `tiendanube_store_get`).
5. If something is unclear (region, which client, where the token is), **ask** instead of guessing.

## Step 1 — Check prerequisites

```bash
node --version    # must be >= 18
npm --version
```

If Node is missing or older than 18, tell the user and offer to install a current LTS release from <https://nodejs.org>. Do not continue until `node -v` ≥ 18.

## Step 2 — Collect the connection data from the user

Ask for the following, one short message (not an interrogation). Skip anything you already know.

| # | Data | Env var | Ask (EN) | Pregunta (ES) | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | Region | `TIENDANUBE_API_DOMAIN` | "Is your store on Tiendanube (Argentina, México, Chile, Colombia, …) or Nuvemshop (Brazil)?" | "¿Tu tienda es de Tiendanube (Argentina, México, Chile, Colombia…) o Nuvemshop (Brasil)?" | Tiendanube → omit (default `https://api.tiendanube.com`). Brazil → `https://api.nuvemshop.com.br` |
| 2 | **Store ID** | `TIENDANUBE_STORE_ID` | "What is your store ID (a number)?" | "¿Cuál es el ID de tu tienda (un número)?" | Required. Shown next to the token when creating a custom app; for OAuth apps it's the `user_id` |
| 3 | **Access token** | `TIENDANUBE_ACCESS_TOKEN` | "Please provide your access token. If you prefer not to paste it in this chat, I'll show you the exact command to run yourself." | "Pasame tu access token. Si preferís no pegarlo en este chat, te muestro el comando exacto para que lo ejecutes vos." | Required. See *Secret handling* below |
| 4 | Contact for the User-Agent | `TIENDANUBE_USER_AGENT` | "What name and contact email should identify this integration to Tiendanube? (e.g. `MyStore (me@example.com)`)" | "¿Qué nombre y email de contacto identifican esta integración ante Tiendanube? (ej. `MiTienda (yo@ejemplo.com)`)" | The API rejects requests without a User-Agent. Format `AppName (email)`. If the user declines, use `TiendanubeMCP (<their git email>)` only if they agree |
| 5 | Access mode | `TIENDANUBE_READ_ONLY` | "Do you want read-only access (safest; I can look but not change anything) or read & write?" | "¿Querés acceso de solo lectura (lo más seguro: puedo consultar pero no cambiar nada) o lectura y escritura?" | Default: read-only → `true` |

If the user **doesn't have a token yet**, send them to [GETTING_CREDENTIALS.md](GETTING_CREDENTIALS.md) (ES/EN) and offer to wait. Do **not** attempt to log into their admin panel or scrape it.

**Only for OAuth/partner apps** (rare; the user will tell you): `client_id`, `client_secret` and the one-time `code` → use the `tiendanube_oauth_exchange_code` tool (env `TIENDANUBE_CLIENT_ID`/`TIENDANUBE_CLIENT_SECRET`) to obtain the token and store ID.

### Secret handling

Prefer, in this order:

1. **User runs the command themselves.** Print the full command with a placeholder (`PASTE_TOKEN_HERE`) and let them paste the token in their own terminal. The token never enters this conversation.
2. **User pastes the token to you.** Use it once to write the user-level client config, then do not repeat it. Suggest rotating the token if the conversation is logged or shared.
3. Never store it in project files (`.mcp.json`, `opencode.json` inside a repo, `.env` that is not git-ignored).

## Step 3 — Pre-warm the install (avoids client time-outs)

The first `npx` run downloads and builds the project (~30 s). Do it once now:

```bash
npx -y github:fedeclavero/tiendanube-mcp --version
```

Expected output: a version number such as `1.0.0`. If it fails, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Step 4 — Verify the credentials before touching any client config

Run with the real values (set them as environment variables for this one command; do not save them in shell history if you can avoid it, e.g. prefix the command with a space or use `read -s`):

```bash
TIENDANUBE_STORE_ID=<id> TIENDANUBE_ACCESS_TOKEN=<token> \
TIENDANUBE_USER_AGENT="<name (email)>" \
npx -y github:fedeclavero/tiendanube-mcp --check
```

(Add `TIENDANUBE_API_DOMAIN=https://api.nuvemshop.com.br` for Brazil.)

- `OK: connected to Tiendanube` + store name → continue.
- `401 Unauthorized` → wrong/rotated token or store ID. Ask the user to re-check both.
- `400 Bad Request` → bad User-Agent value.
- `402` → the store has an unpaid plan; API access is suspended.
- Network error → proxy/firewall; see troubleshooting.

## Step 5 — Register the MCP server in the user's client

Identify **which client you are running in** (or which client the user wants) and use the matching entry. Use the **user/global scope**, not a repo-level file, so the token stays out of version control. Command line: `npx -y github:fedeclavero/tiendanube-mcp`.

### Client configs

**Claude Code**

```bash
claude mcp add tiendanube --scope user \
  -e TIENDANUBE_STORE_ID=<id> \
  -e TIENDANUBE_ACCESS_TOKEN=<token> \
  -e TIENDANUBE_USER_AGENT="<name (email)>" \
  -e TIENDANUBE_READ_ONLY=true \
  -- npx -y github:fedeclavero/tiendanube-mcp
claude mcp list        # should show tiendanube as connected
```

**OpenAI Codex (CLI / IDE extension)**

```bash
codex mcp add tiendanube \
  --env TIENDANUBE_STORE_ID=<id> \
  --env TIENDANUBE_ACCESS_TOKEN=<token> \
  --env TIENDANUBE_USER_AGENT="<name (email)>" \
  --env TIENDANUBE_READ_ONLY=true \
  -- npx -y github:fedeclavero/tiendanube-mcp
```

Equivalent manual edit of `~/.codex/config.toml`:

```toml
[mcp_servers.tiendanube]
command = "npx"
args = ["-y", "github:fedeclavero/tiendanube-mcp"]
startup_timeout_sec = 90   # first launch builds the project

[mcp_servers.tiendanube.env]
TIENDANUBE_STORE_ID = "<id>"
TIENDANUBE_ACCESS_TOKEN = "<token>"
TIENDANUBE_USER_AGENT = "<name (email)>"
TIENDANUBE_READ_ONLY = "true"
```

**OpenCode** — user-level file `~/.config/opencode/opencode.json` (create or merge; do not overwrite other keys):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "tiendanube": {
      "type": "local",
      "command": ["npx", "-y", "github:fedeclavero/tiendanube-mcp"],
      "enabled": true,
      "environment": {
        "TIENDANUBE_STORE_ID": "<id>",
        "TIENDANUBE_ACCESS_TOKEN": "<token>",
        "TIENDANUBE_USER_AGENT": "<name (email)>",
        "TIENDANUBE_READ_ONLY": "true"
      }
    }
  }
}
```

**Gemini CLI** — `~/.gemini/settings.json` (merge into `mcpServers`):

```json
{
  "mcpServers": {
    "tiendanube": {
      "command": "npx",
      "args": ["-y", "github:fedeclavero/tiendanube-mcp"],
      "env": {
        "TIENDANUBE_STORE_ID": "<id>",
        "TIENDANUBE_ACCESS_TOKEN": "<token>",
        "TIENDANUBE_USER_AGENT": "<name (email)>",
        "TIENDANUBE_READ_ONLY": "true"
      },
      "timeout": 90000
    }
  }
}
```

**Claude Desktop** — `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`, Linux: `~/.config/Claude/`). Merge into `mcpServers` using the generic block below. **Windows:** use `"command": "cmd", "args": ["/c", "npx", "-y", "github:fedeclavero/tiendanube-mcp"]`. Restart the app fully.

**Cursor** — `~/.cursor/mcp.json` (user-level). **Windsurf** — `~/.codeium/windsurf/mcp_config.json`. Both use the generic block:

```json
{
  "mcpServers": {
    "tiendanube": {
      "command": "npx",
      "args": ["-y", "github:fedeclavero/tiendanube-mcp"],
      "env": {
        "TIENDANUBE_STORE_ID": "<id>",
        "TIENDANUBE_ACCESS_TOKEN": "<token>",
        "TIENDANUBE_USER_AGENT": "<name (email)>",
        "TIENDANUBE_READ_ONLY": "true"
      }
    }
  }
}
```

**VS Code (GitHub Copilot agent mode)** — user `mcp.json` (Command Palette → *MCP: Open User Configuration*). Note the key is `servers` and `type` is required:

```json
{
  "servers": {
    "tiendanube": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "github:fedeclavero/tiendanube-mcp"],
      "env": {
        "TIENDANUBE_STORE_ID": "<id>",
        "TIENDANUBE_ACCESS_TOKEN": "<token>",
        "TIENDANUBE_USER_AGENT": "<name (email)>",
        "TIENDANUBE_READ_ONLY": "true"
      }
    }
  }
}
```

**Any other MCP client:** it needs a *stdio* server with command `npx`, args `["-y","github:fedeclavero/tiendanube-mcp"]` and the env vars above. Check that client's documentation for where the config lives.

**Brazil / Nuvemshop:** add `TIENDANUBE_API_DOMAIN` = `https://api.nuvemshop.com.br` to the env block.

When editing JSON/TOML config files: **read the file first, merge, preserve existing servers/keys, and keep a backup** (`cp file file.bak`) if it already exists. Restrict file permissions where relevant (`chmod 600`).

## Step 6 — Restart and verify

Most clients load MCP servers at startup. Tell the user to restart/reload the client (new session in CLI agents; `/mcp` in Claude Code to inspect status). Then, in the new session, run a **read-only** smoke test:

1. Call `tiendanube_store_get` → expect store name, languages, currency, plan.
2. Call `tiendanube_products_list` with `per_page: 3` → expect up to 3 products (a 403 here means the token lacks `read_products`: tell the user which scope to add; see [GETTING_CREDENTIALS.md](GETTING_CREDENTIALS.md#scopes)).

If you cannot restart yourself, say clearly: *"Installed and verified with `--check`. Restart your client, then ask me to show your store info to confirm."*

## Step 7 — Report back

Give the user a short summary: what was installed, where the config lives (path only, **no token**), mode (read-only/read-write), the verified store name, and 3 starter prompts, for example:

- "Show my 10 most recent orders and their payment status."
- "Which products have stock below 5?"
- "Which paid orders are still unshipped?"

More ideas: [RECIPES.md](RECIPES.md). Mention how to enable writes later: remove `TIENDANUBE_READ_ONLY` (or set it to `false`) and restart, and that the token needs the matching `write_*` scopes.

## Guidance for using the tools well (after install)

- Call `tiendanube_store_get` first to learn the store's **languages**: text fields (`name`, `description`, `handle`, …) are objects like `{"es": "…", "pt": "…"}`.
- **Price, SKU, weight and stock live on variants**, not on products. Update stock with `tiendanube_variants_update_stock`; use `tiendanube_products_batch_stock_price` for bulk changes (cheaper on the rate limit).
- **Order list cap:** `page * per_page <= 10000`. For long ranges, slice by `created_at_min` / `created_at_max` or use `since_id`.
- **64-bit IDs:** order line IDs exceed int32 — always pass them as strings.
- **List tools** return `{count, page, per_page, has_more, next_page, items}`. Use `fields` to keep payloads small.
- **Before any destructive or bulk write** (delete, cancel, price changes across many products): state what you'll do, how many records are affected, and get the user's explicit confirmation. Suggest exporting current values first.
- A **403** names the missing OAuth scope; a **402** means the store's plan is unpaid; **429** is retried automatically.
- Reference docs ship with the server: read the MCP resources `tiendanube://docs/scopes-and-limits` and `tiendanube://docs/checkout-sdk`.

## If something fails

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md). If the problem looks like a bug in the server, suggest the user open an issue at <https://github.com/fedeclavero/tiendanube-mcp/issues> (and remind them to redact the token).
