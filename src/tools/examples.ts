/**
 * Exact example arguments for the tools small models struggle with. They are appended to the tool
 * description ("Example arguments: {...}") and every one of them is executed against the real input
 * schema in the self-test, so an example can never drift out of sync with its tool.
 */
export const EXAMPLES: Record<string, Record<string, unknown>> = {
  tiendanube_store_get: {},
  tiendanube_products_list: { q: "remera", published: true, per_page: 20, fields: "id,name,variants,images" },
  tiendanube_products_get: { id: 123456 },
  tiendanube_products_get_by_sku: { sku: "REM-001-M" },
  tiendanube_products_create: {
    name: { es: "Remera Básica" },
    published: false,
    variants: [{ price: "15000.00", stock_management: true, stock: 10, sku: "REM-001" }],
    categories: [456],
  },
  tiendanube_products_update: { id: 123456, published: true, description: { es: "<p>Texto nuevo</p>" } },
  tiendanube_variants_update: { product_id: 123456, id: 789, price: "16500.00", promotional_price: "14900.00" },
  tiendanube_variants_update_stock: { product_id: 123456, id: 789, action: "replace", value: 25 },
  tiendanube_products_batch_stock_price: { items: [{ id: 123456, variants: [{ id: 789, price: "16500.00" }] }] },
  tiendanube_product_images_create: { product_id: 123456, src: "https://example.com/foto.jpg", position: 1 },
  tiendanube_categories_list: {},
  tiendanube_categories_create: { name: { es: "Remeras" } },
  tiendanube_orders_list: { financial_status: "paid", shipping_status: "unpacked", per_page: 50 },
  tiendanube_orders_get: { id: 1042 },
  tiendanube_orders_cancel: { id: 1050, reason: "inventory", restock: true, email: true },
  tiendanube_customers_list: { q: "ana@example.com" },
  tiendanube_coupons_create: { code: "BIENVENIDA15", type: "percentage", value: "15", max_uses_per_client: 1, end_date: "2026-12-31" },
  tiendanube_fulfillment_orders_update: { order_id: 1042, id: "abc123", status: "DISPATCHED", tracking_info: { code: "ABC123" }, notify_customer: true },
  tiendanube_abandoned_checkouts_list: { created_at_min: "2026-10-30T00:00:00-03:00" },
  tiendanube_webhooks_create: { url: "https://my-api.example.com/hooks", event: "order/paid" },
};
