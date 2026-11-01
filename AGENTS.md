# AGENTS.md

## If a user asked you to install or connect this MCP server

Follow [guides/AGENT_INSTALL.md](guides/AGENT_INSTALL.md) exactly. Short version: check Node ≥ 18 → ask the user for region, Store ID, access token, contact (User-Agent) and read-only/read-write → run `npx -y github:fedeclavero/tiendanube-mcp --check` → register the server in the user-level client config → restart → verify with `tiendanube_store_get`. Never ask for admin passwords, never print or commit the token, default to read-only.

## If you are working on this repository

- Stack: TypeScript (ESM, Node ≥ 18), `@modelcontextprotocol/sdk`, `zod` v4. Build: `npm run build`. Tests: `npm test` (offline, mocked `fetch`).
- Layout: `src/services/` (HTTP client with dual auth headers, errors, formatting) · `src/tools/*.ts` (declarative `EndpointDef` per domain; `registry.ts` turns them into MCP tools) · `src/schemas/common.ts` · `src/resources.ts` · `src/server.ts` · `src/index.ts` (stdio/HTTP, `--check`).
- Adding a tool: add an entry with `LIST`/`ONE`/`POST`/`PUT`/`PATCH`/`DELETE` in the right `src/tools/<domain>.ts`; name `tiendanube_<domain>_<action>`; list its scope; add or extend a case in `src/selftest.ts`; run `npm run docs` to refresh `guides/TOOLS.md`; update counts in README files if they change.
- Rules: no secrets in code or logs; stdio servers must log to stderr only; keep descriptions accurate to behaviour; keep `README.md` and `README.es.md` in sync.
