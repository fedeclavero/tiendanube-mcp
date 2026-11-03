import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ApiVersion } from "../constants.js";
import { Shape } from "../schemas/common.js";
import { HttpMethod, TiendanubeClient } from "../services/client.js";
type Input = Record<string, unknown>;
/** Declarative description of one REST endpoint exposed as one MCP tool. */
export interface EndpointDef {
    name: string;
    title: string;
    description: string;
    method: HttpMethod;
    /** Path relative to /{version}/{store_id}; `{param}` placeholders become required inputs. */
    path: string;
    /** Required OAuth scope(s), for docs and 403 hints. */
    scope: string;
    /** API version; function form lets a tool switch to `unstable` based on its input. */
    version?: ApiVersion | ((input: Input) => ApiVersion | undefined);
    /** Overrides/descriptions for path placeholders (defaults to a generic ID schema). */
    pathParams?: Shape;
    query?: Shape;
    body?: Shape;
    /** If set, the request body is `input[bodyKey]` (used for array bodies). */
    bodyKey?: string;
    /** Adds page/per_page/fields and returns a pagination envelope. */
    list?: boolean;
    /** Adds an optional `api_version` input ('2025-03' | 'unstable') so the caller can pick the API branch. */
    selectVersion?: boolean;
    /** Adds the `fields` query parameter on a single-resource GET. */
    fields?: boolean;
    /** Extra notes appended to the description. */
    notes?: string;
    annotations?: {
        destructiveHint?: boolean;
        idempotentHint?: boolean;
    };
}
/** Build the outgoing request pieces for a tool call (exported for tests). */
export declare function buildRequest(def: EndpointDef, input: Input): {
    method: HttpMethod;
    path: string;
    version: ApiVersion | undefined;
    query: Record<string, string | number | boolean>;
    body: unknown;
};
/** Build the model-facing description: an imperative lead-in, the details, and an exact example. */
export declare function describeEndpoint(def: EndpointDef): string;
export declare function registerEndpoint(server: McpServer, client: TiendanubeClient, def: EndpointDef): void;
export interface ToolModule {
    name: string;
    tools: EndpointDef[];
}
/** Register every tool of the given modules; optionally skip all non-GET tools. */
export declare function registerModules(server: McpServer, client: TiendanubeClient, modules: ToolModule[], options?: {
    readOnly?: boolean;
}): number;
export {};
