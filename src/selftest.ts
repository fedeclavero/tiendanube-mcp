/**
 * Offline self-test: boots the server in-memory against a mocked fetch and
 * verifies tool registration, schemas, headers, versioning, pagination and errors.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "./server.js";
import { TiendanubeClient } from "./services/client.js";
import { CUSTOM_TOOLS } from "./tools/custom_meta.js";
import { EXAMPLES } from "./tools/examples.js";

// Hermetic: never read the developer's real credentials file or environment.
process.env.TIENDANUBE_MCP_HOME = mkdtempSync(join(tmpdir(), "tn-selftest-"));
for (const k of Object.keys(process.env)) if (k.startsWith("TIENDANUBE_") && k !== "TIENDANUBE_MCP_HOME") delete process.env[k];

interface Call { url: URL; init: RequestInit & { headers: Record<string, string> } }
const calls: Call[] = [];
let respond: (c: Call) => Response = () => new Response("{}", { status: 200 });

globalThis.fetch = (async (input: URL | string, init: RequestInit) => {
  const call = { url: new URL(String(input)), init: init as Call["init"] };
  calls.push(call);
  return respond(call);
}) as typeof fetch;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

async function connect(readOnly = false) {
  const server = createServer(new TiendanubeClient({ storeId: "42", accessToken: "tok", userAgent: "Test (t@t.com)" }), {
    readOnly,
    credentials: () => ({ storeId: "42", accessToken: "tok", readOnly, source: { storeId: "env", accessToken: "env" } }),
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

const text = (r: any) => r.content[0].text as string;

const client = await connect();
const { tools } = await client.listTools();
console.log(`tools registered: ${tools.length}`);
assert.equal(tools.length, 191 + CUSTOM_TOOLS.length, "expected full API coverage plus the guide/workflow tools");
assert.ok(tools.every((t) => t.name.startsWith("tiendanube_")));
assert.ok(tools.every((t) => t.annotations && typeof t.annotations.readOnlyHint === "boolean"));
const custom = new Set([...CUSTOM_TOOLS.map((t) => t.name), "tiendanube_oauth_exchange_code"]);
assert.ok(tools.filter((t) => !custom.has(t.name)).every((t) => t.description?.includes("Required scope")));
assert.ok(tools.filter((t) => !custom.has(t.name)).every((t) => t.description!.startsWith("Use this tool, not the browser")), "every API tool must lead with the anti-browser instruction");
assert.deepEqual(tools.slice(0, 5).map((t) => t.name), ["tiendanube_start_here", "tiendanube_find_tool", "tiendanube_get_recipe", "tiendanube_doctor", "tiendanube_api_request"], "entry-point tools must be listed first");
for (const t of CUSTOM_TOOLS) assert.ok(tools.find((x) => x.name === t.name), `missing custom tool ${t.name}`);
assert.match(client.getInstructions() ?? "", /NEVER use a browser/);
assert.match(client.getInstructions() ?? "", /tiendanube_start_here/);
for (const n of ["tiendanube_products_list", "tiendanube_orders_cancel", "tiendanube_variants_update_stock", "tiendanube_oauth_exchange_code", "tiendanube_webhooks_create"]) {
  assert.ok(tools.find((t) => t.name === n), `missing ${n}`);
}
assert.equal(tools.find((t) => t.name === "tiendanube_orders_cancel")!.annotations!.destructiveHint, true);
assert.equal(tools.find((t) => t.name === "tiendanube_products_list")!.annotations!.readOnlyHint, true);

// resources
const res = await client.listResources();
assert.deepEqual(res.resources.map((r) => r.uri).sort(), ["tiendanube://docs/checkout-sdk", "tiendanube://docs/scopes-and-limits", "tiendanube://guide/recipes", "tiendanube://guide/start-here"]);
assert.match(String(((await client.readResource({ uri: "tiendanube://docs/scopes-and-limits" })).contents[0] as any).text), /read_products/);

// headers + url + query + pagination
respond = () => json([{ id: 1, name: { es: "Remera" } }], 200, { "x-total-count": "45", "x-rate-limit-remaining": "30" });
let r: any = await client.callTool({ name: "tiendanube_products_list", arguments: { q: "rem", published: true, per_page: 1 } });
let c = calls.at(-1)!;
assert.equal(c.url.pathname, "/2025-03/42/products");
assert.equal(c.url.searchParams.get("q"), "rem");
assert.equal(c.url.searchParams.get("published"), "true");
assert.equal(c.url.searchParams.get("per_page"), "1");
assert.equal(c.init.headers.Authentication, "bearer tok");
assert.equal(c.init.headers.Authorization, "Bearer tok");
assert.equal(c.init.headers["User-Agent"], "Test (t@t.com)");
assert.equal(r.structuredContent.total, 45);
assert.equal(r.structuredContent.has_more, true);
assert.equal(r.structuredContent.next_page, 2);

// markdown format
r = await client.callTool({ name: "tiendanube_products_list", arguments: { response_format: "markdown" } });
assert.match(text(r), /Remera/);

// path params, body split, additional_fields
respond = () => json({ id: 9 }, 201);
r = await client.callTool({
  name: "tiendanube_variants_update_stock",
  arguments: { product_id: 7, action: "replace", value: null, location_id: "L1" },
});
c = calls.at(-1)!;
assert.equal(c.init.method, "POST");
assert.equal(c.url.pathname, "/2025-03/42/products/7/variants/stock");
assert.deepEqual(JSON.parse(c.init.body as string), { action: "replace", value: null, location_id: "L1" });
await client.callTool({ name: "tiendanube_categories_create", arguments: { name: { es: "Ropa" }, additional_fields: { foo: 1 } } });
assert.deepEqual(JSON.parse(calls.at(-1)!.init.body as string), { name: { es: "Ropa" }, foo: 1 });

// array body
await client.callTool({ name: "tiendanube_products_batch_stock_price", arguments: { items: [{ id: 1, variants: [{ id: 2, price: "10" }] }] } });
assert.equal(calls.at(-1)!.init.method, "PATCH");
assert.deepEqual(JSON.parse(calls.at(-1)!.init.body as string), [{ id: 1, variants: [{ id: 2, price: "10" }] }]);

// unstable versioning (fixed, input-driven, selectable)
await client.callTool({ name: "tiendanube_external_invoices_list", arguments: { order_id: "123" } });
assert.equal(calls.at(-1)!.url.pathname, "/unstable/42/orders/123/invoices/external");
await client.callTool({ name: "tiendanube_orders_list", arguments: { aggregates: "price_tables" } });
assert.equal(calls.at(-1)!.url.pathname, "/unstable/42/orders");
await client.callTool({ name: "tiendanube_orders_list", arguments: {} });
assert.equal(calls.at(-1)!.url.pathname, "/2025-03/42/orders");
await client.callTool({ name: "tiendanube_disputes_get", arguments: { order_id: 1, transaction_id: 2, dispute_id: 3, api_version: "unstable" } });
assert.equal(calls.at(-1)!.url.pathname, "/unstable/42/orders/1/transactions/2/disputes/3");

// custom fields entity with slash
await client.callTool({ name: "tiendanube_custom_fields_list", arguments: { entity: "products/variants" } });
assert.equal(calls.at(-1)!.url.pathname, "/2025-03/42/products/variants/custom-fields");

// path encoding
await client.callTool({ name: "tiendanube_products_get_by_sku", arguments: { sku: "A/B 1" } });
assert.equal(calls.at(-1)!.url.pathname, "/2025-03/42/products/sku/A%2FB%201");

// 64-bit id as string preserved
await client.callTool({ name: "tiendanube_carts_delete_line_item", arguments: { id: "c1", line_item_id: "9007199254740993" } });
assert.match(calls.at(-1)!.url.pathname, /9007199254740993$/);

// schema validation failures surface as errors
r = await client.callTool({ name: "tiendanube_webhooks_create", arguments: { url: "http://insecure", event: "order/paid" } }).catch((e) => ({ isError: true, content: [{ text: String(e) }] }));
assert.equal(r.isError, true);

// error mapping
respond = () => json({ code: 403 }, 403);
r = await client.callTool({ name: "tiendanube_products_delete", arguments: { id: 1 } });
assert.equal(r.isError, true);
assert.match(text(r), /write_products/);
respond = () => json({ description: "Last page is 0" }, 404);
r = await client.callTool({ name: "tiendanube_orders_list", arguments: {} });
assert.notEqual(r.isError, true);
assert.equal(r.structuredContent.count, 0);
respond = () => json({ description: "nope" }, 404);
r = await client.callTool({ name: "tiendanube_products_get", arguments: { id: 1 } });
assert.equal(r.isError, true);
respond = () => json({ name: ["is invalid"] }, 422);
r = await client.callTool({ name: "tiendanube_products_create", arguments: { name: { es: "x" } } });
assert.match(text(r), /is invalid/);

// 429 retry
let n = 0;
respond = () => (n++ === 0 ? json({}, 429, { "x-rate-limit-reset": "10" }) : json({ ok: true }));
r = await client.callTool({ name: "tiendanube_store_get", arguments: {} });
assert.equal(r.structuredContent.ok, true);
assert.equal(n, 2);

// 204 handling
respond = () => new Response(null, { status: 204 });
r = await client.callTool({ name: "tiendanube_products_delete", arguments: { id: 5 } });
assert.equal(r.structuredContent.success, true);

// truncation
respond = () => json(Array.from({ length: 400 }, (_, i) => ({ id: i, description: "x".repeat(200) })));
r = await client.callTool({ name: "tiendanube_products_list", arguments: { per_page: 200 } });
assert.ok(text(r).length <= 26000);
assert.equal(r.structuredContent.truncated, true);


// ---- examples in descriptions must be valid against the real input schema
respond = () => json({});
for (const [name, args] of Object.entries(EXAMPLES)) {
  const r: any = await client.callTool({ name, arguments: args }).catch((e) => ({ isError: true, content: [{ text: `THROWN ${String(e)}` }] }));
  assert.ok(!/THROWN|Invalid|invalid_type|validation/i.test(JSON.stringify(r.content ?? "")), `example for ${name} is invalid: ${JSON.stringify(r.content)}`);
}
assert.match(tools.find((t) => t.name === "tiendanube_products_list")!.description!, /Example arguments: \{"q":"remera"/);

// ---- guide tools
r = await client.callTool({ name: "tiendanube_start_here", arguments: {} });
assert.match(text(r), /Do not open a browser/);
assert.match(text(r), /tiendanube_create_combo/);
r = await client.callTool({ name: "tiendanube_find_tool", arguments: { query: "quiero subir los precios de una categoría" } });
assert.match(text(r), /tiendanube_products_batch_stock_price|tiendanube_categories_list|tiendanube_variants_update/);
assert.match(text(r), /bulk-price/);
r = await client.callTool({ name: "tiendanube_find_tool", arguments: { query: "armar combos de mis productos" } });
assert.match(text(r), /tiendanube_create_combo/);
assert.match(text(r), /combo/);
r = await client.callTool({ name: "tiendanube_get_recipe", arguments: { id: "combo" } });
assert.match(text(r), /tiendanube_create_combo/);
r = await client.callTool({ name: "tiendanube_get_recipe", arguments: { query: "pedidos pagos sin enviar" } });
assert.match(text(r), /orders-to-ship|financial_status/);
r = await client.callTool({ name: "tiendanube_get_recipe", arguments: {} });
assert.match(text(r), /fix-access/);

// ---- every error ends with an actionable next step
for (const [status, rx] of [[401, /tiendanube_doctor/], [403, /ALL permissions/], [404, /_list/], [409, /duplicated/], [422, /fix the fields/], [429, /batch/], [500, /retry/]] as const) {
  respond = () => json({ description: "x" }, status);
  r = await client.callTool({ name: "tiendanube_products_get", arguments: { id: 1 } });
  assert.equal(r.isError, true);
  assert.match(text(r), /Next step: /, `status ${status} lacks a next step`);
  assert.match(text(r), rx, `status ${status} next step is wrong: ${text(r)}`);
}

// ---- generic api request: fixed origin, path validation, read-only guard
respond = () => json([{ id: 1 }]);
r = await client.callTool({ name: "tiendanube_api_request", arguments: { path: "/products", query: { per_page: 5 } } });
c = calls.at(-1)!;
assert.equal(c.url.origin, "https://api.tiendanube.com");
assert.equal(c.url.pathname, "/2025-03/42/products");
assert.equal(c.url.searchParams.get("per_page"), "5");
for (const bad of ["products", "/../x", "/products?x=1", "//evil.com/x", "/2025-03/products", "https://evil.com/x", "/a\\b"]) {
  const before = calls.length;
  r = await client.callTool({ name: "tiendanube_api_request", arguments: { path: bad } });
  assert.equal(r.isError, true, `path ${bad} should be rejected`);
  assert.equal(calls.length, before, `rejected path ${bad} must not hit the network`);
}
await client.callTool({ name: "tiendanube_api_request", arguments: { method: "POST", path: "/products", body: { name: { es: "x" } } } });
assert.equal(calls.at(-1)!.init.method, "POST");

// ---- doctor: finds missing scopes in one pass
respond = (call) =>
  call.url.pathname.endsWith("/store") ? json({ id: 42, name: { es: "Mi Tienda" }, plan_name: "Pro", country: "AR", main_currency: "ARS", languages: ["es"] })
  : /\/orders|\/customers/.test(call.url.pathname) ? json({ code: 403 }, 403)
  : json([]);
r = await client.callTool({ name: "tiendanube_doctor", arguments: {} });
assert.equal(r.structuredContent.ok, false);
assert.deepEqual([...r.structuredContent.missingReadScopes].sort().filter((s: string) => /orders|customers/.test(s)), ["read_customers", "read_orders"]);
assert.equal(r.structuredContent.readScopes.read_products, "ok");
assert.match(text(r), /NEXT STEP/);
assert.match(text(r), /tick ALL permissions/);
respond = () => json({ code: 401 }, 401);
r = await client.callTool({ name: "tiendanube_doctor", arguments: { probe_scopes: false } });
assert.equal(r.structuredContent.ok, false);
assert.match(text(r), /configure --store-id/);

// ---- image upload from a local file
const dir = mkdtempSync(join(tmpdir(), "tn-img-"));
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fake-png-body")]);
writeFileSync(join(dir, "combo.png"), png);
writeFileSync(join(dir, "secret.png"), "plain text that only pretends to be an image"); // looks like an image by name only
respond = () => json({ id: 77, src: "https://cdn/x.png" }, 201);
r = await client.callTool({ name: "tiendanube_product_image_add_from_file", arguments: { product_id: 9, file_path: join(dir, "combo.png"), position: 1, alt: { es: "Combo" } } });
assert.notEqual(r.isError, true, text(r));
c = calls.at(-1)!;
assert.equal(c.init.method, "POST");
assert.equal(c.url.pathname, "/2025-03/42/products/9/images");
const sent = JSON.parse(c.init.body as string);
assert.equal(sent.attachment, png.toString("base64"));
assert.equal(sent.filename, "combo.png");
assert.equal(sent.position, 1);
const before = calls.length;
r = await client.callTool({ name: "tiendanube_product_image_add_from_file", arguments: { product_id: 9, file_path: join(dir, "secret.png") } });
assert.equal(r.isError, true);
assert.match(text(r), /not a JPEG, PNG, GIF or WEBP/);
r = await client.callTool({ name: "tiendanube_product_image_add_from_file", arguments: { product_id: 9, file_path: join(dir, "nope.png") } });
assert.equal(r.isError, true);
assert.equal(calls.length, before, "non-images and missing files must never reach the network");

// ---- combo workflow
const products: Record<string, any> = {
  "111": { id: 111, name: { es: "Remera" }, images: [{ src: "https://cdn/r.jpg" }], variants: [{ id: 1111, price: "10000.00", promotional_price: null, stock_management: true, stock: 10, weight: "0.3", sku: "R" }] },
  "222": { id: 222, name: { es: "Gorra" }, images: [{ src: "https://cdn/g.jpg" }], variants: [{ id: 2221, price: "4000.00", stock_management: true, stock: 7, weight: "0.2" }] },
  "333": { id: 333, name: { es: "Zapatilla" }, images: [], variants: [{ id: 3331, price: "50000.00", values: [{ es: "40" }], stock: 1, stock_management: true }, { id: 3332, price: "50000.00", values: [{ es: "41" }], stock: 1, stock_management: true }] },
};
respond = (call) => {
  const m = call.url.pathname.match(/\/products\/(\d+)$/);
  if (call.url.pathname.endsWith("/store")) return json({ languages: ["es"], main_language: "es" });
  if (call.init.method === "GET" && m) return json(products[m[1]]);
  if (call.init.method === "POST" && call.url.pathname.endsWith("/products")) return json({ id: 900, name: JSON.parse(call.init.body as string).name, published: false, handle: { es: "combo" } }, 201);
  if (call.init.method === "POST" && call.url.pathname.endsWith("/images")) return json({ id: 5, src: "https://cdn/c.png" }, 201);
  return json({});
};
let postsBefore = calls.filter((x) => x.init.method === "POST").length;
r = await client.callTool({ name: "tiendanube_create_combo", arguments: { name: "Combo Verano", components: [{ product_id: 111, quantity: 1 }, { product_id: 222, quantity: 2 }], discount_percent: 10, dry_run: true } });
assert.notEqual(r.isError, true, text(r));
assert.equal(calls.filter((x) => x.init.method === "POST").length, postsBefore, "dry_run must not write");
assert.equal(r.structuredContent.price, "16200.00"); // (10000 + 2*4000) * 0.9
assert.equal(r.structuredContent.stock, 3); // min(10/1, floor(7/2)=3)
r = await client.callTool({ name: "tiendanube_create_combo", arguments: { name: "Combo Verano", components: [{ product_id: 111, quantity: 1 }, { product_id: 222, quantity: 2 }], discount_percent: 10, image_files: [join(dir, "combo.png")] } });
assert.notEqual(r.isError, true, text(r));
const create = calls.filter((x) => x.init.method === "POST" && x.url.pathname.endsWith("/products")).at(-1)!;
const body = JSON.parse(create.init.body as string);
assert.deepEqual(body.name, { es: "Combo Verano" });
assert.equal(body.published, false, "combos are created as drafts");
assert.equal(body.variants[0].price, "16200.00");
assert.equal(body.variants[0].stock, 3);
assert.equal(body.variants[0].weight, "0.7");
assert.match(body.description.es, /1 x Remera/);
assert.match(body.description.es, /2 x Gorra/);
assert.equal(body.images, undefined, "uploaded files replace component photos");
assert.equal(calls.at(-1)!.url.pathname, "/2025-03/42/products/900/images");
assert.equal(r.structuredContent.images_uploaded, 1);
assert.ok(r.structuredContent.warnings.some((w: string) => /does NOT deduct/.test(w)));
assert.match(r.structuredContent.next_steps[0], /"published":true/);
r = await client.callTool({ name: "tiendanube_create_combo", arguments: { name: "Combo", components: [{ product_id: 111 }, { product_id: 222 }], dry_run: true } });
assert.deepEqual(JSON.parse(text(r).replace(/^DRY RUN \(nothing created\):\n/, "")).request_body.images.map((i: any) => i.src), ["https://cdn/r.jpg", "https://cdn/g.jpg"]);
r = await client.callTool({ name: "tiendanube_create_combo", arguments: { name: "Combo", components: [{ product_id: 333 }, { product_id: 111 }] } });
assert.equal(r.isError, true);
assert.match(text(r), /variant_id is required/);
assert.match(text(r), /3332/);
r = await client.callTool({ name: "tiendanube_create_combo", arguments: { name: "Combo", components: [{ product_id: 333, variant_id: 3332 }, { product_id: 111 }], price: 55000, stock: 2, dry_run: true } });
assert.equal(r.structuredContent.price, "55000.00");
assert.equal(r.structuredContent.stock, 2);

// read-only mode
const ro = await connect(true);
const roTools = (await ro.listTools()).tools;
const roNames = new Set(roTools.map((t) => t.name));
assert.ok(roTools.length > 50);
for (const name of ["tiendanube_create_combo", "tiendanube_product_image_add_from_file", "tiendanube_oauth_exchange_code"]) assert.ok(!roNames.has(name), `${name} must not exist in read-only mode`);
for (const name of ["tiendanube_start_here", "tiendanube_doctor", "tiendanube_find_tool"]) assert.ok(roNames.has(name), `${name} must exist in read-only mode`);
assert.ok(roTools.filter((t) => t.name !== "tiendanube_api_request").every((t) => t.annotations?.readOnlyHint === true));
r = await ro.callTool({ name: "tiendanube_api_request", arguments: { method: "DELETE", path: "/products/1" } });
assert.equal(r.isError, true);
assert.match(text(r), /read-only/);

console.log("all self-tests passed");
