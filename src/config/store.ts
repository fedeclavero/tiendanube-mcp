import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Persistent, user-level credential store shared by every MCP client on the machine.
 * Saving the token once here means client configs (Claude, Codex, Cursor...) need no secrets,
 * and re-authorizing with new scopes never requires editing five config files.
 * Environment variables always win over this file.
 */
export interface StoredConfig {
  storeId?: string;
  accessToken?: string;
  userAgent?: string;
  apiDomain?: string;
  readOnly?: boolean;
  /** Scopes granted to the token, when known (returned by the OAuth exchange). */
  scopes?: string[];
  /** Kept so that re-authorizing (e.g. to add scopes) is a single command. */
  clientId?: string;
  clientSecret?: string;
  region?: "tiendanube" | "nuvemshop";
  savedAt?: string;
}

type Env = NodeJS.ProcessEnv;

export function configDir(env: Env = process.env, platform: NodeJS.Platform = process.platform): string {
  if (env.TIENDANUBE_MCP_HOME) return env.TIENDANUBE_MCP_HOME;
  if (platform === "win32") return join(env.APPDATA || join(homedir(), "AppData", "Roaming"), "tiendanube-mcp");
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "tiendanube-mcp");
}

export const credentialsPath = (env: Env = process.env): string => join(configDir(env), "credentials.json");

/** Read the stored credentials; a missing or corrupt file yields an empty object. */
export function loadStored(env: Env = process.env): StoredConfig {
  try {
    const parsed = JSON.parse(readFileSync(credentialsPath(env), "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as StoredConfig) : {};
  } catch {
    return {};
  }
}

/** Merge `patch` into the stored credentials (undefined values are ignored). Returns the file path. */
export function saveStored(patch: StoredConfig, env: Env = process.env): string {
  const file = credentialsPath(env);
  const dir = configDir(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const next: Record<string, unknown> = { ...loadStored(env) };
  for (const [key, value] of Object.entries(patch)) if (value !== undefined) next[key] = value;
  next.savedAt = new Date().toISOString();
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, file);
  try {
    chmodSync(file, 0o600); // no-op on Windows, where the user-profile ACL already restricts access
  } catch {
    /* best effort */
  }
  return file;
}

export const hasStored = (env: Env = process.env): boolean => existsSync(credentialsPath(env));
