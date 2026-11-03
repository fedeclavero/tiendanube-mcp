# Agent install guide: connect the Tiendanube MCP server

> **You are an AI agent and a person asked you to install or connect this MCP server to their Tiendanube / Nuvemshop store. Do the whole setup yourself.** The person usually knows nothing about tokens, scopes or config files, so never hand a step back with "do it yourself". Ask only for the few values you cannot get alone, then place them yourself. Talk in the language the person uses.

Project: <https://github.com/fedeclavero/tiendanube-mcp> · Run it with: `npx -y github:fedeclavero/tiendanube-mcp <command>`

Setup commands (all non-interactive, all safe to re-run): `configure`, `login`, `install`, `doctor`, `clients`, `uninstall`.

## Step 0. Ask permission once

Say this (translate it), then wait for a yes:

> "To connect your store I need to see and save your Tiendanube keys on this computer, and add the Tiendanube connector to your AI app's configuration. Do you allow me to do that?"

After the yes you may read, request and write the keys and the client configuration **without asking again**. Hygiene that always applies: never commit a key to git, never paste it into a public place, and do not repeat it in your final summary.

## Step 1. Check Node.js

```bash
node --version    # must be v18 or newer
```

Missing or older? Offer to install it, then do it:

| System | Command |
| --- | --- |
| Windows | `winget install OpenJS.NodeJS.LTS` (then open a new terminal) |
| macOS | `brew install node` (or the installer from <https://nodejs.org>) |
| Linux | your package manager (`apt install nodejs npm`) or <https://nodejs.org> |

**npm 12 or newer refuses to download packages from GitHub by default** (`EALLOWGIT: Fetching packages of type "git" have been disabled`). Check with `npm --version`. If you see that error, run every `npx` command of this guide with the variable `npm_config_allow_git=all` (Linux/macOS: `npm_config_allow_git=all npx -y github:fedeclavero/tiendanube-mcp ...`; PowerShell: `$env:npm_config_allow_git="all"` first). To make AI apps able to launch the connector, also make it permanent with `npm config set allow-git all`.

## Step 2. Get the credentials

Tell the person, in simple words, that you need two things and that you will guide them click by click. Follow [GETTING_CREDENTIALS.md](GETTING_CREDENTIALS.md). Choose the route:

- **Route A (simplest): custom app in the store admin.** The admin shows a **Store ID** and an **Access token**. Ask the person to paste both to you.
- **Route B: partner app.** Needs an **App ID** and an **App secret**; the `login` command (Step 3B) turns them into the token automatically.

**Core rule: OMNIPOTENCE AND PLUG & PLAY (FULL PERMISSIONS).**
The user must have an effortless, total-power experience where the AI can execute any task without hitting permission barriers.
- **You MUST ensure ALL permissions (scopes) are checked:** read and write across every single resource (products, orders, customers, coupons, shipping, payments, drafts, content, webhooks). Not a single permission left unchecked.
- **If the user knows the keys:** ask them to paste their Store ID and Access Token (or App ID + Secret).
- **If the user does not know how to get them:** guide them click by click. Open the portal page for them (`xdg-open <url>` on Linux, `open <url>` on macOS, `start <url>` on Windows).
- **If the user does not understand or cannot do it:** YOU, AS THE AI AGENT, MUST USE YOUR BROWSER TOOL (Agent Browser, Playwright, or browser navigation) to navigate to the store admin or partner portal, create the custom app, actively tick EVERY single read and write permission checkbox, copy the keys, and configure the MCP automatically. The user only needs to log in if requested. That ensures a 100% Plug & Play setup.

## Step 3. Save the credentials

### 3A. You have a Store ID and an Access token

```bash
npx -y github:fedeclavero/tiendanube-mcp configure --store-id <STORE_ID> --token <ACCESS_TOKEN>
```

- Brazil / Nuvemshop: add `--region nuvemshop`.
- Optional contact for Tiendanube (a good habit, not required): `--user-agent "MyStore (owner@email.com)"`.
- Keep the token out of the process list: `--token-stdin` (pipe the token in) or set `TIENDANUBE_ACCESS_TOKEN` first.

It saves the keys once to the user-level file `~/.config/tiendanube-mcp/credentials.json` (Windows: `%APPDATA%\tiendanube-mcp\`) with private permissions, and every AI app on the machine shares it. Then it checks the connection and prints the store name.

### 3B. You have an App ID and an App secret (OAuth)

1. Tell the person to set the app's **Redirect URL** to exactly `http://localhost:8765/callback`.
2. Run, in the background (it waits for the person):

```bash
npx -y github:fedeclavero/tiendanube-mcp login --client-id <APP_ID> --client-secret <APP_SECRET>
```

3. It prints an authorization link and opens it. Make sure the person opens it and accepts. The command then finishes by itself: it exchanges the code, learns the Store ID, saves the token and the granted scopes, and verifies the connection.
4. **Plan B**, if the portal does not accept `localhost` as redirect: set any redirect URL, accept the permissions, ask the person to paste you the full address the browser ended on (it contains `?code=...`, valid about 5 minutes) and run:

```bash
npx -y github:fedeclavero/tiendanube-mcp login --client-id <APP_ID> --client-secret <APP_SECRET> --redirect-url "<PASTED ADDRESS>"
```

## Step 4. Register the connector in the person's AI app

```bash
npx -y github:fedeclavero/tiendanube-mcp install --client all
```

`all` configures every supported app found on the machine. To target one: `--client claude-code` (or `claude-desktop`, `codex`, `gemini-cli`, `cursor`, `windsurf`, `vscode`, `opencode`, `antigravity`, `cline`; several with commas). List what exists with `... clients`. Never edit the config files by hand: the command merges without touching other servers, writes a timestamped backup next to the file, and is safe to repeat.

| Client | What `install` does | Confidence |
| --- | --- | --- |
| Claude Code | runs `claude mcp add --scope user` (edits `~/.claude.json` if the CLI is missing) | documented |
| Claude Desktop | `claude_desktop_config.json` | documented |
| Codex (CLI / IDE / app) | `~/.codex/config.toml` table `mcp_servers.tiendanube`, 90 s startup timeout | documented |
| Gemini CLI | `~/.gemini/settings.json` | documented |
| Cursor | `~/.cursor/mcp.json` | documented |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | documented |
| VS Code (Copilot) | user `mcp.json`, key `servers` | documented |
| OpenCode | `~/.config/opencode/opencode.json`, key `mcp` | documented |
| Antigravity | `~/.gemini/config/mcp_config.json` | path from Google's codelab; stdio fields follow the common format, not confirmed in its own docs |
| Cline | `cline_mcp_settings.json` in the VS Code extension storage | inferred from the extension layout |
| Anything else | `install --client generic` prints a standard stdio snippet | works in any stdio MCP client |

Windows apps are configured with `cmd /c npx ...` automatically.

## Step 5. Verify, restart, smoke test

```bash
npx -y github:fedeclavero/tiendanube-mcp doctor
```

It must start with `OK`. It lists the store, the active credentials (never the secret) and which read permissions are missing. Every problem comes with a `NEXT STEP:` line: **do it yourself**. Typical ones:

- `401`: wrong or replaced token. Ask for a new one and re-run `configure`.
- Missing permission (`403`): the person must tick all permissions in the app and you re-authorize (`login`, or copy the new token and `configure`). Scopes only apply to new tokens.

Then tell the person to **fully close and reopen** their AI app (that is when it loads the connector). In the new session call `tiendanube_start_here`, then `tiendanube_store_get`. If you cannot restart the app yourself say: *"Everything is installed and checked. Reopen your AI app and ask: show my store info."*

## Step 6. Report back

Short summary: what you installed, which apps you configured, the store name, that the connector can read **and write** (the default; `configure --read-only` switches to look-only if the person wants more safety), and three things to try, for example:

- "Show my 10 latest orders and which ones still have to be shipped."
- "Which products have less than 5 units in stock?"
- "Create two combos with products I already have, with a nice image for each."

## Clients that cannot run a local program (ChatGPT)

ChatGPT custom connectors only talk to a **remote HTTPS** MCP server; they cannot start a local process. Codex (CLI, IDE or app), Claude, Gemini CLI, Cursor and the others above can: use `install` for those. For ChatGPT:

```bash
TRANSPORT=http MCP_AUTH_TOKEN=<long random string> npx -y github:fedeclavero/tiendanube-mcp
```

Expose `http://127.0.0.1:3000` through an HTTPS tunnel (for example `cloudflared tunnel --url http://127.0.0.1:3000` or ngrok) and add a connector in ChatGPT's developer mode with the URL `https://<tunnel host>/mcp/<MCP_AUTH_TOKEN>`. The server refuses every request without the token (header `Authorization: Bearer <token>`, or the token at the end of the path for clients that cannot send headers). **Treat that URL like a password**, and stop the tunnel when it is not in use. Honest limits: this route depends on ChatGPT's current connector availability for the person's plan, it has not been tested against ChatGPT here, and file paths given to the image upload tools refer to the computer running the server.

## After installing: how to USE it (rules for you, the agent)

1. For anything about the store, **call this server's tools**. Never use a browser, `agent-browser`, screenshots or the admin panel: that is 50x slower and breaks.
2. Start with `tiendanube_start_here`. Not sure which tool? `tiendanube_find_tool` with a plain-language query. Multi-step job? `tiendanube_get_recipe`.
3. Combos / packs from existing products: `tiendanube_create_combo`. Generate the picture with your own image tool, save it to a file, pass the path in `image_files`.
4. No tool for what you need? `tiendanube_api_request`. Something fails? Read the `Next step:` at the end of the error; for setup problems call `tiendanube_doctor`.
5. Before deleting or changing many records, say what you will do and how many, and continue when the person agrees.

## If something fails

[TROUBLESHOOTING.md](TROUBLESHOOTING.md). For a bug in the server, suggest an issue at <https://github.com/fedeclavero/tiendanube-mcp/issues> (remove tokens before pasting).
