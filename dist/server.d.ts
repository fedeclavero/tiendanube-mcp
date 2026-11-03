import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResolvedCredentials, TiendanubeClient } from "./services/client.js";
import { ToolModule } from "./tools/registry.js";
export declare const VERSION: string;
export declare const MODULES: ToolModule[];
export declare function createServer(client: TiendanubeClient, options?: {
    readOnly?: boolean;
    credentials?: () => ResolvedCredentials;
}): McpServer;
/** Number of tools the server exposes (write tools and the OAuth helper are omitted in read-only mode). */
export declare function countTools(readOnly?: boolean): number;
