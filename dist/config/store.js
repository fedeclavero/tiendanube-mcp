import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
export function configDir(env = process.env, platform = process.platform) {
    if (env.TIENDANUBE_MCP_HOME)
        return env.TIENDANUBE_MCP_HOME;
    if (platform === "win32")
        return join(env.APPDATA || join(homedir(), "AppData", "Roaming"), "tiendanube-mcp");
    return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "tiendanube-mcp");
}
export const credentialsPath = (env = process.env) => join(configDir(env), "credentials.json");
/** Read the stored credentials; a missing or corrupt file yields an empty object. */
export function loadStored(env = process.env) {
    try {
        const parsed = JSON.parse(readFileSync(credentialsPath(env), "utf8"));
        return parsed && typeof parsed === "object" ? parsed : {};
    }
    catch {
        return {};
    }
}
/** Merge `patch` into the stored credentials (undefined values are ignored). Returns the file path. */
export function saveStored(patch, env = process.env) {
    const file = credentialsPath(env);
    const dir = configDir(env);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const next = { ...loadStored(env) };
    for (const [key, value] of Object.entries(patch))
        if (value !== undefined)
            next[key] = value;
    next.savedAt = new Date().toISOString();
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, file);
    try {
        chmodSync(file, 0o600); // no-op on Windows, where the user-profile ACL already restricts access
    }
    catch {
        /* best effort */
    }
    return file;
}
export const hasStored = (env = process.env) => existsSync(credentialsPath(env));
//# sourceMappingURL=store.js.map