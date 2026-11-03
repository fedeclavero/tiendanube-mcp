# Troubleshooting / Solución de problemas

| Symptom / Síntoma | Cause / Causa | Fix / Solución |
| --- | --- | --- |
| `No Tiendanube credentials found` | Keys were never saved | Run `npx -y github:fedeclavero/tiendanube-mcp configure --store-id <ID> --token <TOKEN>`, then restart your AI app |
| The connector does not show up in the AI app | App not restarted, or not registered | Fully close and reopen the app. Run `... clients` (is it `registered`?) and `... install --client <name>` |
| The AI uses a browser instead of the tools | Weak model or client that ignores server instructions | Tell it: *"Use the tiendanube_* tools, never the browser. Start with tiendanube_start_here."* Check the connector is listed (`... clients`, then restart) |
| `401 Unauthorized` | Wrong, rotated or revoked token, or wrong Store ID, or the app was uninstalled | Re-copy both values; check the token belongs to *that* store |
| `400 Bad Request` on every call | Missing/invalid `User-Agent` | Set `TIENDANUBE_USER_AGENT="Name (email@domain.com)"` |
| `402 Payment Required` | The store's Tiendanube plan is unpaid | Pay the plan; API access resumes |
| `403 Forbidden` on one tool | Token lacks the scope named in the message | Add the scope in your custom app / partner app, regenerate if needed, retry. See [scopes](GETTING_CREDENTIALS.md#scopes) |
| `404 Not Found` | Wrong ID, or the resource needs the `unstable` API | Check the ID; for unstable-only tools the server already switches versions |
| `404` on a list with "Last page" | Empty result / page past the end | Handled automatically as an empty page |
| `422 Unprocessable Entity` | Invalid field values | Read the field details in the error; e.g. i18n fields must be `{"es": "…"}` |
| `429 Too Many Requests` | Rate limit (40 burst, 2 req/s) | Retries automatically; prefer batch tools (`tiendanube_products_batch_stock_price`) |
| Client says *"failed to start"* / time-out the first time | First `npx` run downloads and builds (~30 s) | Run `npx -y github:fedeclavero/tiendanube-mcp --version` once in a terminal; raise the client's startup timeout (Codex `startup_timeout_sec`, Gemini `timeout`) |
| `EALLOWGIT` / `Fetching packages of type "git" have been disabled` | npm 12+ blocks GitHub packages by default | Run with `npm_config_allow_git=all` (verified), and make it permanent with `npm config set allow-git all` so AI apps can start the connector |
| `npx: command not found` / Node too old | Node.js missing or < 18 | Install Node.js LTS from <https://nodejs.org> |
| `ERR_MODULE_NOT_FOUND` / build errors after `npx github:` | Interrupted install / stale npx cache | `npx clear-npx-cache` or delete `~/.npm/_npx`, then retry |
| Windows: an app can't launch `npx` | Needs a shell wrapper | `install` writes `cmd /c npx ...` automatically; re-run `install --client <name>` |
| Tools missing (no write tools) | Read-only mode is on | Run `... configure --read-write` (and remove `TIENDANUBE_READ_ONLY` from the client config if present), then restart |
| Brazil store returns 401/404 | Wrong API host | Set `TIENDANUBE_API_DOMAIN=https://api.nuvemshop.com.br` |
| Order list stops at page N | Hard cap `page * per_page <= 10000` | Filter by `created_at_min`/`created_at_max` or use `since_id` |
| Output ends with "[Output truncated…]" | 25 000-character guard | Use `fields`, smaller `per_page`, or more filters |

## Diagnose in 30 seconds

```bash
npx -y github:fedeclavero/tiendanube-mcp doctor
```

It shows where the credentials come from (never the secret), the store name, plan, languages, the mode, and which **read permissions are missing**, and ends with `NEXT STEP:` lines. Add `--json` for machines. An AI agent can run it and follow those steps itself (the same check exists as the `tiendanube_doctor` tool).

## Still stuck?

Open an [issue](https://github.com/fedeclavero/tiendanube-mcp/issues) with: the exact error text, your client (and OS), Node version (`node -v`), and the output of `--check`. **Remove your token before pasting anything.**
