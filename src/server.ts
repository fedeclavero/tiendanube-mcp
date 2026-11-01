import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { registerResources } from "./resources.js";
import { TiendanubeClient } from "./services/client.js";
import { catalogModule } from "./tools/catalog.js";
import { contentModule } from "./tools/content_customization.js";
import { customersModule } from "./tools/customers.js";
import { extensibilityModule } from "./tools/extensibility_webhooks.js";
import { logisticsModule } from "./tools/logistics.js";
import { marketingModule } from "./tools/marketing.js";
import { registerOAuthTool } from "./tools/oauth.js";
import { ordersSalesModule } from "./tools/orders_sales.js";
import { paymentsBillingModule } from "./tools/payments_billing.js";
import { ToolModule, registerModules } from "./tools/registry.js";
import { storeModule } from "./tools/store.js";

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

export function createServer(client: TiendanubeClient, options: { readOnly?: boolean } = {}): McpServer {
  const server = new McpServer({ name: "tiendanube-mcp", version: VERSION });
  registerModules(server, client, MODULES, options);
  if (!options.readOnly) registerOAuthTool(server);
  registerResources(server);
  return server;
}

/** Number of tools the server exposes (the OAuth helper is omitted in read-only mode). */
export function countTools(readOnly = false): number {
  const api = MODULES.flatMap((m) => m.tools).filter((t) => !readOnly || t.method === "GET").length;
  return api + (readOnly ? 0 : 1);
}
