import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { SERVER_INSTRUCTIONS } from "./guide.js";
import { registerResources } from "./resources.js";
import { ResolvedCredentials, TiendanubeClient, resolveCredentials } from "./services/client.js";
import { catalogModule } from "./tools/catalog.js";
import { contentModule } from "./tools/content_customization.js";
import { customersModule } from "./tools/customers.js";
import { CUSTOM_TOOLS, customToolCount } from "./tools/custom_meta.js";
import { extensibilityModule } from "./tools/extensibility_webhooks.js";
import { registerGuideTools } from "./tools/guide_tools.js";
import { logisticsModule } from "./tools/logistics.js";
import { marketingModule } from "./tools/marketing.js";
import { registerOAuthTool } from "./tools/oauth.js";
import { ordersSalesModule } from "./tools/orders_sales.js";
import { paymentsBillingModule } from "./tools/payments_billing.js";
import { ToolModule, registerModules } from "./tools/registry.js";
import { storeModule } from "./tools/store.js";
import { registerWorkflowTools } from "./tools/workflows.js";

export const VERSION: string = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

export const MODULES: ToolModule[] = [
  storeModule,
  catalogModule,
  ordersSalesModule,
  customersModule,
  marketingModule,
  logisticsModule,
  paymentsBillingModule,
  contentModule,
  extensibilityModule,
];

export function createServer(
  client: TiendanubeClient,
  options: { readOnly?: boolean; credentials?: () => ResolvedCredentials } = {},
): McpServer {
  const readOnly = Boolean(options.readOnly);
  // `instructions` is delivered to the client on initialize: the first line of defence against
  // agents that ignore the MCP and drive a browser instead.
  const server = new McpServer({ name: "tiendanube-mcp", version: VERSION }, { instructions: SERVER_INSTRUCTIONS });

  const catalog = () => [
    ...CUSTOM_TOOLS.filter((t) => !readOnly || !t.writeOnly).map((t) => ({ name: t.name, description: t.summary, method: "TOOL" })),
    ...MODULES.flatMap((m) => m.tools)
      .filter((t) => !readOnly || t.method === "GET")
      .map((t) => ({ name: t.name, description: `${t.title}. ${t.description}`, method: t.method })),
  ];

  // Registration order is listing order: the entry-point and workflow tools come first on purpose.
  registerGuideTools(server, {
    client,
    modules: MODULES,
    readOnly,
    catalog,
    toolCount: () => countTools(readOnly),
    credentials: options.credentials ?? (() => resolveCredentials()),
  });
  registerWorkflowTools(server, client, { readOnly });
  registerModules(server, client, MODULES, { readOnly });
  if (!readOnly) registerOAuthTool(server);
  registerResources(server);
  return server;
}

/** Number of tools the server exposes (write tools and the OAuth helper are omitted in read-only mode). */
export function countTools(readOnly = false): number {
  const api = MODULES.flatMap((m) => m.tools).filter((t) => !readOnly || t.method === "GET").length;
  return api + customToolCount(readOnly) + (readOnly ? 0 : 1);
}
