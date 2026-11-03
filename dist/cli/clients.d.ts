/** Name under which the server is registered in every client. */
export declare const SERVER_NAME = "tiendanube";
export declare const DEFAULT_SOURCE = "github:fedeclavero/tiendanube-mcp";
export interface Ctx {
    home: string;
    platform: NodeJS.Platform;
    env: NodeJS.ProcessEnv;
}
export declare const defaultCtx: () => Ctx;
export interface Launch {
    command: string;
    args: string[];
    env: Record<string, string>;
}
export declare function launchSpec(c: Ctx, opts?: {
    source?: string;
    env?: Record<string, string>;
}): Launch;
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
/** JSON with comments / trailing commas (VS Code, OpenCode and Zed style configs). */
export declare function parseJsonc(text: string): any;
export declare function which(cmd: string, c: Ctx): string | undefined;
type Shape = (l: Launch) => Record<string, unknown>;
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
export declare const CLIENTS: ClientDef[];
export declare const clientById: (id: string) => ClientDef | undefined;
export declare function configPathOf(def: ClientDef, c: Ctx): string;
export declare function isDetected(def: ClientDef, c: Ctx): boolean;
export declare function removeTomlTable(text: string, name?: string): string;
export declare function tomlBlock(l: Launch, name?: string): string;
export interface ApplyOptions {
    dryRun?: boolean;
    /** Replace an existing custom entry (one that does not use the standard npx launch). */
    force?: boolean;
    source?: string;
    /** Put credentials in the client config instead of relying on the shared credentials file. */
    env?: Record<string, string>;
}
export declare function applyClient(def: ClientDef, c: Ctx, requested: Launch, opts?: ApplyOptions): ApplyResult;
export declare function removeClient(def: ClientDef, c: Ctx, opts?: {
    dryRun?: boolean;
}): ApplyResult;
/** Is the server already registered in this client? (used by `clients`) */
export declare function isRegistered(def: ClientDef, c: Ctx): boolean;
/** Snippet for clients we do not know (printed by `install --client generic`). */
export declare function genericSnippet(l: Launch): string;
export {};
