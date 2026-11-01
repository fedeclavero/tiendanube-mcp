# Tiendanube MCP Server — manage your Tiendanube / Nuvemshop store with Claude, Codex, OpenCode and any AI agent

[![CI](https://github.com/fedeclavero/tiendanube-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/fedeclavero/tiendanube-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-server-blue)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](https://nodejs.org)

**🇪🇸 [Leer en español](README.es.md)** · [Website](https://fedeclavero.github.io/tiendanube-mcp/) · [Tool reference](guides/TOOLS.md) · [Prompt recipes](guides/RECIPES.md)

**`tiendanube-mcp` is a free, open-source [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that connects AI assistants to the Tiendanube (Nuvemshop in Brazil) API.** Ask in plain language — *"which products have less than 5 units left?"*, *"raise all prices in the Summer category by 12%"*, *"which orders are paid but not shipped?"* — and your AI does the work through **191 tools** covering **39 API resources**: products, variants, stock, orders, customers, coupons, shipping, payments, webhooks and more.

Works with **Claude Code, Claude Desktop, OpenAI Codex, OpenCode, Gemini CLI, Cursor, VS Code (Copilot), Windsurf** and any client that speaks MCP over stdio or HTTP.

> **Not affiliated with Tiendanube or Nuvemshop.** Independent community project. Tiendanube and Nuvemshop are trademarks of their owners.

---

## Quick start (about 5 minutes, 3 steps)

### 1. Get your credentials — *2 minutes*

You need a **Store ID** and an **access token**. The step-by-step guide is in [guides/GETTING_CREDENTIALS.md](guides/GETTING_CREDENTIALS.md) (custom app from your admin panel, or OAuth for partner apps).

### 2. Let your AI agent install it — *1 minute*

Open your AI coding agent (Claude Code, Codex, OpenCode, …) and paste this single line:

```text
Install the Tiendanube MCP server by following https://raw.githubusercontent.com/fedeclavero/tiendanube-mcp/main/guides/AGENT_INSTALL.md
```

The agent will install it, configure your client, ask you for the few values it needs (and nothing else), and verify the connection. Prefer to do it yourself? Use the table below.

### 3. Ask something — *10 seconds*

> "Show me my store info and the 10 most recent orders."

Start in **read-only mode** (`TIENDANUBE_READ_ONLY=true`): the AI can look but not touch. When you trust it, switch it off.

---

## Manual install

Requirements: **Node.js 18+**. Every command below runs the server straight from GitHub; no global install needed. Replace the values with yours.

| Client | Command / config |
| --- | --- |
| **Claude Code** | `claude mcp add tiendanube --scope user -e TIENDANUBE_STORE_ID=123456 -e TIENDANUBE_ACCESS_TOKEN=xxxx -e TIENDANUBE_USER_AGENT="MyStore (me@example.com)" -e TIENDANUBE_READ_ONLY=true -- npx -y github:fedeclavero/tiendanube-mcp` |
| **OpenAI Codex** | `codex mcp add tiendanube --env TIENDANUBE_STORE_ID=123456 --env TIENDANUBE_ACCESS_TOKEN=xxxx --env TIENDANUBE_USER_AGENT="MyStore (me@example.com)" --env TIENDANUBE_READ_ONLY=true -- npx -y github:fedeclavero/tiendanube-mcp` |
| **OpenCode** | add to `opencode.json` → see [below](#opencode) |
| **Claude Desktop, Cursor, Windsurf, Gemini CLI, VS Code** | JSON snippets in [guides/AGENT_INSTALL.md](guides/AGENT_INSTALL.md#client-configs) |

Generic stdio config (works in most clients):

```json
{
  "mcpServers": {
    "tiendanube": {
      "command": "npx",
      "args": ["-y", "github:fedeclavero/tiendanube-mcp"],
      "env": {
        "TIENDANUBE_STORE_ID": "123456",
        "TIENDANUBE_ACCESS_TOKEN": "your_access_token",
        "TIENDANUBE_USER_AGENT": "MyStore (me@example.com)",
        "TIENDANUBE_READ_ONLY": "true"
      }
    }
  }
}
```

<a id="opencode"></a>**OpenCode** (`opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "tiendanube": {
      "type": "local",
      "command": ["npx", "-y", "github:fedeclavero/tiendanube-mcp"],
      "enabled": true,
      "environment": {
        "TIENDANUBE_STORE_ID": "123456",
        "TIENDANUBE_ACCESS_TOKEN": "your_access_token",
        "TIENDANUBE_USER_AGENT": "MyStore (me@example.com)",
        "TIENDANUBE_READ_ONLY": "true"
      }
    }
  }
}
```

Verify the connection any time with:

```bash
TIENDANUBE_STORE_ID=123456 TIENDANUBE_ACCESS_TOKEN=xxxx npx -y github:fedeclavero/tiendanube-mcp --check
```

> **First run is slower** (npm downloads and builds the project, ~30 s). Run `npx -y github:fedeclavero/tiendanube-mcp --version` once before opening your MCP client so it doesn't time out.

### Environment variables

| Variable | Required | Description |
| --- | :---: | --- |
| `TIENDANUBE_STORE_ID` | ✅ | Numeric store ID (the `user_id` returned by OAuth) |
| `TIENDANUBE_ACCESS_TOKEN` | ✅ | Store access token |
| `TIENDANUBE_USER_AGENT` | recommended | `AppName (contact@domain.com)` — the API rejects requests without a User-Agent |
| `TIENDANUBE_READ_ONLY` | | `true` → registers only the 78 read tools |
| `TIENDANUBE_API_DOMAIN` | | `https://api.tiendanube.com` (default, Spanish-speaking LatAm) or `https://api.nuvemshop.com.br` (Brazil) |
| `TIENDANUBE_API_VERSION` | | Default `2025-03` |
| `TIENDANUBE_CLIENT_ID` / `TIENDANUBE_CLIENT_SECRET` | | Only for the OAuth helper tool |
| `TRANSPORT`, `PORT`, `HOST` | | `TRANSPORT=http` → streamable HTTP on `127.0.0.1:3000/mcp` (default: stdio) |

---

## What can you ask?

Instead of clicking through the admin panel or exporting spreadsheets, you say the job and the AI picks the tools.

| You say | The AI uses |
| --- | --- |
| "List products with stock below 5, cheapest first" | `tiendanube_products_list` |
| "Set the stock of SKU `REM-001-M` to 40" | `tiendanube_products_get_by_sku` → `tiendanube_variants_update_stock` |
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

Full list with routes and required scopes: **[guides/TOOLS.md](guides/TOOLS.md)**. Also ships an OAuth helper (`tiendanube_oauth_exchange_code`) and two documentation resources (`tiendanube://docs/scopes-and-limits`, `tiendanube://docs/checkout-sdk`).

## Safe by design

- **Read-only mode** — `TIENDANUBE_READ_ONLY=true` removes every write tool. Start here; unlock writes when you're comfortable.
- **Honest tool annotations** — every tool declares `readOnlyHint` / `destructiveHint` / `idempotentHint`, so MCP clients can treat deletes and cancellations with extra care.
- **Least privilege** — a `403` tells the AI exactly which OAuth scope is missing; grant only the scopes you need.
- **Your data stays yours** — credentials live in your own client config and are sent only to Tiendanube's API. No telemetry, no third-party servers.
- **Rate-limit aware** — follows the leaky-bucket headers, retries `429`s a bounded number of times.
- **Context-friendly** — pagination envelope, `fields` filter, `markdown`/`json` output and a 25 000-character cap keep the AI's context clean.
- **Open source (MIT)** — read every line before you trust it.

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

**Do I need to know how to code?** No. Paste the one-line install prompt into your AI agent and answer its questions. Credentials: [guides/GETTING_CREDENTIALS.md](guides/GETTING_CREDENTIALS.md).

**Can the AI delete my products by mistake?** Not in read-only mode. In read-write mode, delete/cancel tools are flagged destructive so well-behaved clients ask for confirmation. Keep a backup of your catalog before bulk operations.

**How much does it cost?** The server is free (MIT). You pay only for the AI service you already use. Tiendanube API access depends on your plan.

**Which token scopes do I need?** Only those for what you ask. Read-only analysis typically needs `read_products`, `read_orders`, `read_customers`. See the matrix in [guides/GETTING_CREDENTIALS.md](guides/GETTING_CREDENTIALS.md#scopes).

**Is there an HTTP/remote mode?** Yes: `TRANSPORT=http` serves stateless streamable HTTP on `127.0.0.1`. Put it behind your own authentication before exposing it.

## Develop

```bash
git clone https://github.com/fedeclavero/tiendanube-mcp.git
cd tiendanube-mcp && npm install     # also builds
npm test                              # offline self-test with a mocked API
npm run docs                          # regenerate guides/TOOLS.md
```

Architecture: each tool is a declarative `EndpointDef` in [`src/tools/`](src/tools), turned into an MCP tool (Zod schema, annotations, error mapping) by [`registry.ts`](src/tools/registry.ts). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Support the project

If this saves you hours of copy-pasting prices or checking orders, **a ⭐ on GitHub** helps other Tiendanube merchants and developers find it. Bug reports and recipes you'd like to share are even better.

MIT © [fedeclavero](https://github.com/fedeclavero)
