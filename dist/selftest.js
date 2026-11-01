/**
 * Offline self-test: boots the server in-memory against a mocked fetch and
 * verifies tool registration, schemas, headers, versioning, pagination and errors.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import assert from "node:assert/strict";
import { createServer } from "./server.js";
import { TiendanubeClient } from "./services/client.js";
const calls = [];
let respond = () => new Response("{}", { status: 200 });
globalThis.fetch = (async (input, init) => {
    const call = { url: new URL(String(input)), init: init };
    calls.push(call);
    return respond(call);
});
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
async function connect(readOnly = false) {
    const server = createServer(new TiendanubeClient({ storeId: "42", accessToken: "tok", userAgent: "Test (t@t.com)" }), { readOnly });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([server.connect(a), client.connect(b)]);
    return client;
}
const text = (r) => r.content[0].text;
const client = await connect();
const { tools } = await client.listTools();
console.log(`tools registered: ${tools.length}`);
assert.ok(tools.length >= 190, "expected full API coverage");
assert.ok(tools.every((t) => t.name.startsWith("tiendanube_")));
assert.ok(tools.every((t) => t.annotations && typeof t.annotations.readOnlyHint === "boolean"));
assert.ok(tools.filter((t) => t.name !== "tiendanube_oauth_exchange_code").every((t) => t.description?.includes("Required scope")));
for (const n of ["tiendanube_products_list", "tiendanube_orders_cancel", "tiendanube_variants_update_stock", "tiendanube_oauth_exchange_code", "tiendanube_webhooks_create"]) {
    assert.ok(tools.find((t) => t.name === n), `missing ${n}`);
}
assert.equal(tools.find((t) => t.name === "tiendanube_orders_cancel").annotations.destructiveHint, true);
assert.equal(tools.find((t) => t.name === "tiendanube_products_list").annotations.readOnlyHint, true);
// resources
const res = await client.listResources();
assert.deepEqual(res.resources.map((r) => r.uri).sort(), ["tiendanube://docs/checkout-sdk", "tiendanube://docs/scopes-and-limits"]);
assert.match(String((await client.readResource({ uri: "tiendanube://docs/scopes-and-limits" })).contents[0].text), /read_products/);
// headers + url + query + pagination
respond = () => json([{ id: 1, name: { es: "Remera" } }], 200, { "x-total-count": "45", "x-rate-limit-remaining": "30" });
let r = await client.callTool({ name: "tiendanube_products_list", arguments: { q: "rem", published: true, per_page: 1 } });
let c = calls.at(-1);
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
c = calls.at(-1);
assert.equal(c.init.method, "POST");
assert.equal(c.url.pathname, "/2025-03/42/products/7/variants/stock");
assert.deepEqual(JSON.parse(c.init.body), { action: "replace", value: null, location_id: "L1" });
await client.callTool({ name: "tiendanube_categories_create", arguments: { name: { es: "Ropa" }, additional_fields: { foo: 1 } } });
assert.deepEqual(JSON.parse(calls.at(-1).init.body), { name: { es: "Ropa" }, foo: 1 });
// array body
await client.callTool({ name: "tiendanube_products_batch_stock_price", arguments: { items: [{ id: 1, variants: [{ id: 2, price: "10" }] }] } });
assert.equal(calls.at(-1).init.method, "PATCH");
assert.deepEqual(JSON.parse(calls.at(-1).init.body), [{ id: 1, variants: [{ id: 2, price: "10" }] }]);
// unstable versioning (fixed, input-driven, selectable)
await client.callTool({ name: "tiendanube_external_invoices_list", arguments: { order_id: "123" } });
assert.equal(calls.at(-1).url.pathname, "/unstable/42/orders/123/invoices/external");
await client.callTool({ name: "tiendanube_orders_list", arguments: { aggregates: "price_tables" } });
assert.equal(calls.at(-1).url.pathname, "/unstable/42/orders");
await client.callTool({ name: "tiendanube_orders_list", arguments: {} });
assert.equal(calls.at(-1).url.pathname, "/2025-03/42/orders");
await client.callTool({ name: "tiendanube_disputes_get", arguments: { order_id: 1, transaction_id: 2, dispute_id: 3, api_version: "unstable" } });
assert.equal(calls.at(-1).url.pathname, "/unstable/42/orders/1/transactions/2/disputes/3");
// custom fields entity with slash
await client.callTool({ name: "tiendanube_custom_fields_list", arguments: { entity: "products/variants" } });
assert.equal(calls.at(-1).url.pathname, "/2025-03/42/products/variants/custom-fields");
// path encoding
await client.callTool({ name: "tiendanube_products_get_by_sku", arguments: { sku: "A/B 1" } });
assert.equal(calls.at(-1).url.pathname, "/2025-03/42/products/sku/A%2FB%201");
// 64-bit id as string preserved
await client.callTool({ name: "tiendanube_carts_delete_line_item", arguments: { id: "c1", line_item_id: "9007199254740993" } });
assert.match(calls.at(-1).url.pathname, /9007199254740993$/);
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
// read-only mode
const ro = await connect(true);
const roTools = (await ro.listTools()).tools;
assert.ok(roTools.length > 50 && roTools.every((t) => t.annotations?.readOnlyHint === true));
console.log("all self-tests passed");
//# sourceMappingURL=selftest.js.map