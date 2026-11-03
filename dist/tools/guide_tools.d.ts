import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SearchableTool } from "../guide.js";
import { ResolvedCredentials, TiendanubeClient } from "../services/client.js";
import { ToolModule } from "./registry.js";
export interface GuideContext {
    client: TiendanubeClient;
    modules: ToolModule[];
    readOnly: boolean;
    /** Every tool name + description the server exposes (API tools and workflow tools). */
    catalog: () => SearchableTool[];
    toolCount: () => number;
    credentials: () => ResolvedCredentials;
}
/** A path relative to the store: "/products", "/orders/123". No scheme, host, version, query or traversal. */
export declare function validateApiPath(path: string): string | undefined;
export declare function registerGuideTools(server: McpServer, ctx: GuideContext): void;
