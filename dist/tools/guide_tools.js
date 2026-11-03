import { z } from "zod";
import { diagnose, renderReport } from "../doctor.js";
import { RECIPES, recipeText, searchRecipes, searchTools, startHereText } from "../guide.js";
import { formatError } from "../services/errors.js";
import { ResponseFormat, render } from "../services/format.js";
import { fail, ok } from "./result.js";
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
/** A path relative to the store: "/products", "/orders/123". No scheme, host, version, query or traversal. */
export function validateApiPath(path) {
    if (!path.startsWith("/"))
        return 'path must start with "/", e.g. "/products" or "/orders/123".';
    if (/[?#\\]/.test(path))
        return 'path must not contain "?", "#" or backslashes: pass filters in "query".';
    if (/(^|\/)\.\.?(\/|$)/.test(path) || path.includes("//"))
        return 'path must not contain "..", "." segments or "//".';
    if (/^\/(v\d+|\d{4}-\d{2}|unstable)(\/|$)/.test(path))
        return 'do not put the API version in the path; use the "api_version" argument.';
    if (!/^\/[A-Za-z0-9_\-./%:]*$/.test(path))
        return "path contains invalid characters.";
    return undefined;
}
export function registerGuideTools(server, ctx) {
    server.registerTool("tiendanube_start_here", {
        title: "Start Here: How To Use This Store MCP",
        description: "CALL THIS FIRST in any conversation about the user's Tiendanube store. Returns the map 'if the user asks X, call tool Y', the golden rules and the list of step-by-step recipes. Use these tools instead of a browser or the admin panel.",
        inputSchema: {},
        annotations: READ,
    }, async () => ok(startHereText(ctx.toolCount()), { recipes: RECIPES.map((r) => ({ id: r.id, title: r.title })) }));
    server.registerTool("tiendanube_find_tool", {
        title: "Find The Right Tool",
        description: 'Use when you do not know which tool does what you need. Describe the job in plain Spanish or English and get the matching tools and recipes. Example arguments: {"query":"subir precios de una categoría"}',
        inputSchema: { query: z.string().min(2).describe("What you want to do, in plain language") },
        annotations: READ,
    }, async ({ query }) => {
        const tools = searchTools(query, ctx.catalog());
        const recipes = searchRecipes(query);
        const lines = [
            `# Tools for: ${query}`,
            ...(tools.length ? tools.map((t) => `- ${t.name} [${t.method}]: ${t.description.split("\n")[0].slice(0, 200)}`) : ["- (no direct match: try different words, or use tiendanube_api_request)"]),
            ...(recipes.length ? ["", "Recipes (call tiendanube_get_recipe with the id):", ...recipes.map((r) => `- ${r.id}: ${r.title}`)] : []),
            "",
            "Tip: read a tool's description for its exact arguments. Example arguments are included for the main tools.",
        ];
        return ok(lines.join("\n"), { tools: tools.map((t) => t.name), recipes: recipes.map((r) => r.id) });
    });
    server.registerTool("tiendanube_get_recipe", {
        title: "Get A Step-By-Step Recipe",
        description: 'Use for multi-step jobs. Returns the exact tools and arguments to use, in order. Pass "id" (see tiendanube_start_here) or a plain-language "query". Without arguments it lists all recipes. Example arguments: {"id":"combo"}',
        inputSchema: {
            id: z.string().optional().describe(`Recipe id: ${RECIPES.map((r) => r.id).join(" | ")}`),
            query: z.string().optional().describe("Or describe the job in plain language"),
        },
        annotations: READ,
    }, async ({ id, query }) => {
        let recipe = id ? RECIPES.find((r) => r.id === id.toLowerCase().trim()) : undefined;
        if (!recipe && query)
            recipe = searchRecipes(query)[0];
        if (!recipe) {
            const list = RECIPES.map((r) => `- ${r.id}: ${r.title}`).join("\n");
            return ok(`Available recipes:\n${list}\n\nCall again with {"id":"<recipe id>"}.`, { recipes: RECIPES.map((r) => r.id) });
        }
        return ok(recipeText(recipe), { id: recipe.id, steps: recipe.steps });
    });
    server.registerTool("tiendanube_doctor", {
        title: "Diagnose Connection And Permissions",
        description: "Use when anything fails (401, 403, missing permissions, 'not connected') or right after installing. Shows which credentials are active, the store, the mode and which read permissions are missing, and ends with the exact NEXT STEP commands. You may run those commands yourself. Example arguments: {}",
        inputSchema: { probe_scopes: z.boolean().default(true).describe("Also test one read endpoint per permission (about 15 quick requests)") },
        annotations: { ...READ, openWorldHint: true },
    }, async ({ probe_scopes }) => {
        const report = await diagnose(ctx.credentials(), ctx.client, ctx.modules, { probeScopes: probe_scopes });
        return { content: [{ type: "text", text: renderReport(report) }], structuredContent: report };
    });
    server.registerTool("tiendanube_api_request", {
        title: "Generic Tiendanube API Request",
        description: 'LAST RESORT before asking the user: call any Tiendanube API route that has no dedicated tool (use tiendanube_find_tool first). The path is relative to the user\'s own store: do NOT include the version or store id. Only the user\'s store can be reached. Example arguments: {"method":"GET","path":"/products","query":{"per_page":5}}' +
            (ctx.readOnly ? " (read-only mode: GET only)" : ""),
        inputSchema: {
            method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET").describe("HTTP method"),
            path: z.string().min(1).describe('Route relative to the store, e.g. "/products", "/orders/123", "/products/9/variants"'),
            query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe("Query string parameters"),
            body: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]).optional().describe("JSON body for POST/PUT/PATCH"),
            api_version: z.enum(["2025-03", "v1", "unstable"]).optional().describe("API branch (default 2025-03)"),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    }, async ({ method, path, query, body, api_version }) => {
        const problem = validateApiPath(path);
        if (problem)
            return fail(`Error: ${problem}\nNext step: fix the path and call again.`);
        if (ctx.readOnly && method !== "GET") {
            return fail("Error: the server is in read-only mode, only GET is allowed.\nNext step: ask the user to switch to read-write (run: npx -y github:fedeclavero/tiendanube-mcp configure --read-write) and restart the client.");
        }
        try {
            const res = await ctx.client.request({ method, path, query, body, version: api_version });
            const { text, structured } = render(res.data, ResponseFormat.JSON);
            return { content: [{ type: "text", text }], structuredContent: structured };
        }
        catch (error) {
            return fail(formatError(error, { toolName: "tiendanube_api_request", scope: "the scope of that resource", version: api_version }));
        }
    });
}
//# sourceMappingURL=guide_tools.js.map