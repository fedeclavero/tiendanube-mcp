import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TiendanubeClient } from "./services/client.js";
import { ToolModule } from "./tools/registry.js";
export declare const VERSION: string;
export declare const MODULES: ToolModule[];
export declare function createServer(client: TiendanubeClient, options?: {
    readOnly?: boolean;
}): McpServer;
/** Number of tools the server exposes (the OAuth helper is omitted in read-only mode). */
export declare function countTools(readOnly?: boolean): number;
