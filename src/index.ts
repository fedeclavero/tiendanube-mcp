#!/usr/bin/env node
/**
 * Tiendanube / Nuvemshop MCP server.
 * Transports: stdio (default) or streamable HTTP (TRANSPORT=http, stateless JSON, token-protected).
 * Subcommands (install, configure, login, doctor...) live in ./cli/main.ts and are loaded on demand.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { randomBytes, timingSafeEqual, webcrypto } from "node:crypto";
import { clientFromEnv, resolveCredentials } from "./services/client.js";
import { VERSION, createServer } from "./server.js";

// Node 18 has no global `crypto`, which the MCP SDK's HTTP transport uses; Node 19+ already provides it.
if (!(globalThis as { crypto?: unknown }).crypto) (globalThis as { crypto?: unknown }).crypto = webcrypto;

const readOnly = () => resolveCredentials().readOnly;

async function runStdio() {
  const ro = readOnly();
  const server = createServer(clientFromEnv(), { readOnly: ro });
  await server.connect(new StdioServerTransport());
  console.error(`tiendanube-mcp-server ${VERSION} running via stdio${ro ? " (read-only)" : ""}`);
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * HTTP mode is for clients that cannot spawn a local process (e.g. ChatGPT connectors, which need a
 * remote HTTPS URL, usually through a tunnel). Because a tunnel makes the store reachable from the
 * internet, a secret is ALWAYS required: either `Authorization: Bearer <token>` or the token as the
 * last path segment (`/mcp/<token>`, for clients that cannot send headers). Treat the URL as a password.
 */
async function runHTTP() {
  const client = clientFromEnv();
  const ro = readOnly();
  const generated = !process.env.MCP_AUTH_TOKEN;
  const token = process.env.MCP_AUTH_TOKEN || randomBytes(24).toString("hex");
  if (token.length < 16) throw new Error("MCP_AUTH_TOKEN must be at least 16 characters (use a long random value).");

  const app = express();
  app.use(express.json({ limit: "5mb" }));

  const authorized = (req: express.Request) => {
    const header = req.get("authorization") ?? "";
    const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    const fromPath = typeof req.params.token === "string" ? req.params.token : "";
    return safeEqual(bearer, token) || safeEqual(fromPath, token);
  };

  app.post(["/mcp", "/mcp/:token"], async (req, res) => {
    if (!authorized(req)) {
      res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized: missing or wrong MCP token." }, id: null });
      return;
    }
    const server = createServer(client, { readOnly: ro });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP request error:", error instanceof Error ? error.message : error);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  });
  const methodNotAllowed = (_req: express.Request, res: express.Response) =>
    res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server: use POST)." }, id: null });
  app.get(["/mcp", "/mcp/:token"], methodNotAllowed);
  app.delete(["/mcp", "/mcp/:token"], methodNotAllowed);

  const port = parseInt(process.env.PORT || "3000", 10);
  const host = process.env.HOST || "127.0.0.1"; // loopback by default; tunnels connect to localhost
  app.listen(port, host, () => {
    console.error(`tiendanube-mcp-server ${VERSION} on http://${host}:${port}/mcp${ro ? " (read-only)" : ""}`);
    console.error(
      generated
        ? `MCP token (generated for this run; set MCP_AUTH_TOKEN to keep it): ${token}\nBearer header, or use the URL: http://${host}:${port}/mcp/${token}`
        : "Protected by MCP_AUTH_TOKEN: send 'Authorization: Bearer <token>' or use /mcp/<token>.",
    );
  });
}

const HELP = `tiendanube-mcp ${VERSION}: MCP server for the Tiendanube / Nuvemshop API

Server:
  tiendanube-mcp                 start the MCP server (stdio; TRANSPORT=http for token-protected HTTP)

Setup (an AI agent can run all of these for the user):
  tiendanube-mcp install --client <name|all> [--store-id ID --token TOKEN]   register in AI clients
  tiendanube-mcp configure --store-id ID --token TOKEN [--read-write|--read-only]   save credentials
  tiendanube-mcp login --client-id APP_ID --client-secret SECRET             OAuth: get a token automatically
  tiendanube-mcp doctor [--json]  (alias: --check)                           diagnose + exact next steps
  tiendanube-mcp clients [--json]                                            list supported/detected clients
  tiendanube-mcp uninstall --client <name|all>                               remove from AI clients
  tiendanube-mcp --version

Credentials: env vars (TIENDANUBE_STORE_ID, TIENDANUBE_ACCESS_TOKEN, TIENDANUBE_USER_AGENT,
TIENDANUBE_API_DOMAIN, TIENDANUBE_API_VERSION, TIENDANUBE_READ_ONLY) override the saved credentials file.
Docs: https://github.com/fedeclavero/tiendanube-mcp`;

const SUBCOMMANDS = new Set(["install", "uninstall", "configure", "setup", "login", "doctor", "clients"]);
const arg = process.argv[2];

if (arg === "--version" || arg === "-v") {
  console.log(VERSION);
  process.exit(0);
} else if (arg === "--help" || arg === "-h" || arg === "help") {
  console.log(HELP);
  process.exit(0);
} else if (arg === "--check" || (arg && SUBCOMMANDS.has(arg))) {
  const { runCli } = await import("./cli/main.js");
  process.exit(await runCli(arg === "--check" ? ["doctor", ...process.argv.slice(3)] : process.argv.slice(2)));
}

const main = process.env.TRANSPORT === "http" ? runHTTP : runStdio;
main().catch((error) => {
  console.error("Server error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
