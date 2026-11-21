# Tiendanube MCP Server

**Want your AI to install it?** Paste this message into **Claude Code** or **Codex** on your computer:

> Install the Tiendanube MCP server in the client I am using and verify the connection. https://github.com/fedeclavero/tiendanube-mcp

**For the agent.** Read and execute the [agent install guide](guides/AGENT_INSTALL.md). Identify which client received the request (`claude-code` or `codex`) and use the native binary from GitHub Releases. If GitHub serves a cached view, use the [plain-text guide](https://raw.githubusercontent.com/fedeclavero/tiendanube-mcp/main/guides/AGENT_INSTALL.md).

[![CI](https://github.com/fedeclavero/tiendanube-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/fedeclavero/tiendanube-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-server-blue)](https://modelcontextprotocol.io)
[![M8ven Score](https://m8ven.ai/badge/mcp/fedeclavero-tiendanube-mcp-15lqtn?v=28d7c213d8e8d5a5cf31a0c542a1a3b3)](https://m8ven.ai/mcp/fedeclavero-tiendanube-mcp-15lqtn?s=readme)

**🇪🇸 [Leer en español](README.es.md)** · [Website](https://fedeclavero.github.io/tiendanube-mcp/) · [Agent install guide](guides/AGENT_INSTALL.md) · [Tool reference](guides/TOOLS.md) · [Prompt recipes](guides/RECIPES.md)

**`tiendanube-mcp` is a free, open-source [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server written in Rust for Tiendanube and Nuvemshop merchants.** Connect **Claude Code** or **Codex in the ChatGPT desktop app** to your store and ask in plain language — *"which products have less than 5 units left?"*, *"raise all prices in the Summer category by 12%"*, *"which orders are paid but not shipped?"* — through **198 tools** covering **39 official API resources** plus guided workflows such as creating combos with local images.

> **Not affiliated with Tiendanube or Nuvemshop.** Independent open-source project. Tiendanube and Nuvemshop are trademarks of their owners.

---

## Install

No Node.js, Python, Git, Rust, or Visual C++ Redistributable required. No admin privileges needed for the MCP.

- **Windows 11:** Install and open **Claude Code** or **the ChatGPT app with Codex** once. Download `tiendanube-mcp-windows-x86_64.zip` from [GitHub Releases](https://github.com/fedeclavero/tiendanube-mcp/releases/latest), click **Extract all**, and open **`Instalar.cmd`**. The guided wizard walks you through creating the store app with **full permissions**, saving credentials privately, and registering your chosen client.
- **Linux and macOS:** Download and extract the binary for your platform from [GitHub Releases](https://github.com/fedeclavero/tiendanube-mcp/releases/latest) into a stable folder (such as `~/.local/bin`), then run `tiendanube-mcp onboard` (or paste the prompt at the top so your AI agent installs it for you).
- **Upgrading from an earlier version:** Close your client and re-run `Instalar.cmd` (Windows) or `tiendanube-mcp install --client all` (Linux/macOS). Existing credentials in `~/.config/tiendanube-mcp/credentials.json` (`%APPDATA%\tiendanube-mcp\credentials.json` on Windows) are reused without rotating keys, and legacy `npx` registrations are migrated automatically.

### Manual CLI commands

```bash
# 1. Save credentials privately (interactive masked prompt; Brazil/Nuvemshop: add --region nuvemshop)
tiendanube-mcp configure --store-id 123456
# Or authorize a Partner Portal app via OAuth:
tiendanube-mcp login --client-id APP_ID

# 2. Register in Claude Code and/or Codex (preserves other servers, writes a backup, verifies stdio startup)
tiendanube-mcp install --client claude-code --client codex

# 3. Verify store connectivity and scopes
tiendanube-mcp doctor
```

Then fully close and reopen your AI client and ask it to call `tiendanube_start_here` and `tiendanube_store_get`.

### Environment variables (optional)

Saved credentials in `~/.config/tiendanube-mcp/credentials.json` (`%APPDATA%\tiendanube-mcp\credentials.json` on Windows) are enough and shared across clients. Environment variables override them when set.

| Variable | Description |
| --- | --- |
| `TIENDANUBE_STORE_ID` | Numeric store ID (`user_id` returned by OAuth) |
| `TIENDANUBE_ACCESS_TOKEN` | Store access token |
| `TIENDANUBE_USER_AGENT` | `AppName (contact@domain.com)`; a sensible default is used |
| `TIENDANUBE_API_DOMAIN` | `https://api.tiendanube.com` (default, Spanish-speaking LatAm) or `https://api.nuvemshop.com.br` (Brazil) |
| `TIENDANUBE_API_VERSION` | Default `2025-03` |
| `TIENDANUBE_CLIENT_ID` / `TIENDANUBE_CLIENT_SECRET` | Partner app credentials for `tiendanube-mcp login` |
| `TIENDANUBE_MCP_HOME` | Custom private directory for credentials and HTTP token |
| `TRANSPORT`, `HOST`, `PORT`, `ALLOWED_HOSTS`, `MCP_AUTH_TOKEN` | Streamable HTTP mode (`TRANSPORT=http` or `tiendanube-mcp serve --transport http`, loopback only, token required) |

---

## What can you ask?

| You say | The AI uses |
| --- | --- |
| "List products with stock below 5, cheapest first" | `tiendanube_products_list` |
| "Set the stock of SKU `REM-001-M` to 40" | `tiendanube_products_get_by_sku` → `tiendanube_variants_update_stock` |
| "Build two combos with products I already sell, with a nice image each" | `tiendanube_create_combo` (+ your image tool → `image_files`) |
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
| Guide & workflows | 8 | `tiendanube_start_here`, `tiendanube_find_tool`, `tiendanube_get_recipe`, `tiendanube_doctor`, `tiendanube_api_request`, `tiendanube_create_combo`, `tiendanube_product_image_add_from_file`, terminal OAuth helper |

Full list with routes and required scopes: **[guides/TOOLS.md](guides/TOOLS.md)**. Also exposes MCP documentation resources (`tiendanube://docs/*`, `tiendanube://guide/*`).

## Full access & security design

- **Full permissions from day one** — All **198 tools** are enabled with full read and write access (there is no read-only mode). Setup guides you to enable **all available permissions** so you never hit 403 errors later.
- **Secrets stay local** — Credentials live in a private user-level file (`0600` on Linux/macOS, user profile ACL on Windows), are entered privately in the terminal, and are never returned to the chat. OAuth runs locally via `tiendanube-mcp login`.
- **Hardened transports** — Streamable HTTP binds to loopback only, validates `Host` and `Origin`, requires a Bearer or path token (`tiendanube-mcp http-token` or `MCP_AUTH_TOKEN`), and blocks local filesystem uploads (`image_files` / `file_path` work only over local `stdio`).
- **Rate-limit aware & exact decimal math** — Follows Tiendanube's leaky-bucket headers, retries 429 on `GET` requests safely without duplicating writes, and calculates combo prices and weights with exact decimal arithmetic.
- **Honest annotations & self-diagnosing** — Destructive tools are annotated as such so clients can ask for confirmation, and `tiendanube-mcp doctor` reports missing read or write scopes with concrete next steps.

## Honest limitations

- Some complex bodies (promotions, transactions, disputes, billing, custom objects, business rules) are passed as free-form JSON according to the official API reference.
- Payment Provider and Shipping Carrier endpoints are meant for partner apps and may require Tiendanube approval.
- Custom-app access tokens do not report their write scopes; `doctor` probes read scopes and flags write scopes whenever OAuth reports them.

## FAQ

**What do I need on Windows 11?** Only **Claude Code** or **the ChatGPT desktop app with Codex**, a browser, and your Tiendanube/Nuvemshop store. The Windows ZIP is standalone and needs no runtimes or admin rights.

**Does it work with Nuvemshop (Brazil)?** Yes. Pass `--region nuvemshop` during `configure`/`login`, or set `TIENDANUBE_API_DOMAIN=https://api.nuvemshop.com.br`.

**Which permissions should I enable?** Enable **all** available read and write permissions when creating your app. Tiendanube permissions only apply to newly issued tokens. See [guides/GETTING_CREDENTIALS.md](guides/GETTING_CREDENTIALS.md#scopes).

**Is there an HTTP/remote mode?** Yes: `tiendanube-mcp serve --transport http` (or `TRANSPORT=http`) serves Streamable HTTP on `127.0.0.1` protected by a token (`tiendanube-mcp http-token` or `MCP_AUTH_TOKEN`). Local image file uploads are disabled over HTTP.

## Develop

```bash
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked --all-targets
cargo build --locked --release
```

Tests run offline against local mock servers and temp directories and never touch real store credentials. Run `tiendanube-mcp tools-doc > guides/TOOLS.md` to regenerate the tool reference. See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

## Support the project

If this saves you hours of managing prices, stock, or orders, a ⭐ on GitHub helps other Tiendanube merchants find it.

MIT © [fedeclavero](https://github.com/fedeclavero)
