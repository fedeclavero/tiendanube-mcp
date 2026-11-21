# Contributing

Thanks for helping Tiendanube merchants and developers! Bug reports, endpoint corrections, and new recipes are welcome.

1. Fork and clone the repository (requires Rust 1.89+).
2. Make your change. API endpoints live in `src/data/endpoints.json` and `src/data/mcp_contract.json`; server and CLI modules live in `src/*.rs` (see [AGENTS.md](AGENTS.md)).
3. Run the full verification suite:
   ```bash
   cargo fmt --all -- --check
   cargo clippy --locked --all-targets -- -D warnings
   cargo test --locked --all-targets
   ```
   Tests run offline against local mock servers and temp directories and never touch real credentials.
4. Run `cargo run --locked -- tools-doc > guides/TOOLS.md` if you added or changed tools, and keep `README.md` and `README.es.md` in sync.
5. Open a pull request describing what changed and which official API page it follows.

**Reporting endpoint mismatches:** include the tool name, the request you expected (link to the official reference), and the API response. Redact tokens before posting.
