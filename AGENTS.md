# AGENTS.md

## 1. If a user asked you to install or connect this MCP server

Do the whole setup yourself, following [guides/AGENT_INSTALL.md](guides/AGENT_INSTALL.md) exactly. The user usually knows nothing about tokens or config files. Short version:

1. Ask the user **once** for permission to see/save their Tiendanube keys and edit their AI app's MCP configuration. With a yes, do everything without handing steps back. Never answer "I can't touch the keys, do it yourself".
2. Node >= 18 (install it if missing).
3. Get the credentials by guiding the user ([guides/GETTING_CREDENTIALS.md](guides/GETTING_CREDENTIALS.md)); make them tick **ALL** permissions. Ask them to paste the Store ID and Access token (or App ID + App secret), then:
   - `npx -y github:fedeclavero/tiendanube-mcp configure --store-id <ID> --token <TOKEN>`
   - or OAuth: `npx -y github:fedeclavero/tiendanube-mcp login --client-id <APP_ID> --client-secret <SECRET>`
4. `npx -y github:fedeclavero/tiendanube-mcp install --client all` (never edit client config files by hand).
5. `npx -y github:fedeclavero/tiendanube-mcp doctor` must say `OK`; do every `NEXT STEP:` it prints.
6. Ask the user to fully restart their AI app, then call `tiendanube_start_here` and `tiendanube_store_get`.

Default mode is read **and write**. Read-only is opt-in (`configure --read-only`). Keep hygiene: never commit keys, never repeat them in summaries.

## 2. If this MCP is already connected and you must work on the user's store

**Use the tools. Do not open a browser, `agent-browser`, Playwright or the admin panel for store tasks: it is 50x slower and breaks.**

| The user asks for... | Call |
| --- | --- |
| anything, not sure which tool | `tiendanube_start_here`, then `tiendanube_find_tool {"query":"..."}` |
| a multi-step job | `tiendanube_get_recipe {"id":"..."}` (combo, bulk-price, stock, create-product, images, seo, coupon, orders-to-ship, ...) |
| combos / packs / kits from products they already have (with images) | `tiendanube_create_combo` (make the picture with your own image tool, pass the file path in `image_files`) |
| upload an image file | `tiendanube_product_image_add_from_file` |
| products, stock, prices, orders, customers, coupons, pages, webhooks | the matching `tiendanube_*` tool |
| something no tool covers | `tiendanube_api_request` |
| any error / 401 / 403 | read `Next step:` in the error; setup problems: `tiendanube_doctor` |

Rules: text fields are language objects (`{"es": "..."}`); price, SKU, weight and stock live on **variants**; new products and combos are created as drafts (`published:false`), ask before publishing; before deleting or changing many records say what you will do and how many, then continue when the user agrees.

## 3. If you are working on this repository

- Stack: TypeScript (ESM, Node >= 18), `@modelcontextprotocol/sdk`, `zod` v4. Build: `npm run build`. Tests: `npm test` (offline, mocked `fetch`, temp dirs; never touches real credentials).
- Layout: `src/services/` (HTTP client with dual auth headers, credential resolution, errors, formatting) · `src/tools/*.ts` (declarative `EndpointDef` per domain; `registry.ts` turns them into MCP tools; `examples.ts` exact example arguments) · `src/tools/guide_tools.ts` (start_here, find_tool, get_recipe, doctor, api_request) · `src/tools/workflows.ts` (combo, image upload) · `src/guide.ts` (server instructions, recipes, search) · `src/doctor.ts` · `src/config/store.ts` (credentials file) · `src/cli/` (install, configure, login, clients) · `src/server.ts` · `src/index.ts` (stdio/HTTP, subcommands).
- Adding an API tool: add an entry with `LIST`/`ONE`/`POST`/`PUT`/`PATCH`/`DELETE` in the right `src/tools/<domain>.ts`; name `tiendanube_<domain>_<action>`; list its scope; start the description with a verb (the registry prefixes the "use this tool, not the browser" lead-in); add an `EXAMPLES` entry for important tools (the self-test executes every example against its schema); add or extend a case in `src/selftest.ts`; run `npm run docs`; update counts in the README files.
- Adding a hand-written tool: register it in `src/tools/custom_meta.ts` (counts and search) and keep it listed early.
- Adding an AI client to the installer: `src/cli/clients.ts`, verify its config location and format in the client's own documentation, and extend `src/clienttest.ts`.
- Rules: no secrets in code or logs; stdio servers log to stderr only; keep descriptions accurate to behaviour; keep `README.md` and `README.es.md` in sync; error messages must end with a concrete `Next step:`.
