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
export declare function configDir(env?: Env, platform?: NodeJS.Platform): string;
export declare const credentialsPath: (env?: Env) => string;
/** Read the stored credentials; a missing or corrupt file yields an empty object. */
export declare function loadStored(env?: Env): StoredConfig;
/** Merge `patch` into the stored credentials (undefined values are ignored). Returns the file path. */
export declare function saveStored(patch: StoredConfig, env?: Env): string;
export declare const hasStored: (env?: Env) => boolean;
export {};
