# Tiendanube MCP Server — manage your Tiendanube / Nuvemshop store with Claude, Codex, OpenCode and any AI agent

[![CI](https://github.com/fedeclavero/tiendanube-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/fedeclavero/tiendanube-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-server-blue)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](https://nodejs.org)
[![M8ven Score](https://m8ven.ai/badge/mcp/fedeclavero-tiendanube-mcp-15lqtn?v=28d7c213d8e8d5a5cf31a0c542a1a3b3)](https://m8ven.ai/mcp/fedeclavero-tiendanube-mcp-15lqtn?s=readme)

**🇪🇸 [Leer en español](README.es.md)** · [Website](https://fedeclavero.github.io/tiendanube-mcp/) · [Tool reference](guides/TOOLS.md) · [Prompt recipes](guides/RECIPES.md)

**`tiendanube-mcp` is a free, open-source [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that connects AI assistants to the Tiendanube (Nuvemshop in Brazil) API.** Ask in plain language — *"which products have less than 5 units left?"*, *"raise all prices in the Summer category by 12%"*, *"which orders are paid but not shipped?"* — and your AI does the work through **198 tools** covering **39 API resources**: products, variants, stock, orders, customers, coupons, shipping, payments, webhooks and more, plus guided workflows such as building combos with images.

Works with **Claude Code, Claude Desktop, OpenAI Codex, Gemini CLI, Cursor, Google Antigravity, VS Code (Copilot), OpenCode, Windsurf, Cline** and any client that speaks MCP over stdio or HTTP. **An AI agent can install and configure it by itself**, even if you have never touched an API key.

> **AI agents, read this first.** If you were asked to install this server, do the whole setup yourself following [guides/AGENT_INSTALL.md](guides/AGENT_INSTALL.md); do not hand steps back to the user. If it is already connected, **use its tools for every store task and never a browser or the admin panel**: start with the `tiendanube_start_here` tool.

> **Not affiliated with Tiendanube or Nuvemshop.** Independent community project. Tiendanube and Nuvemshop are trademarks of their owners.

---

## Quick start (about 5 minutes)

**The easiest way: let your AI agent do everything.** Open your AI agent (Claude Code, Codex, Gemini CLI, Cursor, Antigravity, ...) and paste this single line:

```text
Install the Tiendanube MCP server by following https://raw.githubusercontent.com/fedeclavero/tiendanube-mcp/main/guides/AGENT_INSTALL.md
```

The agent asks your permission once to handle your keys, guides you click by click to create the app (ticking every permission), saves the keys, configures your AI app, verifies the connection and tells you when to restart it. You do not edit any file. Credentials background: [guides/GETTING_CREDENTIALS.md](guides/GETTING_CREDENTIALS.md).

Then ask something:

> "Show me my store info and the 10 most recent orders."

---

## Manual install

Requirement: **Node.js 18+**. Everything runs straight from GitHub; no global install needed.

```bash
# 1. save your keys once (Brazil / Nuvemshop: add --region nuvemshop)
npx -y github:fedeclavero/tiendanube-mcp configure --store-id 123456 --token YOUR_ACCESS_TOKEN
# 2. register it in every supported AI app found on this computer
npx -y github:fedeclavero/tiendanube-mcp install --client all
# 3. check everything; it prints exactly what to fix if something is wrong
npx -y github:fedeclavero/tiendanube-mcp doctor
```

Then fully close and reopen your AI app. With a partner app (OAuth) instead of a token: `npx -y github:fedeclavero/tiendanube-mcp login --client-id APP_ID --client-secret SECRET`.

| `--client` | App | Notes |
| --- | --- | --- |
| `claude-code` | Claude Code | uses `claude mcp add --scope user` |
| `claude-desktop` | Claude Desktop | |
| `codex` | OpenAI Codex (CLI / IDE / app) | `~/.codex/config.toml` |
| `gemini-cli` | Gemini CLI | |
| `cursor`, `windsurf` | Cursor, Windsurf | |
| `vscode` | VS Code (GitHub Copilot agent mode) | |
| `opencode` | OpenCode | |
| `antigravity` | Google Antigravity | config path from Google's codelab; stdio fields follow the common format |
| `cline` | Cline (VS Code) | path inferred from the extension layout |
| `generic` | any other stdio client | prints a snippet to paste |

`all` configures every app it finds; separate several with commas. `clients` lists what is detected. The command merges without touching your other servers, keeps a timestamped backup and is safe to repeat. The keys live in `~/.config/tiendanube-mcp/credentials.json` (Windows: `%APPDATA%\tiendanube-mcp\`), private to your user, so client configs contain no secrets.

Generic stdio config for any other MCP client:

```json
{ "mcpServers": { "tiendanube": { "command": "npx", "args": ["-y", "github:fedeclavero/tiendanube-mcp"] } } }
```

**ChatGPT** connectors only accept a remote HTTPS server (no local programs): see "Clients that cannot run a local program" in [guides/AGENT_INSTALL.md](guides/AGENT_INSTALL.md). Codex does run local servers, use `--client codex`.

> **First run is slower** (npm downloads and builds the project, ~30 s). The `configure` command above already warms it up.

### Environment variables (optional)

The saved credentials file is enough. Environment variables override it when set.

| Variable | Required | Description |
| --- | :---: | --- |
| `TIENDANUBE_STORE_ID` | | Numeric store ID (the `user_id` returned by OAuth) |
| `TIENDANUBE_ACCESS_TOKEN` | | Store access token |
| `TIENDANUBE_USER_AGENT` | | `AppName (contact@domain.com)`; a sensible default is used |
| `TIENDANUBE_READ_ONLY` | | `true` → registers only the read tools (83). Default: read and write |
| `TIENDANUBE_API_DOMAIN` | | `https://api.tiendanube.com` (default, Spanish-speaking LatAm) or `https://api.nuvemshop.com.br` (Brazil) |
| `TIENDANUBE_API_VERSION` | | Default `2025-03` |
| `TIENDANUBE_CLIENT_ID` / `TIENDANUBE_CLIENT_SECRET` | | Only for the OAuth helper tool |
| `TRANSPORT`, `PORT`, `HOST` | | `TRANSPORT=http` → streamable HTTP on `127.0.0.1:3000/mcp` (default: stdio) |
| `MCP_AUTH_TOKEN` | | HTTP mode only: required secret (a random one is generated and printed if unset) |
| `TIENDANUBE_MCP_HOME` | | Folder for the credentials file (default `~/.config/tiendanube-mcp`) |

---

## What can you ask?

Instead of clicking through the admin panel or exporting spreadsheets, you say the job and the AI picks the tools.

| You say | The AI uses |
| --- | --- |
| "List products with stock below 5, cheapest first" | `tiendanube_products_list` |
| "Set the stock of SKU `REM-001-M` to 40" | `tiendanube_products_get_by_sku` → `tiendanube_variants_update_stock` |
| "Build two combos with products I already sell, with a nice image each" | `tiendanube_create_combo` (+ your own image tool → `image_files`) |
| "Apply 10% off to the whole 'Verano' category" | `tiendanube_products_list` → `tiendanube_products_batch_stock_price` |
| "Which paid orders from this week haven't shipped?" | `tiendanube_orders_list` |
| "Mark order #1042 as dispatched with tracking code XYZ" | `tiendanube_fulfillment_orders_update` |
| "Create a 15% coupon `BIENVENIDA15`, valid until Dec 31" | `tiendanube_coupons_create` |
| "Who abandoned a cart in the last 3 days? Send them a coupon" | `tiendanube_abandoned_checkouts_list` → `tiendanube_abandoned_checkouts_apply_coupon` |
| "Subscribe my backend to `order/paid` events" | `tiendanube_webhooks_create` |

More than 20 copy-paste prompts in [guides/RECIPES.md](guides/RECIPES.md).

## What's covered

| Domain | Tools | Includes |
| --- | ---: | --- |
| Store & media | 2 | Store info, languages, plan, media quota |
| Catalog | 43 | Products, variants, stock, images, categories, kits, B2B price tables |
| Orders & fulfillment | 31 | Orders, draft orders, fulfillment orders + tracking, carts, abandoned checkouts |
| Customers | 5 | Full CRUD |
| Coupons & promotions | 11 | Coupons, automatic promotions, discount callbacks |
| Logistics | 23 | Locations & inventory levels, shipping carriers/options, business rules |
| Payments & billing | 25 | Payment providers/options, transactions, disputes, external invoices, app billing |
| Content | 15 | Pages, blog, email templates, scripts |
| Extensibility | 35 | Metafields, custom fields, custom objects, webhooks (36 events) |
| Guide & workflows | 8 | `tiendanube_start_here`, `tiendanube_find_tool`, `tiendanube_get_recipe`, `tiendanube_doctor`, `tiendanube_api_request`, `tiendanube_create_combo`, `tiendanube_product_image_add_from_file`, OAuth code exchange |

Full list with routes and required scopes: **[guides/TOOLS.md](guides/TOOLS.md)**. Also ships documentation resources (`tiendanube://docs/*`, `tiendanube://guide/*`).

## Omnipotence and Plug & Play (Full Permissions)

- **Full permissions by design (Omnipotence)** — The core philosophy of this MCP is to give the AI total power to operate your store without artificial roadblocks or missing-permission errors. During setup, **ALL permissions must be requested and granted (complete read and write across the board)**: products, variants, inventory, orders, customers, coupons, promotions, shipping, content, and webhooks.
- **100% Autonomous Plug & Play setup** — The merchant simply provides their access credentials (Store ID and Access Token / App Secret). If the user does not know how to obtain them, the AI agent guides them click by click; and if the user cannot or does not understand how to do it, **the AI agent itself takes the initiative using browser automation tools (agent-browser, Playwright, or browser navigation) to enter the Tiendanube admin/developer portal, create the application, and actively tick every single required read and write permission checkbox**. The merchant only logs in if prompted, and the connection is ready instantly.
- **Honest annotations and safety guardrails** — Each tool declares if it is destructive so well-designed AI clients ask for confirmation before massive changes or deletes, without hampering general autonomous execution.
- **Self-diagnosing** — If an existing app was created with partial scopes, the `doctor` command lists exactly what is missing to achieve full operational power.
- **Your data stays yours** — Credentials live in a private user-level file on your machine (`~/.config/tiendanube-mcp/credentials.json`, 600 permissions) and are sent exclusively to Tiendanube's official API. No telemetry, no third-party servers.
- **Rate-limit aware** — Follows leaky-bucket headers and handles 429 retries transparently.
- *(Technical note: if someone explicitly requires look-only access, `configure --read-only` is available, but complete read and write access is the recommended and default standard).*

## Honest limitations

- Endpoints follow the official API reference; some request bodies (promotions, transactions, disputes, billing, custom objects, business rules) are passed as free-form JSON, so the AI should consult the reference for exact fields. Found a mismatch? [Open an issue](https://github.com/fedeclavero/tiendanube-mcp/issues).
- Payment Provider and Shipping Carrier endpoints are meant for partner apps and may require approval from Tiendanube's platform team.
- Access tokens can't list their own scopes; use the 403 messages to find what's missing.
- Not published on npm yet — install from GitHub as shown above.

## Alternatives

Tiendanube also offers an official remote Admin MCP (see Tiendanube's help center for what it covers today). Community servers exist too ([ropu/MCP-tienda_nube](https://github.com/ropu/MCP-tienda_nube), [AlexandreProenca/nuvemshop-mcp-server](https://github.com/AlexandreProenca/nuvemshop-mcp-server)). This project is aimed at people who want a **self-hosted, scope-controlled server with broad API coverage** (including `unstable` resources) that they can read, fork and run locally.

## FAQ

**What is an MCP server?** A small program that lets an AI assistant call tools in another system. Here, the tools are the Tiendanube API operations.

**Does it work with Nuvemshop (Brazil)?** Yes. Set `TIENDANUBE_API_DOMAIN=https://api.nuvemshop.com.br`.

**Do I need to know how to code?** No. Paste the one-line install prompt into your AI agent; it handles the keys and the configuration for you. Credentials: [guides/GETTING_CREDENTIALS.md](guides/GETTING_CREDENTIALS.md).

**Can the AI delete my products by mistake?** The tools can delete, and they are flagged destructive so well-behaved clients ask for confirmation; the agent rules also tell the AI to announce bulk changes first. If you prefer, switch to read-only with `configure --read-only`. Keep a backup of your catalog before bulk operations.

**How much does it cost?** The server is free (MIT). You pay only for the AI service you already use. Tiendanube API access depends on your plan.

**Which token scopes do I need?** Tick all of them when you create the app, so you never have to redo it (scopes only apply to new tokens). See the matrix in [guides/GETTING_CREDENTIALS.md](guides/GETTING_CREDENTIALS.md#scopes).

**Is there an HTTP/remote mode?** Yes: `TRANSPORT=http` serves stateless streamable HTTP on `127.0.0.1` and always requires a token (`MCP_AUTH_TOKEN`). It exists for clients that cannot run local programs, such as ChatGPT connectors, through an HTTPS tunnel.

## Develop

```bash
git clone https://github.com/fedeclavero/tiendanube-mcp.git
cd tiendanube-mcp && npm install     # also builds
npm test                              # offline tests: mocked API, installer in temp dirs
npm run docs                          # regenerate guides/TOOLS.md
```

Architecture: each tool is a declarative `EndpointDef` in [`src/tools/`](src/tools), turned into an MCP tool (Zod schema, annotations, error mapping) by [`registry.ts`](src/tools/registry.ts). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Support the project

If this saves you hours of copy-pasting prices or checking orders, **a ⭐ on GitHub** helps other Tiendanube merchants and developers find it. Bug reports and recipes you'd like to share are even better.

MIT © [fedeclavero](https://github.com/fedeclavero)
