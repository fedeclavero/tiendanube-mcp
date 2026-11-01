import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiVersion, DEFAULT_PER_PAGE } from "../constants.js";
import { Shape, fieldsParam, paginationShape, responseFormat } from "../schemas/common.js";
import { HttpMethod, TiendanubeApiError, TiendanubeClient } from "../services/client.js";
import { formatError } from "../services/errors.js";
import { ListEnvelope, ResponseFormat, render } from "../services/format.js";

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
  annotations?: { destructiveHint?: boolean; idempotentHint?: boolean };
}

const PLACEHOLDER = /\{([A-Za-z_]+)\}/g;
/** Path params whose value may legitimately contain `/` (e.g. products/variants). */
const RAW_PATH_PARAMS = new Set(["entity"]);

function placeholders(path: string): string[] {
  return [...path.matchAll(PLACEHOLDER)].map((m) => m[1]);
}

function buildInputShape(def: EndpointDef): Shape {
  const shape: Shape = {};
  const add = (source: Shape | undefined, origin: string) => {
    for (const [key, schema] of Object.entries(source ?? {})) {
      if (key in shape) throw new Error(`Tool ${def.name}: input '${key}' declared twice (${origin})`);
      shape[key] = schema;
    }
  };
  for (const key of placeholders(def.path)) {
    shape[key] = def.pathParams?.[key] ?? z.union([z.string(), z.number()]).describe(`${key} (ID)`);
  }
  add(def.query, "query");
  if (def.list) {
    add(paginationShape, "pagination");
    add({ fields: fieldsParam }, "fields");
  } else if (def.fields) {
    add({ fields: fieldsParam }, "fields");
  }
  add(def.body, "body");
  if (def.body && !def.bodyKey) {
    add(
      {
        additional_fields: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Extra raw API body fields not covered above; merged into the request body"),
      },
      "additional_fields",
    );
  }
  if (def.selectVersion) {
    add(
      { api_version: z.enum(["2025-03", "unstable"]).optional().describe("API branch to call (default 2025-03)") },
      "api_version",
    );
  }
  if (def.method === "GET") add({ response_format: responseFormat }, "response_format");
  return shape;
}

function hints(def: EndpointDef) {
  const m = def.method;
  return {
    readOnlyHint: m === "GET",
    destructiveHint: m === "GET" ? false : def.annotations?.destructiveHint ?? m === "DELETE",
    idempotentHint: m === "GET" ? true : def.annotations?.idempotentHint ?? (m === "PUT" || m === "PATCH" || m === "DELETE"),
    openWorldHint: true,
  };
}

function resolvePath(def: EndpointDef, input: Input): string {
  return def.path.replace(PLACEHOLDER, (_, key: string) => {
    const value = String(input[key]);
    if (!RAW_PATH_PARAMS.has(key)) return encodeURIComponent(value);
    if (!/^[a-z_]+(\/[a-z_]+)*$/.test(value)) throw new Error(`Invalid value for path parameter '${key}': ${value}`);
    return value;
  });
}

function pick(input: Input, shape: Shape | undefined): Input {
  const out: Input = {};
  for (const key of Object.keys(shape ?? {})) if (input[key] !== undefined) out[key] = input[key];
  return out;
}

/** Build the outgoing request pieces for a tool call (exported for tests). */
export function buildRequest(def: EndpointDef, input: Input) {
  const query = pick(input, def.query) as Record<string, string | number | boolean>;
  if (def.list) {
    query.page = (input.page as number) ?? 1;
    query.per_page = (input.per_page as number) ?? DEFAULT_PER_PAGE;
  }
  if ((def.list || def.fields) && input.fields) query.fields = input.fields as string;
  let body: unknown;
  if (def.bodyKey) body = input[def.bodyKey];
  else if (def.body) {
    body = { ...pick(input, def.body), ...((input.additional_fields as Input | undefined) ?? {}) };
  }
  return {
    method: def.method,
    path: resolvePath(def, input),
    version: ((input.api_version as ApiVersion | undefined) ??
      (typeof def.version === "function" ? def.version(input) : def.version)) as ApiVersion | undefined,
    query,
    body,
  };
}

function buildEnvelope(
  items: unknown,
  headers: Headers,
  page: number,
  perPage: number,
): ListEnvelope {
  const list = Array.isArray(items) ? items : [items];
  const total = Number(headers.get("x-total-count"));
  const link = headers.get("link") ?? "";
  const hasNextLink = /rel="?next"?/i.test(link);
  const hasMore = hasNextLink || (Number.isFinite(total) && headers.has("x-total-count") ? page * perPage < total : list.length >= perPage);
  return {
    count: list.length,
    page,
    per_page: perPage,
    ...(headers.has("x-total-count") && Number.isFinite(total) ? { total } : {}),
    has_more: hasMore,
    ...(hasMore ? { next_page: page + 1 } : {}),
    items: list,
  };
}

export function registerEndpoint(server: McpServer, client: TiendanubeClient, def: EndpointDef): void {
  const inputShape = buildInputShape(def);
  const versionLabel = typeof def.version === "string" ? def.version : def.version ? "2025-03 (unstable if noted)" : "2025-03";
  const description = [
    def.description,
    def.notes,
    `HTTP: ${def.method} ${def.path}`,
    `Required scope: ${def.scope}`,
    `API version: ${versionLabel}`,
    def.list ? "Returns {count, page, per_page, total?, has_more, next_page?, items[]}." : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  server.registerTool(
    def.name,
    { title: def.title, description, inputSchema: inputShape, annotations: hints(def) },
    async (input: Input) => {
      const req = buildRequest(def, input);
      try {
        const res = await client.request(req);
        const fmt = (input.response_format as ResponseFormat) ?? ResponseFormat.JSON;
        const payload = def.list ? buildEnvelope(res.data, res.headers, req.query.page as number, req.query.per_page as number) : res.data;
        const { text, structured } = render(payload, fmt);
        return { content: [{ type: "text" as const, text }], structuredContent: structured };
      } catch (error) {
        // Tiendanube answers 404 "Last page is N" for empty lists / out-of-range pages.
        if (def.list && error instanceof TiendanubeApiError && error.status === 404 && /last page/i.test(JSON.stringify(error.payload))) {
          const empty = buildEnvelope([], new Headers(), req.query.page as number, req.query.per_page as number);
          const fmt = (input.response_format as ResponseFormat) ?? ResponseFormat.JSON;
          const { text, structured } = render({ ...empty, has_more: false }, fmt);
          return { content: [{ type: "text" as const, text }], structuredContent: structured };
        }
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: formatError(error, { toolName: def.name, scope: def.scope, version: req.version }),
            },
          ],
        };
      }
    },
  );
}

export interface ToolModule {
  name: string;
  tools: EndpointDef[];
}

/** Register every tool of the given modules; optionally skip all non-GET tools. */
export function registerModules(
  server: McpServer,
  client: TiendanubeClient,
  modules: ToolModule[],
  options: { readOnly?: boolean } = {},
): number {
  const names = new Set<string>();
  let count = 0;
  for (const mod of modules) {
    for (const def of mod.tools) {
      if (names.has(def.name)) throw new Error(`Duplicate tool name: ${def.name}`);
      names.add(def.name);
      if (options.readOnly && def.method !== "GET") continue;
      registerEndpoint(server, client, def);
      count++;
    }
  }
  return count;
}
