# Troubleshooting / Solución de problemas

| Symptom / Síntoma | Cause / Causa | Fix / Solución |
| --- | --- | --- |
| `Store ID and access token are required` | Keys were never saved | Run `tiendanube-mcp onboard` (or `tiendanube-mcp configure --store-id <ID>` / `tiendanube-mcp login`), then restart Claude Code or Codex |
| The connector does not show up in the AI app | App not restarted, or not registered | Fully close and reopen Claude Code or the ChatGPT app (Codex). Run `tiendanube-mcp clients` and `tiendanube-mcp install --client <claude-code\|codex>` |
| The AI uses a browser instead of the tools | Model ignored server instructions | Tell it: *"Use the `tiendanube_*` tools, never the browser. Start with `tiendanube_start_here`."* Confirm registration with `tiendanube-mcp clients` and restart |
| `401 Unauthorized` | Wrong, rotated, or revoked token, wrong Store ID, or uninstalled app | Run `tiendanube-mcp login` or `tiendanube-mcp configure` with fresh credentials for that store |
| `400 Bad Request` on every call | Missing/invalid `User-Agent` | Run `tiendanube-mcp configure --user-agent "Name (email@domain.com)"` |
| `402 Payment Required` | Store plan is unpaid | Check billing status in Tiendanube |
| `403 Forbidden` on one tool | Token lacks the scope named in the message | Enable **all** available read and write permissions in your custom app or Partner Portal app, reinstall/reauthorize, and run `tiendanube-mcp login` or `tiendanube-mcp configure` (scopes only apply to new tokens). See [scopes](GETTING_CREDENTIALS.md#scopes) |
| `404 Not Found` | Wrong ID, or resource requires `unstable` API | Check the ID with the corresponding list tool; `unstable` endpoints switch automatically |
| `404` on a list with "Last page" | Empty result / page past the end | Handled automatically as an empty list |
| `422 Unprocessable Entity` | Invalid field values | Check field details in the error (e.g. i18n fields must be `{"es": "..."}`) |
| `429 Too Many Requests` | Rate limit (40 burst, 2 req/s) | GET requests retry automatically; prefer batch tools (`tiendanube_products_batch_stock_price`) |
| Windows: `Instalar.cmd` says it cannot overwrite `tiendanube-mcp.exe` | Running MCP process holds a file lock | Fully close Claude Code and the ChatGPT app (Codex) and run `Instalar.cmd` again |
| Local image upload rejected (`only available through stdio`) | Server is running over Streamable HTTP | Run via local `stdio` (`tiendanube-mcp serve`), omit `image_files` to reuse component photos, or pass a public URL to `tiendanube_product_images_create` |
| Brazil store returns 401/404 | Wrong API origin | Pass `--region nuvemshop` to `configure`/`login`, or set `TIENDANUBE_API_DOMAIN=https://api.nuvemshop.com.br` |
| Order list stops at page N | Hard cap `page * per_page <= 10000` | Filter by `created_at_min`/`created_at_max` or use `since_id` |
| Output ends with `[Output truncated...]` | 25,000-character guard | Use `fields`, smaller `per_page`, or narrower filters |

## Diagnose in seconds

```bash
tiendanube-mcp doctor
```

Shows where credentials come from (never prints secrets), verifies store connectivity, probes read scopes, checks OAuth write scopes when available, lists Claude Code / Codex registration status, and ends with exact next steps. Add `--json` for machines or `--offline` to check local files without calling the API. The same check is available inside your AI client as `tiendanube_doctor`.

## Still stuck?

Open an [issue](https://github.com/fedeclavero/tiendanube-mcp/issues) with the exact error text, your OS, `tiendanube-mcp --version`, and the output of `tiendanube-mcp doctor --offline --json`. **Never paste tokens or secrets.**
