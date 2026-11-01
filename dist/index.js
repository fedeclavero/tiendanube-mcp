#!/usr/bin/env node
/**
 * Tiendanube / Nuvemshop MCP server.
 * Transports: stdio (default) or streamable HTTP (TRANSPORT=http, stateless JSON).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { clientFromEnv } from "./services/client.js";
import { formatError } from "./services/errors.js";
import { VERSION, countTools, createServer } from "./server.js";
const readOnly = /^(1|true|yes)$/i.test(process.env.TIENDANUBE_READ_ONLY ?? "");
async function runStdio() {
    const server = createServer(clientFromEnv(), { readOnly });
    await server.connect(new StdioServerTransport());
    console.error(`tiendanube-mcp-server running via stdio${readOnly ? " (read-only)" : ""}`);
}
async function runHTTP() {
    const client = clientFromEnv();
    const app = express();
    app.use(express.json({ limit: "5mb" }));
    app.post("/mcp", async (req, res) => {
        const server = createServer(client, { readOnly });
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        res.on("close", () => {
            void transport.close();
            void server.close();
        });
        try {
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        }
        catch (error) {
            console.error("MCP request error:", error);
            if (!res.headersSent)
                res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
        }
    });
    const methodNotAllowed = (_req, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server: use POST)." }, id: null });
    app.get("/mcp", methodNotAllowed);
    app.delete("/mcp", methodNotAllowed);
    const port = parseInt(process.env.PORT || "3000", 10);
    const host = process.env.HOST || "127.0.0.1"; // bind locally by default (DNS rebinding safety)
    app.listen(port, host, () => console.error(`tiendanube-mcp-server on http://${host}:${port}/mcp`));
}
const HELP = `tiendanube-mcp ${VERSION} — MCP server for the Tiendanube / Nuvemshop API

Usage:
  tiendanube-mcp            start the MCP server (stdio; TRANSPORT=http for streamable HTTP)
  tiendanube-mcp --check    verify credentials by calling GET /store, then exit
  tiendanube-mcp --version  print the version

Environment: TIENDANUBE_STORE_ID, TIENDANUBE_ACCESS_TOKEN (required),
TIENDANUBE_USER_AGENT, TIENDANUBE_API_DOMAIN, TIENDANUBE_API_VERSION, TIENDANUBE_READ_ONLY.
Docs: https://github.com/fedeclavero/tiendanube-mcp`;
/** Credential check used by humans and AI agents right after installation. */
async function runCheck() {
    const missing = ["TIENDANUBE_STORE_ID", "TIENDANUBE_ACCESS_TOKEN"].filter((k) => !process.env[k]);
    if (missing.length) {
        console.error(`FAIL: missing environment variable(s): ${missing.join(", ")}`);
        return 1;
    }
    try {
        const { data } = await clientFromEnv().request({ method: "GET", path: "/store" });
        const text = (v) => (v && typeof v === "object" ? Object.values(v)[0] : v);
        console.log("OK: connected to Tiendanube");
        console.log(`  store:     ${text(data.name)} (id ${data.id})`);
        console.log(`  plan:      ${data.plan_name ?? "n/a"}`);
        console.log(`  country:   ${data.country ?? "n/a"} / currency ${data.main_currency ?? "n/a"}`);
        console.log(`  languages: ${Array.isArray(data.languages) ? data.languages.join(", ") : "n/a"}`);
        console.log(`  mode:      ${readOnly ? "read-only" : "read-write"} (${countTools(readOnly)} tools)`);
        console.log("  note: scopes can't be listed by the API; a 403 on a tool names the missing scope.");
        return 0;
    }
    catch (error) {
        console.error(`FAIL: ${formatError(error, { scope: "any valid token", toolName: "check" })}`);
        return 1;
    }
}
const arg = process.argv[2];
if (arg === "--version" || arg === "-v") {
    console.log(VERSION);
    process.exit(0);
}
else if (arg === "--help" || arg === "-h") {
    console.log(HELP);
    process.exit(0);
}
else if (arg === "--check") {
    process.exit(await runCheck());
}
const main = process.env.TRANSPORT === "http" ? runHTTP : runStdio;
main().catch((error) => {
    console.error("Server error:", error instanceof Error ? error.message : error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map