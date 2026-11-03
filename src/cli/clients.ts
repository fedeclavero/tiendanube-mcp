import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/** Name under which the server is registered in every client. */
export const SERVER_NAME = "tiendanube";
export const DEFAULT_SOURCE = "github:fedeclavero/tiendanube-mcp";

export interface Ctx {
  home: string;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
}
export const defaultCtx = (): Ctx => ({ home: homedir(), platform: process.platform, env: process.env });

/** `path` flavour matching the target platform, so Windows paths can be built and tested anywhere. */
const P = (c: Ctx) => (c.platform === "win32" ? path.win32 : path.posix);

export interface Launch {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function launchSpec(c: Ctx, opts: { source?: string; env?: Record<string, string> } = {}): Launch {
  const npx = ["-y", opts.source ?? DEFAULT_SOURCE];
  // Windows GUI clients cannot start npx.cmd directly; they need cmd /c.
  return c.platform === "win32"
    ? { command: "cmd", args: ["/c", "npx", ...npx], env: opts.env ?? {} }
    : { command: "npx", args: npx, env: opts.env ?? {} };
}

export type Status = "installed" | "updated" | "unchanged" | "removed" | "not-registered" | "not-detected" | "error";
export interface ApplyResult {
  client: string;
  label: string;
  status: Status;
  path?: string;
  backup?: string;
  note?: string;
  error?: string;
}

// ---------------------------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------------------------

/** JSON with comments / trailing commas (VS Code, OpenCode and Zed style configs). */
export function parseJsonc(text: string): any {
  const trimmed = text.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through to the tolerant parser */
  }
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
    } else out += ch;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

const stamp = () => new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

/** Copy `file` aside before changing it; returns the backup path. */
function backup(file: string): string | undefined {
  if (!existsSync(file)) return undefined;
  const dest = `${file}.bak-${stamp()}`;
  copyFileSync(file, dest);
  return dest;
}

function writeSecure(file: string, content: string, secret: boolean) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, secret ? { mode: 0o600 } : undefined);
  if (secret) {
    try {
      chmodSync(file, 0o600);
    } catch {
      /* Windows: the user-profile ACL applies */
    }
  }
}

export function which(cmd: string, c: Ctx): string | undefined {
  const sep = c.platform === "win32" ? ";" : ":";
  const exts = c.platform === "win32" ? (c.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (c.env.PATH ?? c.env.Path ?? "").split(sep)) {
    if (!dir) continue;
    for (const ext of exts) {
      const file = P(c).join(dir, cmd + ext);
      if (existsSync(file)) return file;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Client definitions
// ---------------------------------------------------------------------------------------------

type Shape = (l: Launch) => Record<string, unknown>;
const standard: Shape = (l) => ({ command: l.command, args: l.args, ...(Object.keys(l.env).length ? { env: l.env } : {}) });

interface JsonClient {
  kind: "json";
  id: string;
  label: string;
  /** Config file to edit. */
  file: (c: Ctx) => string;
  /** Directory whose existence means the app is installed. */
  appDir: (c: Ctx) => string;
  /** Top-level key that holds the server map. */
  key: string;
  shape: Shape;
  /** CLI binary that also signals the client is installed. */
  bin?: string;
  note?: string;
}
interface TomlClient {
  kind: "toml";
  id: string;
  label: string;
  file: (c: Ctx) => string;
  appDir: (c: Ctx) => string;
  bin?: string;
  note?: string;
}
interface CliClient {
  kind: "cli";
  id: string;
  label: string;
  bin: string;
  fallbackFile: (c: Ctx) => string;
  note?: string;
}
export type ClientDef = JsonClient | TomlClient | CliClient;

const appData = (c: Ctx) => c.env.APPDATA ?? P(c).join(c.home, "AppData", "Roaming");
const xdg = (c: Ctx) => c.env.XDG_CONFIG_HOME ?? P(c).join(c.home, ".config");
const vscodeUser = (c: Ctx) =>
  c.platform === "darwin"
    ? P(c).join(c.home, "Library", "Application Support", "Code", "User")
    : c.platform === "win32"
      ? P(c).join(appData(c), "Code", "User")
      : P(c).join(xdg(c), "Code", "User");
const claudeDesktopDir = (c: Ctx) =>
  c.platform === "darwin"
    ? P(c).join(c.home, "Library", "Application Support", "Claude")
    : c.platform === "win32"
      ? P(c).join(appData(c), "Claude")
      : P(c).join(xdg(c), "Claude");
const codexDir = (c: Ctx) => c.env.CODEX_HOME ?? P(c).join(c.home, ".codex");
const clineFile = (c: Ctx) => P(c).join(vscodeUser(c), "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json");
/** Antigravity 2.0 shares ~/.gemini/config/mcp_config.json; older builds used ~/.gemini/antigravity/. */
const antigravityFile = (c: Ctx) => {
  const modern = P(c).join(c.home, ".gemini", "config", "mcp_config.json");
  const legacy = P(c).join(c.home, ".gemini", "antigravity", "mcp_config.json");
  return !existsSync(modern) && existsSync(legacy) ? legacy : modern;
};

export const CLIENTS: ClientDef[] = [
  {
    kind: "cli",
    id: "claude-code",
    label: "Claude Code",
    bin: "claude",
    fallbackFile: (c) => P(c).join(c.home, ".claude.json"),
  },
  {
    kind: "json",
    id: "claude-desktop",
    label: "Claude Desktop",
    file: (c) => P(c).join(claudeDesktopDir(c), "claude_desktop_config.json"),
    appDir: claudeDesktopDir,
    key: "mcpServers",
    shape: standard,
  },
  { kind: "toml", id: "codex", label: "OpenAI Codex (CLI / IDE / app)", file: (c) => P(c).join(codexDir(c), "config.toml"), appDir: codexDir, bin: "codex" },
  {
    kind: "json",
    id: "gemini-cli",
    label: "Gemini CLI",
    file: (c) => P(c).join(c.home, ".gemini", "settings.json"),
    appDir: (c) => P(c).join(c.home, ".gemini"),
    key: "mcpServers",
    bin: "gemini",
    shape: (l) => ({ ...standard(l), timeout: 90000 }),
  },
  {
    kind: "json",
    id: "cursor",
    label: "Cursor",
    file: (c) => P(c).join(c.home, ".cursor", "mcp.json"),
    appDir: (c) => P(c).join(c.home, ".cursor"),
    key: "mcpServers",
    shape: standard,
  },
  {
    kind: "json",
    id: "windsurf",
    label: "Windsurf",
    file: (c) => P(c).join(c.home, ".codeium", "windsurf", "mcp_config.json"),
    appDir: (c) => P(c).join(c.home, ".codeium", "windsurf"),
    key: "mcpServers",
    shape: standard,
  },
  {
    kind: "json",
    id: "vscode",
    label: "VS Code (GitHub Copilot agent mode)",
    file: (c) => P(c).join(vscodeUser(c), "mcp.json"),
    appDir: vscodeUser,
    key: "servers",
    shape: (l) => ({ type: "stdio", ...standard(l) }),
  },
  {
    kind: "json",
    id: "opencode",
    label: "OpenCode",
    file: (c) => P(c).join(xdg(c), "opencode", "opencode.json"),
    appDir: (c) => P(c).join(xdg(c), "opencode"),
    key: "mcp",
    bin: "opencode",
    shape: (l) => ({ type: "local", command: [l.command, ...l.args], enabled: true, ...(Object.keys(l.env).length ? { environment: l.env } : {}) }),
  },
  {
    kind: "json",
    id: "antigravity",
    label: "Google Antigravity",
    file: antigravityFile,
    appDir: (c) => P(c).join(c.home, ".gemini"),
    key: "mcpServers",
    bin: "antigravity",
    shape: standard,
    note: "Config path comes from Google's Antigravity codelab; the stdio fields (command/args/env) follow the common mcpServers format and were not confirmed in Antigravity's own docs. After installing, open Antigravity > Settings > Installed MCP Servers > Refresh.",
  },
  {
    kind: "json",
    id: "cline",
    label: "Cline (VS Code)",
    file: clineFile,
    appDir: (c) => P(c).dirname(clineFile(c)),
    key: "mcpServers",
    shape: (l) => ({ ...standard(l), disabled: false, timeout: 90 }),
    note: "Cline settings path inferred from the VS Code extension's storage layout; verify in Cline > MCP Servers.",
  },
];

export const clientById = (id: string) => CLIENTS.find((c) => c.id === id);

export function configPathOf(def: ClientDef, c: Ctx): string {
  return def.kind === "cli" ? def.fallbackFile(c) : def.file(c);
}

export function isDetected(def: ClientDef, c: Ctx): boolean {
  if (def.kind === "cli") return Boolean(which(def.bin, c)) || existsSync(def.fallbackFile(c));
  return Boolean((def.bin && which(def.bin, c)) || existsSync(def.appDir(c)) || existsSync(def.file(c)));
}

// ---------------------------------------------------------------------------------------------
// TOML (Codex): replace only our own table, keep everything else byte-for-byte
// ---------------------------------------------------------------------------------------------

const tomlString = (s: string) => JSON.stringify(s);

export function removeTomlTable(text: string, name = SERVER_NAME): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let skipping = false;
  const own = `mcp_servers.${name}`;
  for (const line of lines) {
    const header = line.match(/^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/);
    if (header) {
      const table = header[1].replace(/"/g, "");
      skipping = table === own || table.startsWith(`${own}.`);
    }
    if (!skipping) kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function tomlBlock(l: Launch, name = SERVER_NAME): string {
  const lines = [
    `[mcp_servers.${name}]`,
    `command = ${tomlString(l.command)}`,
    `args = [${l.args.map(tomlString).join(", ")}]`,
    "startup_timeout_sec = 90", // the first launch downloads and builds the project
  ];
  if (Object.keys(l.env).length) {
    lines.push("", `[mcp_servers.${name}.env]`, ...Object.entries(l.env).map(([k, v]) => `${k} = ${tomlString(v)}`));
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------------------------
// apply / remove / status
// ---------------------------------------------------------------------------------------------

export interface ApplyOptions {
  dryRun?: boolean;
  /** Replace an existing custom entry (one that does not use the standard npx launch). */
  force?: boolean;
  source?: string;
  /** Put credentials in the client config instead of relying on the shared credentials file. */
  env?: Record<string, string>;
}

const deepEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function applyJson(def: JsonClient | CliClient, file: string, key: string, shape: Record<string, unknown>, opts: ApplyOptions, secret: boolean): ApplyResult {
  const base = { client: def.id, label: def.label, path: file } as const;
  let root: any = {};
  if (existsSync(file)) {
    try {
      root = parseJsonc(readFileSync(file, "utf8"));
    } catch {
      return { ...base, status: "error", error: `${file} is not valid JSON, so it was left untouched.` };
    }
    if (root === null || typeof root !== "object" || Array.isArray(root)) return { ...base, status: "error", error: `${file} does not contain a JSON object; left untouched.` };
  }
  const servers = root[key] && typeof root[key] === "object" ? root[key] : {};
  const previous = servers[SERVER_NAME];
  if (previous !== undefined && deepEqual(previous, shape)) return { ...base, status: "unchanged" };
  if (opts.dryRun) return { ...base, status: previous === undefined ? "installed" : "updated", note: "dry run: nothing written" };
  const bak = backup(file);
  root[key] = { ...servers, [SERVER_NAME]: shape };
  writeSecure(file, JSON.stringify(root, null, 2) + "\n", secret);
  return { ...base, status: previous === undefined ? "installed" : "updated", ...(bak ? { backup: bak } : {}) };
}

function run(cmd: string, args: string[], c: Ctx) {
  const win = c.platform === "win32";
  const quote = (a: string) => (win && /[\s()&|<>^"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  return spawnSync(cmd, win ? args.map(quote) : args, { encoding: "utf8", shell: win, env: c.env, timeout: 60000 });
}


interface Existing {
  /** Text of the current entry, used to recognise our own standard launch. */
  text: string;
  /** Environment variables already present in the entry (legacy installs keep their keys here). */
  env: Record<string, string>;
}

/** Look at the entry already registered under our name, without modifying anything. */
function readExisting(def: ClientDef, c: Ctx): Existing | undefined {
  const file = configPathOf(def, c);
  if (!existsSync(file)) return undefined;
  if (def.kind === "toml") {
    const lines = readFileSync(file, "utf8").split("\n");
    const own = `mcp_servers.${SERVER_NAME}`;
    let inOwn = false;
    let inEnv = false;
    const block: string[] = [];
    const env: Record<string, string> = {};
    for (const line of lines) {
      const header = line.match(/^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/);
      if (header) {
        const table = header[1].replace(/"/g, "");
        inOwn = table === own || table.startsWith(`${own}.`);
        inEnv = table === `${own}.env`;
      }
      if (!inOwn) continue;
      block.push(line);
      const kv = inEnv ? line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("(?:[^"\\]|\\.)*")/) : null;
      if (kv) {
        try {
          env[kv[1]] = JSON.parse(kv[2]);
        } catch {
          /* keep going */
        }
      }
    }
    return block.length ? { text: block.join("\n"), env } : undefined;
  }
  const key = def.kind === "json" ? def.key : "mcpServers";
  const entry = parseJsonc(readFileSync(file, "utf8"))?.[key]?.[SERVER_NAME];
  if (!entry || typeof entry !== "object") return undefined;
  const env = entry.env ?? entry.environment;
  return { text: JSON.stringify(entry), env: env && typeof env === "object" ? { ...env } : {} };
}

export function applyClient(def: ClientDef, c: Ctx, requested: Launch, opts: ApplyOptions = {}): ApplyResult {
  let prior: Existing | undefined;
  try {
    prior = readExisting(def, c);
  } catch {
    /* unreadable config: the writers below report it without touching the file */
  }
  // A custom entry (own binary, dev checkout...) is somebody's deliberate setup: keep it unless forced.
  if (prior && !opts.force && !prior.text.includes(opts.source ?? DEFAULT_SOURCE)) {
    return {
      client: def.id,
      label: def.label,
      status: "unchanged",
      path: configPathOf(def, c),
      note: "An existing custom 'tiendanube' entry was kept as is (it does not use the standard npx launch). Use --force to replace it.",
    };
  }
  // Never drop environment variables (keys, mode, domain) that an earlier setup put in the entry.
  const launch: Launch = { ...requested, env: { ...(prior?.env ?? {}), ...requested.env } };
  const secret = Object.keys(launch.env).length > 0;
  try {
    if (def.kind === "json") {
      const r = applyJson(def, def.file(c), def.key, def.shape(launch), opts, secret);
      return def.note ? { ...r, note: [r.note, def.note].filter(Boolean).join(" ") } : r;
    }
    if (def.kind === "toml") {
      const file = def.file(c);
      const current = existsSync(file) ? readFileSync(file, "utf8") : "";
      const block = tomlBlock(launch);
      const hadEntry = new RegExp(`^\\s*\\[mcp_servers\\.${SERVER_NAME}[\\].]`, "m").test(current);
      const without = removeTomlTable(current).replace(/\s+$/, "");
      const next = `${without}${without ? "\n\n" : ""}${block}`;
      if (current === next) return { client: def.id, label: def.label, status: "unchanged", path: file };
      if (opts.dryRun) return { client: def.id, label: def.label, status: hadEntry ? "updated" : "installed", path: file, note: "dry run: nothing written" };
      const bak = backup(file);
      writeSecure(file, next, secret);
      return { client: def.id, label: def.label, status: hadEntry ? "updated" : "installed", path: file, ...(bak ? { backup: bak } : {}) };
    }
    // Claude Code: use its own CLI when available (it owns ~/.claude.json), else edit the file.
    if (which(def.bin, c)) {
      if (opts.dryRun) return { client: def.id, label: def.label, status: "installed", note: "dry run: would run `claude mcp add`" };
      run(def.bin, ["mcp", "remove", SERVER_NAME, "--scope", "user"], c); // idempotent: ignore "not found"
      const envArgs = Object.entries(launch.env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
      const res = run(def.bin, ["mcp", "add", SERVER_NAME, "--scope", "user", ...envArgs, "--", launch.command, ...launch.args], c);
      if (res.status !== 0) return { client: def.id, label: def.label, status: "error", error: `claude mcp add failed: ${(res.stderr || res.stdout || "").trim().slice(0, 300)}` };
      return { client: def.id, label: def.label, status: "installed", note: "registered with `claude mcp add --scope user`" };
    }
    return applyJson(def, def.fallbackFile(c), "mcpServers", { type: "stdio", ...standard(launch) }, opts, secret);
  } catch (error) {
    return { client: def.id, label: def.label, status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

export function removeClient(def: ClientDef, c: Ctx, opts: { dryRun?: boolean } = {}): ApplyResult {
  const base = { client: def.id, label: def.label };
  try {
    if (def.kind === "cli" && which(def.bin, c)) {
      if (opts.dryRun) return { ...base, status: "removed", note: "dry run: would run `claude mcp remove`" };
      const res = run(def.bin, ["mcp", "remove", SERVER_NAME, "--scope", "user"], c);
      return { ...base, status: res.status === 0 ? "removed" : "not-registered" };
    }
    const file = configPathOf(def, c);
    if (!existsSync(file)) return { ...base, status: "not-registered", path: file };
    if (def.kind === "toml") {
      const current = readFileSync(file, "utf8");
      const next = removeTomlTable(current);
      if (next === current) return { ...base, status: "not-registered", path: file };
      if (opts.dryRun) return { ...base, status: "removed", path: file, note: "dry run: nothing written" };
      const bak = backup(file);
      writeFileSync(file, next);
      return { ...base, status: "removed", path: file, ...(bak ? { backup: bak } : {}) };
    }
    const key = def.kind === "json" ? def.key : "mcpServers";
    const root = parseJsonc(readFileSync(file, "utf8"));
    if (!root?.[key]?.[SERVER_NAME]) return { ...base, status: "not-registered", path: file };
    if (opts.dryRun) return { ...base, status: "removed", path: file, note: "dry run: nothing written" };
    const bak = backup(file);
    delete root[key][SERVER_NAME];
    writeFileSync(file, JSON.stringify(root, null, 2) + "\n");
    return { ...base, status: "removed", path: file, ...(bak ? { backup: bak } : {}) };
  } catch (error) {
    return { ...base, status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

/** Is the server already registered in this client? (used by `clients`) */
export function isRegistered(def: ClientDef, c: Ctx): boolean {
  try {
    if (def.kind === "cli" && which(def.bin, c)) return run(def.bin, ["mcp", "get", SERVER_NAME], c).status === 0;
    const file = configPathOf(def, c);
    if (!existsSync(file)) return false;
    if (def.kind === "toml") return new RegExp(`^\\s*\\[mcp_servers\\.${SERVER_NAME}[\\].]`, "m").test(readFileSync(file, "utf8"));
    const key = def.kind === "json" ? def.key : "mcpServers";
    return Boolean(parseJsonc(readFileSync(file, "utf8"))?.[key]?.[SERVER_NAME]);
  } catch {
    return false;
  }
}

/** Snippet for clients we do not know (printed by `install --client generic`). */
export function genericSnippet(l: Launch): string {
  return JSON.stringify({ mcpServers: { [SERVER_NAME]: standard(l) } }, null, 2);
}
