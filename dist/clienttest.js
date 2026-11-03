/**
 * Offline test of the setup tooling: credential store, client installer (every supported client),
 * OAuth helpers, and the real CLI / stdio / HTTP entry points. Everything runs inside temp dirs.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIENTS, applyClient, clientById, configPathOf, launchSpec, parseJsonc, removeClient, removeTomlTable, tomlBlock } from "./cli/clients.js";
import { authorizeUrl, codeFromInput, exchangeCode, waitForCallback } from "./cli/login.js";
import { loadStored, saveStored, credentialsPath } from "./config/store.js";
import { resolveCredentials } from "./services/client.js";
const tmp = (prefix) => mkdtempSync(join(tmpdir(), `tn-${prefix}-`));
const read = (f) => readFileSync(f, "utf8");
const isWin = process.platform === "win32";
// Hermetic: no real credentials, no real home.
for (const k of Object.keys(process.env))
    if (k.startsWith("TIENDANUBE_"))
        delete process.env[k];
const mcpHome = tmp("home-store");
process.env.TIENDANUBE_MCP_HOME = mcpHome;
// ---------------------------------------------------------------------------------------------
// credential store + resolution
// ---------------------------------------------------------------------------------------------
assert.deepEqual(loadStored(), {});
const file = saveStored({ storeId: "42", accessToken: "tok", scopes: ["read_products"] });
assert.equal(file, credentialsPath());
if (!isWin)
    assert.equal(statSync(file).mode & 0o777, 0o600, "credentials file must be private");
saveStored({ userAgent: "Shop (a@b.com)", readOnly: false });
assert.deepEqual({ ...loadStored(), savedAt: undefined }, { storeId: "42", accessToken: "tok", scopes: ["read_products"], userAgent: "Shop (a@b.com)", readOnly: false, savedAt: undefined }, "saves merge, never wipe");
writeFileSync(file, "{ not json");
assert.deepEqual(loadStored(), {}, "a corrupt file must not crash the server");
saveStored({ storeId: "42", accessToken: "tok" });
let creds = resolveCredentials({ TIENDANUBE_MCP_HOME: mcpHome });
assert.equal(creds.storeId, "42");
assert.equal(creds.source.accessToken, "file");
assert.equal(creds.readOnly, false, "read-write is the default");
creds = resolveCredentials({ TIENDANUBE_MCP_HOME: mcpHome, TIENDANUBE_ACCESS_TOKEN: "envtok", TIENDANUBE_READ_ONLY: "true" });
assert.equal(creds.accessToken, "envtok");
assert.equal(creds.source.accessToken, "env");
assert.equal(creds.source.storeId, "file");
assert.equal(creds.readOnly, true);
assert.equal(resolveCredentials({ TIENDANUBE_MCP_HOME: tmp("empty") }).source.accessToken, "none");
// ---------------------------------------------------------------------------------------------
// parsers
// ---------------------------------------------------------------------------------------------
assert.deepEqual(parseJsonc('{\n // c\n "a": "x // not a comment", /* b */ "b": [1,2,],\n}'), { a: "x // not a comment", b: [1, 2] });
assert.deepEqual(parseJsonc("   "), {});
const toml = `# my codex config\nmodel = "gpt"\n\n[mcp_servers.other]\ncommand = "other"\n\n[mcp_servers.tiendanube]\ncommand = "old"\nargs = ["x"]\n\n[mcp_servers.tiendanube.env]\nA = "1"\n\n[profiles.fast]\nmodel = "mini"\n`;
const stripped = removeTomlTable(toml);
assert.ok(!/tiendanube/.test(stripped), "our table and its env sub-table are removed");
assert.ok(/\[mcp_servers\.other\]/.test(stripped) && /\[profiles\.fast\]/.test(stripped) && /# my codex config/.test(stripped), "everything else survives");
assert.equal(removeTomlTable(stripped), stripped, "removal is idempotent");
assert.match(tomlBlock({ command: "npx", args: ["-y", "github:x/y"], env: { K: 'a"b' } }), /\[mcp_servers\.tiendanube\.env\]\nK = "a\\"b"/);
// ---------------------------------------------------------------------------------------------
// installer: every client, in a throwaway HOME
// ---------------------------------------------------------------------------------------------
const home = tmp("home");
const ctx = { home, platform: "linux", env: { PATH: "", XDG_CONFIG_HOME: join(home, ".config") } };
const launch = launchSpec(ctx);
assert.deepEqual(launch, { command: "npx", args: ["-y", "github:fedeclavero/tiendanube-mcp"], env: {} });
assert.deepEqual(launchSpec({ ...ctx, platform: "win32" }).args.slice(0, 3), ["/c", "npx", "-y"], "Windows needs cmd /c npx");
assert.equal(launchSpec({ ...ctx, platform: "win32" }).command, "cmd");
assert.ok(configPathOf(clientById("claude-desktop"), { ...ctx, platform: "win32", env: { APPDATA: "C:\\Users\\u\\AppData\\Roaming" } }).startsWith("C:\\Users\\u\\AppData\\Roaming\\Claude"));
assert.ok(configPathOf(clientById("claude-desktop"), { ...ctx, platform: "darwin" }).includes("Library/Application Support/Claude"));
const jsonClients = CLIENTS.filter((c) => c.kind === "json");
assert.deepEqual(jsonClients.map((c) => c.id).sort(), ["antigravity", "claude-desktop", "cline", "cursor", "gemini-cli", "opencode", "vscode", "windsurf"]);
const keyOf = (id) => clientById(id).key;
for (const def of jsonClients) {
    const path = configPathOf(def, ctx);
    mkdirSync(join(path, ".."), { recursive: true });
    // an existing config with another server and unrelated settings must be preserved
    const key = keyOf(def.id);
    writeFileSync(path, JSON.stringify({ theme: "dark", [key]: { other: { command: "keep-me" } } }));
    let r = applyClient(def, ctx, launch);
    assert.equal(r.status, "installed", `${def.id}: ${JSON.stringify(r)}`);
    assert.ok(r.backup && existsSync(r.backup), `${def.id}: a backup of the original is created`);
    let parsed = JSON.parse(read(path));
    assert.equal(parsed.theme, "dark", `${def.id}: unrelated keys survive`);
    assert.deepEqual(parsed[key].other, { command: "keep-me" }, `${def.id}: other servers survive`);
    assert.ok(parsed[key].tiendanube, `${def.id}: entry written`);
    assert.ok(!/tok|TOKEN/.test(JSON.stringify(parsed[key].tiendanube)), `${def.id}: no secret in the client config by default`);
    assert.equal(applyClient(def, ctx, launch).status, "unchanged", `${def.id}: idempotent`);
    r = applyClient(def, ctx, launchSpec(ctx, { env: { TIENDANUBE_STORE_ID: "42", TIENDANUBE_ACCESS_TOKEN: "tok" } }));
    assert.equal(r.status, "updated", `${def.id}: re-run with env updates in place`);
    parsed = JSON.parse(read(path));
    assert.equal(Object.keys(parsed[key]).filter((k) => k === "tiendanube").length, 1);
    assert.match(JSON.stringify(parsed[key].tiendanube), /"tok"/, `${def.id}: env embedded on request`);
    if (!isWin)
        assert.equal(statSync(path).mode & 0o077, 0, `${def.id}: file with a secret is private`);
    assert.equal(removeClient(def, ctx).status, "removed", `${def.id}: removable`);
    assert.deepEqual(JSON.parse(read(path))[key].other, { command: "keep-me" });
    assert.equal(removeClient(def, ctx).status, "not-registered");
}
// client-specific shapes
applyClient(clientById("vscode"), ctx, launch);
const vs = JSON.parse(read(configPathOf(clientById("vscode"), ctx)));
assert.equal(vs.servers.tiendanube.type, "stdio");
applyClient(clientById("opencode"), ctx, launch);
assert.deepEqual(JSON.parse(read(configPathOf(clientById("opencode"), ctx))).mcp.tiendanube.command, ["npx", "-y", "github:fedeclavero/tiendanube-mcp"]);
applyClient(clientById("gemini-cli"), ctx, launch);
assert.equal(JSON.parse(read(configPathOf(clientById("gemini-cli"), ctx))).mcpServers.tiendanube.timeout, 90000);
// JSONC (comments + trailing commas) is accepted; invalid JSON is never overwritten
const cur = clientById("cursor");
writeFileSync(configPathOf(cur, ctx), '{\n  // my servers\n  "mcpServers": { "a": {"command": "a"}, },\n}\n');
assert.equal(applyClient(cur, ctx, launch).status, "installed");
assert.ok(JSON.parse(read(configPathOf(cur, ctx))).mcpServers.a);
writeFileSync(configPathOf(cur, ctx), "{ broken");
const broken = applyClient(cur, ctx, launch);
assert.equal(broken.status, "error");
assert.equal(read(configPathOf(cur, ctx)), "{ broken", "a file we cannot parse is left untouched");
// Existing entries: legacy env vars are preserved, custom entries are never overwritten without --force
{
    const h = tmp("existing");
    const ectx = { ...ctx, home: h, env: { PATH: "", XDG_CONFIG_HOME: join(h, ".config") } };
    const cursor = clientById("cursor");
    const legacyFile = configPathOf(cursor, ectx);
    mkdirSync(join(legacyFile, ".."), { recursive: true });
    const legacyEntry = { command: "npx", args: ["-y", "github:fedeclavero/tiendanube-mcp"], env: { TIENDANUBE_STORE_ID: "42", TIENDANUBE_ACCESS_TOKEN: "legacy", TIENDANUBE_READ_ONLY: "true" } };
    writeFileSync(legacyFile, JSON.stringify({ mcpServers: { tiendanube: legacyEntry } }));
    assert.equal(applyClient(cursor, ectx, launch).status, "unchanged", "a standard legacy entry is already what install would write");
    assert.deepEqual(JSON.parse(read(legacyFile)).mcpServers.tiendanube, legacyEntry, "legacy keys and flags are untouched");
    writeFileSync(legacyFile, JSON.stringify({ mcpServers: { tiendanube: { ...legacyEntry, args: ["-y", "github:fedeclavero/tiendanube-mcp", "--old-flag"] } } }));
    assert.equal(applyClient(cursor, ectx, launch).status, "updated");
    assert.deepEqual(JSON.parse(read(legacyFile)).mcpServers.tiendanube.env, legacyEntry.env, "env vars survive an update of the launch");
    const custom = { command: "/home/me/.local/bin/tiendanube-mcp", args: [], env: { TIENDANUBE_STORE_ID: "7" } };
    writeFileSync(legacyFile, JSON.stringify({ mcpServers: { tiendanube: custom } }));
    const kept = applyClient(cursor, ectx, launch);
    assert.equal(kept.status, "unchanged");
    assert.match(kept.note ?? "", /--force/);
    assert.deepEqual(JSON.parse(read(legacyFile)).mcpServers.tiendanube, custom, "a custom entry is kept as is");
    assert.equal(applyClient(cursor, ectx, launch, { force: true }).status, "updated");
    assert.equal(JSON.parse(read(legacyFile)).mcpServers.tiendanube.env.TIENDANUBE_STORE_ID, "7", "even when forced, the old env vars are kept");
    // Codex TOML: env table of an older install survives
    const codexDef = clientById("codex");
    const tomlFile = configPathOf(codexDef, ectx);
    mkdirSync(join(tomlFile, ".."), { recursive: true });
    writeFileSync(tomlFile, '[mcp_servers.tiendanube]\ncommand = "npx"\nargs = ["-y", "github:fedeclavero/tiendanube-mcp"]\n\n[mcp_servers.tiendanube.env]\nTIENDANUBE_STORE_ID = "42"\nTIENDANUBE_ACCESS_TOKEN = "legacy \\"quoted\\""\n');
    assert.equal(applyClient(codexDef, ectx, launch).status, "updated");
    const t2 = read(tomlFile);
    assert.match(t2, /TIENDANUBE_STORE_ID = "42"/);
    assert.match(t2, /TIENDANUBE_ACCESS_TOKEN = "legacy \\"quoted\\""/);
    assert.match(t2, /startup_timeout_sec = 90/);
}
// dry run writes nothing
const dry = tmp("dry");
const dctx = { ...ctx, home: dry, env: { PATH: "", XDG_CONFIG_HOME: join(dry, ".config") } };
assert.equal(applyClient(clientById("windsurf"), dctx, launch, { dryRun: true }).status, "installed");
assert.equal(existsSync(configPathOf(clientById("windsurf"), dctx)), false);
// Codex (TOML): keeps the user's other settings byte-for-byte
const codex = clientById("codex");
const cfg = configPathOf(codex, ctx);
mkdirSync(join(cfg, ".."), { recursive: true });
writeFileSync(cfg, '# my config\nmodel = "gpt"\n\n[mcp_servers.other]\ncommand = "other"\n');
let cr = applyClient(codex, ctx, launch);
assert.equal(cr.status, "installed");
let t = read(cfg);
assert.ok(t.startsWith('# my config\nmodel = "gpt"\n\n[mcp_servers.other]\ncommand = "other"\n'));
assert.match(t, /\[mcp_servers\.tiendanube\]\ncommand = "npx"\nargs = \["-y", "github:fedeclavero\/tiendanube-mcp"\]\nstartup_timeout_sec = 90/);
assert.equal(applyClient(codex, ctx, launch).status, "unchanged");
cr = applyClient(codex, ctx, launchSpec(ctx, { env: { TIENDANUBE_STORE_ID: "42" } }));
assert.equal(cr.status, "updated");
t = read(cfg);
assert.equal((t.match(/\[mcp_servers\.tiendanube\]/g) ?? []).length, 1, "never duplicates the table");
assert.match(t, /\[mcp_servers\.tiendanube\.env\]\nTIENDANUBE_STORE_ID = "42"/);
assert.equal(removeClient(codex, ctx).status, "removed");
assert.ok(!/tiendanube/.test(read(cfg)) && /\[mcp_servers\.other\]/.test(read(cfg)));
// Claude Code: uses its own CLI (fake binary records the calls)
if (!isWin) {
    const bin = tmp("bin");
    const log = join(bin, "calls.log");
    writeFileSync(join(bin, "claude"), `#!/bin/sh\necho "$@" >> "${log}"\nexit 0\n`);
    chmodSync(join(bin, "claude"), 0o755);
    const cc = clientById("claude-code");
    const r = applyClient(cc, { ...ctx, env: { ...ctx.env, PATH: bin } }, launchSpec(ctx, { env: { TIENDANUBE_STORE_ID: "42" } }));
    assert.equal(r.status, "installed", JSON.stringify(r));
    const calls = read(log).trim().split("\n");
    assert.equal(calls[0], "mcp remove tiendanube --scope user");
    assert.equal(calls[1], "mcp add tiendanube --scope user -e TIENDANUBE_STORE_ID=42 -- npx -y github:fedeclavero/tiendanube-mcp");
    // without the CLI it falls back to editing ~/.claude.json and keeps its other keys
    const fb = tmp("fb");
    writeFileSync(join(fb, ".claude.json"), JSON.stringify({ numStartups: 7, mcpServers: { z: { command: "z" } } }));
    const fr = applyClient(cc, { ...ctx, home: fb }, launch);
    assert.equal(fr.status, "installed");
    const cj = JSON.parse(read(join(fb, ".claude.json")));
    assert.equal(cj.numStartups, 7);
    assert.ok(cj.mcpServers.z && cj.mcpServers.tiendanube);
}
// ---------------------------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------------------------
assert.equal(authorizeUrl("1234", "tiendanube", "st"), "https://www.tiendanube.com/apps/1234/authorize?state=st");
assert.equal(authorizeUrl("1234", "nuvemshop"), "https://www.nuvemshop.com.br/apps/1234/authorize");
assert.deepEqual(codeFromInput("abc123"), { code: "abc123" });
assert.deepEqual(codeFromInput("http://localhost:8765/callback?code=abc%2B1&state=S"), { code: "abc+1", state: "S" });
assert.deepEqual(codeFromInput("  https://example.com/?foo=1&code=zzz  "), { code: "zzz", state: undefined });
const realFetch = globalThis.fetch;
let seen;
globalThis.fetch = (async (url, init) => {
    seen = { url: String(url), body: JSON.parse(String(init.body)) };
    return seen.body.code === "good"
        ? new Response(JSON.stringify({ access_token: "T0K", token_type: "bearer", scope: "read_products,write_products", user_id: 777 }), { status: 200 })
        : new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
});
const tok = await exchangeCode({ clientId: "1", clientSecret: "s", code: "good", region: "tiendanube" });
assert.deepEqual(tok, { accessToken: "T0K", storeId: "777", scopes: ["read_products", "write_products"] });
assert.equal(seen.url, "https://www.tiendanube.com/apps/authorize/token");
assert.deepEqual(seen.body, { client_id: "1", client_secret: "s", grant_type: "authorization_code", code: "good" });
await exchangeCode({ clientId: "1", clientSecret: "s", code: "good", region: "nuvemshop" });
assert.equal(seen.url, "https://www.nuvemshop.com.br/apps/authorize/token");
await assert.rejects(exchangeCode({ clientId: "1", clientSecret: "s", code: "bad", region: "tiendanube" }), /Next step: .*expires in about 5 minutes/s);
globalThis.fetch = realFetch;
// local callback server
const port = 20000 + Math.floor(Math.random() * 20000);
const wait = await waitForCallback(port, "STATE", 10000);
assert.equal(wait.redirectUrl, `http://localhost:${port}/callback`);
assert.equal((await fetch(`http://127.0.0.1:${port}/other`)).status, 404);
assert.equal((await fetch(`http://127.0.0.1:${port}/callback`)).status, 400);
assert.equal((await fetch(`http://127.0.0.1:${port}/callback?code=thecode&state=STATE`)).status, 200);
assert.deepEqual(await wait.result, { code: "thecode" });
wait.close();
// a fresh port: Node 18's fetch would reuse the keep-alive socket of the server we just closed
const wait2 = await waitForCallback(port + 1, "STATE", 10000);
assert.equal((await fetch(`http://127.0.0.1:${port + 1}/callback?code=x&state=FORGED`)).status, 400);
await assert.rejects(wait2.result, /State mismatch/);
wait2.close();
// ---------------------------------------------------------------------------------------------
// the real binary: CLI, stdio server reading the saved file, and the token-protected HTTP mode
// ---------------------------------------------------------------------------------------------
const entry = fileURLToPath(new URL("./index.js", import.meta.url));
const sandbox = tmp("e2e");
const e2eEnv = { PATH: process.env.PATH ?? "", HOME: sandbox, USERPROFILE: sandbox, XDG_CONFIG_HOME: join(sandbox, ".config"), TIENDANUBE_MCP_HOME: join(sandbox, "tn") };
const cli = (args, input) => spawnSync(process.execPath, [entry, ...args], { env: e2eEnv, input, encoding: "utf8" });
let res = cli(["configure", "--store-id", "42", "--token-stdin", "--no-verify", "--region", "nuvemshop", "--user-agent", "Shop (a@b.com)", "--json"], "stdin-token\n");
assert.equal(res.status, 0, res.stdout + res.stderr);
const saved = JSON.parse(read(join(sandbox, "tn", "credentials.json")));
assert.equal(saved.accessToken, "stdin-token");
assert.equal(saved.apiDomain, "https://api.nuvemshop.com.br");
assert.ok(!res.stdout.includes("stdin-token"), "the CLI never prints the token");
res = cli(["install", "--client", "cursor,windsurf", "--no-verify", "--json"]);
assert.equal(res.status, 0, res.stdout + res.stderr);
const out = JSON.parse(res.stdout);
assert.deepEqual(out.clients.map((c) => c.status), ["installed", "installed"]);
assert.ok(!read(join(sandbox, ".cursor", "mcp.json")).includes("stdin-token"), "installing does not copy the secret into the client config");
assert.ok(!res.stdout.includes("stdin-token"));
res = cli(["install", "--client", "cursor", "--no-verify", "--json"]);
assert.equal(JSON.parse(res.stdout).clients[0].status, "unchanged");
res = cli(["install", "--client", "nope"]);
assert.equal(res.status, 1);
assert.match(res.stdout, /Unknown client/);
res = cli(["clients", "--json"]);
const listed = JSON.parse(res.stdout).clients;
assert.equal(listed.find((c) => c.id === "cursor").registered, true);
assert.equal(listed.find((c) => c.id === "codex").registered, false);
res = cli(["uninstall", "--client", "cursor", "--json"]);
assert.equal(JSON.parse(res.stdout).clients[0].status, "removed");
res = cli(["--version"]);
assert.match(res.stdout, /^\d+\.\d+\.\d+/);
res = cli(["login", "--json"]);
assert.equal(res.status, 1);
assert.match(res.stdout, /Missing app credentials/);
// stdio server started like any MCP client would: NO env vars, credentials come from the saved file
const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: e2eEnv, stderr: "pipe" });
const mcp = new Client({ name: "e2e", version: "1" });
await mcp.connect(transport);
const listedTools = (await mcp.listTools()).tools;
assert.ok(listedTools.length > 190);
assert.equal(listedTools[0].name, "tiendanube_start_here");
assert.match(mcp.getInstructions() ?? "", /NEVER use a browser/);
await mcp.close();
// Backward compatibility: an installation made with the previous version (keys as env vars inside the
// client config, read-only flag in env, NO credentials file) must keep working untouched.
const legacyHome = tmp("legacy");
const legacyEnv = { PATH: process.env.PATH ?? "", HOME: legacyHome, USERPROFILE: legacyHome, XDG_CONFIG_HOME: join(legacyHome, ".config"), TIENDANUBE_MCP_HOME: join(legacyHome, "tn"), TIENDANUBE_STORE_ID: "42", TIENDANUBE_ACCESS_TOKEN: "legacy-token", TIENDANUBE_USER_AGENT: "Shop (a@b.com)", TIENDANUBE_READ_ONLY: "true" };
const legacy = new Client({ name: "legacy", version: "1" });
await legacy.connect(new StdioClientTransport({ command: process.execPath, args: [entry], env: legacyEnv, stderr: "pipe" }));
const legacyTools = (await legacy.listTools()).tools.map((t) => t.name);
assert.ok(legacyTools.length > 50 && legacyTools.length < 100, "env-var read-only still means read-only");
assert.ok(!legacyTools.includes("tiendanube_create_combo") && !legacyTools.includes("tiendanube_products_delete"));
assert.ok(legacyTools.includes("tiendanube_products_list"));
await legacy.close();
assert.equal(existsSync(join(legacyHome, "tn", "credentials.json")), false, "running the server never creates or rewrites credentials");
res = spawnSync(process.execPath, [entry, "--check"], { env: { PATH: process.env.PATH ?? "", HOME: legacyHome, TIENDANUBE_MCP_HOME: join(legacyHome, "tn2") }, encoding: "utf8" });
assert.equal(res.status, 1, "the legacy --check flag still works (and fails cleanly without credentials)");
assert.match(res.stdout, /NEXT STEP/);
// HTTP mode always requires a token
const hport = 20000 + Math.floor(Math.random() * 20000);
const server = spawn(process.execPath, [entry], { env: { ...e2eEnv, TRANSPORT: "http", PORT: String(hport), MCP_AUTH_TOKEN: "x".repeat(32) }, stdio: ["ignore", "ignore", "pipe"] });
await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("HTTP server did not start")), 15000);
    server.stderr.on("data", (d) => {
        if (String(d).includes("Protected by MCP_AUTH_TOKEN")) {
            clearTimeout(timer);
            resolve();
        }
    });
});
const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } };
const post = (path, headers = {}) => fetch(`http://127.0.0.1:${hport}${path}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(init) });
assert.equal((await post("/mcp")).status, 401, "no token -> 401");
assert.equal((await post("/mcp", { authorization: "Bearer wrong" })).status, 401);
assert.equal((await post(`/mcp/${"y".repeat(32)}`)).status, 401);
const good = await post("/mcp", { authorization: `Bearer ${"x".repeat(32)}` });
assert.equal(good.status, 200);
assert.match(JSON.stringify(await good.json()), /NEVER use a browser/);
assert.equal((await post(`/mcp/${"x".repeat(32)}`)).status, 200, "secret-path form works for clients that cannot send headers");
server.kill();
console.log("all client/setup tests passed");
//# sourceMappingURL=clienttest.js.map