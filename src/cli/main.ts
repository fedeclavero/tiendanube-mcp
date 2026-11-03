import { credentialsPath, loadStored, saveStored } from "../config/store.js";
import { DEFAULT_API_DOMAIN } from "../constants.js";
import { DoctorReport, diagnose, renderReport } from "../doctor.js";
import { MODULES, VERSION } from "../server.js";
import { TiendanubeClient, resolveCredentials } from "../services/client.js";
import { formatError } from "../services/errors.js";
import { Args, flag, parseArgs, readStdin, str } from "./args.js";
import {
  ApplyResult,
  CLIENTS,
  ClientDef,
  Ctx,
  DEFAULT_SOURCE,
  applyClient,
  clientById,
  configPathOf,
  defaultCtx,
  genericSnippet,
  isDetected,
  isRegistered,
  launchSpec,
  removeClient,
} from "./clients.js";
import { Region, apiDomainOf, authorizeUrl, codeFromInput, exchangeCode, newState, openBrowser, waitForCallback } from "./login.js";

const out = (text: string) => process.stdout.write(`${text}\n`);

function emit(args: Args, human: string, data: unknown) {
  out(flag(args, "json") ? JSON.stringify(data, null, 2) : human);
}

const regionOf = (v: string | undefined): Region | undefined =>
  !v ? undefined : /^(nuvemshop|brasil|brazil|br)$/i.test(v) ? "nuvemshop" : /^(tiendanube|latam|hispano|es|ar|mx|cl|co)/i.test(v) ? "tiendanube" : undefined;

/** Token precedence: --token, --token-stdin, then the TIENDANUBE_ACCESS_TOKEN environment variable. */
async function tokenFrom(args: Args): Promise<string | undefined> {
  if (str(args, "token")) return str(args, "token");
  if (flag(args, "token-stdin")) return (await readStdin()) || undefined;
  return process.env.TIENDANUBE_ACCESS_TOKEN || undefined;
}

function clientFor(creds: ReturnType<typeof resolveCredentials>): TiendanubeClient | undefined {
  return creds.storeId && creds.accessToken
    ? new TiendanubeClient({ storeId: creds.storeId, accessToken: creds.accessToken, userAgent: creds.userAgent, apiDomain: creds.apiDomain, defaultVersion: creds.apiVersion })
    : undefined;
}

async function doctorReport(probe: boolean): Promise<DoctorReport> {
  const creds = resolveCredentials();
  return diagnose(creds, clientFor(creds), MODULES, { probeScopes: probe });
}

// ---------------------------------------------------------------------------------------------
// configure: save credentials
// ---------------------------------------------------------------------------------------------

/** Save whatever credential flags were given. Returns the saved keys (never the secret). */
async function saveCredentialsFromArgs(args: Args): Promise<{ saved: string[]; file: string }> {
  const patch: Parameters<typeof saveStored>[0] = {};
  const saved: string[] = [];
  const storeId = str(args, "store-id") ?? (process.env.TIENDANUBE_STORE_ID || undefined);
  const token = await tokenFrom(args);
  const region = regionOf(str(args, "region"));
  const apiDomain = str(args, "api-domain") ?? (region ? apiDomainOf(region) : undefined);
  const userAgent = str(args, "user-agent") ?? (process.env.TIENDANUBE_USER_AGENT || undefined);
  if (storeId) { patch.storeId = String(storeId).trim(); saved.push("store id"); }
  if (token) { patch.accessToken = token.trim(); saved.push("access token"); }
  if (apiDomain) { patch.apiDomain = apiDomain.replace(/\/+$/, ""); saved.push("api domain"); }
  if (region) patch.region = region;
  if (userAgent) { patch.userAgent = userAgent; saved.push("user agent"); }
  if (flag(args, "read-only")) { patch.readOnly = true; saved.push("mode: read-only"); }
  if (flag(args, "read-write")) { patch.readOnly = false; saved.push("mode: read-write"); }
  if (!saved.length) return { saved, file: credentialsPath() };
  return { saved, file: saveStored(patch) };
}

async function cmdConfigure(args: Args): Promise<number> {
  const { saved, file } = await saveCredentialsFromArgs(args);
  if (!saved.length) {
    out("Nothing to save. Pass --store-id <ID> --token <TOKEN> (or --token-stdin, or set TIENDANUBE_ACCESS_TOKEN). Optional: --region nuvemshop, --user-agent \"Name (email)\", --read-only | --read-write.");
    return 1;
  }
  const report = flag(args, "no-verify") ? undefined : await doctorReport(false);
  const ok = report ? report.ok : true;
  emit(
    args,
    [`Saved: ${saved.join(", ")} -> ${file}`, report ? renderReport(report) : "Verification skipped.", ok ? "NEXT STEP: run `install --client all` if the AI client is not registered yet, then restart the AI client." : ""].filter(Boolean).join("\n"),
    { ok, saved, file, doctor: report },
  );
  return ok ? 0 : 1;
}

// ---------------------------------------------------------------------------------------------
// install / uninstall / clients
// ---------------------------------------------------------------------------------------------

function pickClients(spec: string, c: Ctx): { defs: ClientDef[]; unknown: string[]; generic: boolean } {
  const wanted = spec.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const defs: ClientDef[] = [];
  const unknown: string[] = [];
  let generic = false;
  for (const w of wanted) {
    if (w === "all") defs.push(...CLIENTS.filter((d) => isDetected(d, c)));
    else if (w === "generic") generic = true;
    else {
      const d = clientById(w) ?? (w === "claude" ? clientById("claude-code") : w === "gemini" ? clientById("gemini-cli") : w === "vs-code" ? clientById("vscode") : undefined);
      if (d) defs.push(d);
      else unknown.push(w);
    }
  }
  return { defs: [...new Set(defs)], unknown, generic };
}

const clientList = () => CLIENTS.map((d) => d.id).join(", ");

async function cmdInstall(args: Args): Promise<number> {
  const c = defaultCtx();
  const spec = str(args, "client");
  if (!spec) {
    out(`Missing --client. Use one of: ${clientList()}, generic, or "all" (every detected client). Comma-separate several.`);
    return 1;
  }
  const { defs, unknown, generic } = pickClients(spec, c);
  if (unknown.length) {
    out(`Unknown client(s): ${unknown.join(", ")}. Valid: ${clientList()}, generic, all.`);
    return 1;
  }

  const dryRun = flag(args, "dry-run");
  let saved: string[] = [];
  let file = credentialsPath();
  if (!dryRun) ({ saved, file } = await saveCredentialsFromArgs(args));

  // Credentials live in the shared user-level file; client configs stay secret-free unless asked.
  const creds = resolveCredentials();
  const embed = flag(args, "embed-env");
  const env: Record<string, string> = {};
  if (embed) {
    if (creds.storeId) env.TIENDANUBE_STORE_ID = creds.storeId;
    if (creds.accessToken) env.TIENDANUBE_ACCESS_TOKEN = creds.accessToken;
    if (creds.userAgent) env.TIENDANUBE_USER_AGENT = creds.userAgent;
    if (creds.apiDomain && creds.apiDomain !== DEFAULT_API_DOMAIN) env.TIENDANUBE_API_DOMAIN = creds.apiDomain;
    if (creds.readOnly) env.TIENDANUBE_READ_ONLY = "true";
  }
  const launch = launchSpec(c, { source: str(args, "source"), env });

  const results: ApplyResult[] = defs.map((d) => applyClient(d, c, launch, { dryRun, force: flag(args, "force"), source: str(args, "source") }));
  if (!defs.length && !generic) {
    results.push({ client: "none", label: "No supported AI client detected", status: "not-detected", note: `Name one explicitly (--client ${CLIENTS[0].id}) or use --client generic to print a config snippet.` });
  }

  const report = dryRun || flag(args, "no-verify") ? undefined : await doctorReport(false);
  const failed = results.some((r) => r.status === "error");
  const changed = results.filter((r) => r.status === "installed" || r.status === "updated").map((r) => r.label);
  const nextSteps: string[] = [];
  if (!creds.storeId || !creds.accessToken) nextSteps.push("Credentials are not saved yet: run `configure --store-id <ID> --token <TOKEN>` (or `login` for OAuth).");
  if (report && !report.ok) nextSteps.push(...report.nextSteps);
  if (changed.length) nextSteps.push(`Restart ${changed.join(", ")} (fully close and reopen it) so it loads the Tiendanube MCP, then ask it: "show my store info".`);

  const human = [
    `Tiendanube MCP ${VERSION}: install${dryRun ? " (dry run)" : ""}`,
    saved.length ? `credentials: saved ${saved.join(", ")} -> ${file}` : `credentials: ${creds.storeId && creds.accessToken ? `already available (store ${creds.storeId}, ${creds.source.accessToken === "env" ? "environment" : file})` : "NOT configured yet"}`,
    ...results.map((r) => `- ${r.label}: ${r.status}${r.path ? ` (${r.path})` : ""}${r.backup ? ` [backup: ${r.backup}]` : ""}${r.error ? ` ERROR: ${r.error}` : ""}${r.note ? ` ${r.note}` : ""}`),
    ...(generic ? ["", "Generic stdio config (paste into any MCP client):", genericSnippet(launch)] : []),
    ...(report ? ["", renderReport(report)] : []),
    ...nextSteps.map((n) => `NEXT STEP: ${n}`),
  ].join("\n");
  emit(args, human, { ok: !failed && (report ? report.ok : true), version: VERSION, credentials: { saved, file }, clients: results, doctor: report, nextSteps });
  return failed || (report && !report.ok) ? 1 : 0;
}

async function cmdUninstall(args: Args): Promise<number> {
  const c = defaultCtx();
  const spec = str(args, "client");
  if (!spec) {
    out(`Missing --client. Use one of: ${clientList()}, or "all".`);
    return 1;
  }
  const wanted = spec === "all" ? CLIENTS : pickClients(spec, c).defs;
  const results = wanted.map((d) => removeClient(d, c, { dryRun: flag(args, "dry-run") }));
  if (flag(args, "purge-credentials") && !flag(args, "dry-run")) {
    saveStored({ accessToken: "", clientSecret: "" });
    results.push({ client: "credentials", label: "Saved credentials", status: "removed", path: credentialsPath(), note: "token and client secret cleared" });
  }
  emit(args, results.map((r) => `- ${r.label}: ${r.status}${r.path ? ` (${r.path})` : ""}${r.error ? ` ERROR: ${r.error}` : ""}`).join("\n"), { clients: results });
  return results.some((r) => r.status === "error") ? 1 : 0;
}

async function cmdClients(args: Args): Promise<number> {
  const c = defaultCtx();
  const rows = CLIENTS.map((d) => ({ id: d.id, label: d.label, detected: isDetected(d, c), registered: isRegistered(d, c), config: configPathOf(d, c) }));
  emit(args, rows.map((r) => `${r.id.padEnd(15)} detected=${String(r.detected).padEnd(5)} registered=${String(r.registered).padEnd(5)} ${r.config}`).join("\n"), { clients: rows });
  return 0;
}

// ---------------------------------------------------------------------------------------------
// login (OAuth)
// ---------------------------------------------------------------------------------------------

async function cmdLogin(args: Args): Promise<number> {
  const stored = loadStored();
  const clientId = str(args, "client-id") ?? process.env.TIENDANUBE_CLIENT_ID ?? stored.clientId;
  const clientSecret = str(args, "client-secret") ?? process.env.TIENDANUBE_CLIENT_SECRET ?? stored.clientSecret;
  const region = regionOf(str(args, "region")) ?? stored.region ?? "tiendanube";
  if (!clientId || !clientSecret) {
    out("Missing app credentials. Pass --client-id <APP_ID> --client-secret <APP_SECRET> (from your app in the Partner Portal). See guides/GETTING_CREDENTIALS.md.");
    return 1;
  }
  const userAgent = str(args, "user-agent") ?? stored.userAgent;
  const port = parseInt(str(args, "port") ?? "8765", 10);
  const timeoutMs = parseInt(str(args, "timeout") ?? "600", 10) * 1000;

  let code = str(args, "code");
  const redirect = str(args, "redirect-url");
  if (redirect) code = codeFromInput(redirect).code;

  if (!code) {
    const state = newState();
    let wait;
    try {
      wait = await waitForCallback(port, state, timeoutMs);
    } catch (error) {
      out(`Error: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
    const url = authorizeUrl(clientId, region, state);
    out("TIENDANUBE LOGIN");
    out(`1. The app's Redirect URL must be exactly: ${wait.redirectUrl}   (Partner Portal > your app > redirect URL)`);
    out(`2. The store owner opens this link and accepts the permissions:\n   ${url}`);
    out("3. This command waits here and finishes by itself when the browser comes back.");
    out("   Plan B (if the portal does not accept localhost): put any redirect URL, accept, then copy the full address the browser lands on and run:");
    out(`   login --client-id ${clientId} --client-secret <SECRET> --redirect-url "<the copied address>"   (the code lasts ~5 minutes)`);
    if (!flag(args, "no-open")) openBrowser(url);
    try {
      ({ code } = await wait.result);
    } catch (error) {
      out(`Error: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    } finally {
      wait.close();
    }
  }

  try {
    const token = await exchangeCode({ clientId, clientSecret, code: code!, region, userAgent });
    const file = saveStored({
      storeId: token.storeId,
      accessToken: token.accessToken,
      scopes: token.scopes,
      clientId,
      clientSecret,
      region,
      apiDomain: apiDomainOf(region),
      ...(userAgent ? { userAgent } : {}),
    });
    const report = await doctorReport(false);
    const missingWrite = ["write_products", "write_orders", "write_customers", "write_coupons"].filter((s) => !token.scopes.includes(s));
    const hint = missingWrite.length
      ? `NOTE: the app was authorized without ${missingWrite.join(", ")}. Tick ALL permissions in the app (Partner Portal > Basic Data), then run login again so a new token is issued.`
      : "";
    emit(
      args,
      [`Authorized. Store ${token.storeId}; scopes: ${token.scopes.join(", ") || "(not reported)"}.`, `Saved to ${file}.`, renderReport(report), hint, "NEXT STEP: run `install --client all` if the AI client is not registered yet, then restart it."].filter(Boolean).join("\n"),
      { ok: report.ok, storeId: token.storeId, scopes: token.scopes, file, doctor: report, missingWriteScopes: missingWrite },
    );
    return report.ok ? 0 : 1;
  } catch (error) {
    out(`Error: ${error instanceof Error ? error.message : formatError(error)}`);
    return 1;
  }
}

// ---------------------------------------------------------------------------------------------
// doctor
// ---------------------------------------------------------------------------------------------

async function cmdDoctor(args: Args): Promise<number> {
  const report = await doctorReport(!flag(args, "no-probe"));
  emit(args, renderReport(report), report);
  return report.ok ? 0 : 1;
}

export async function runCli(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  try {
    switch (command) {
      case "install": return await cmdInstall(args);
      case "uninstall": return await cmdUninstall(args);
      case "configure":
      case "setup": return await cmdConfigure(args);
      case "login": return await cmdLogin(args);
      case "doctor": return await cmdDoctor(args);
      case "clients": return await cmdClients(args);
      default:
        out(`Unknown command "${command}". Run: npx -y ${DEFAULT_SOURCE} --help`);
        return 1;
    }
  } catch (error) {
    out(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
