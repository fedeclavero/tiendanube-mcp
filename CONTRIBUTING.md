# Contributing

Thanks for helping Tiendanube merchants and developers! Bug reports, endpoint corrections and new recipes are all welcome.

1. Fork and clone, then `npm install` (this also builds).
2. Make your change. Tools live in `src/tools/<domain>.ts` as declarative `EndpointDef`s (see [AGENTS.md](AGENTS.md)).
3. `npm test` must pass. Add or extend a case in `src/selftest.ts` (tools) or `src/clienttest.ts` (installer, credentials, OAuth) for new behaviour. Tests are offline and use temp dirs; never use real credentials.
4. `npm run docs` to regenerate `guides/TOOLS.md`; keep `README.md` and `README.es.md` in sync.
5. Open a pull request describing what changed and which official API page it follows.

**Reporting endpoint mismatches:** include the tool name, the request you expected (link to the official reference), and the API response. Redact tokens.
