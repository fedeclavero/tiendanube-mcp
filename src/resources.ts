import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const SCOPES_AND_LIMITS = `# Tiendanube API: scopes and limits

## Base URLs
- Hispanoamérica: https://api.tiendanube.com/{version}/{store_id}
- Brasil (Nuvemshop): https://api.nuvemshop.com.br/{version}/{store_id}
- Versions: \`2025-03\` (stable), \`v1\` (classic alias), \`unstable\` (External Invoice, Custom Objects, Custom Field Definitions, Store Media, Disputes, aggregates=price_tables)

## Authentication
Classic endpoints read \`Authentication: bearer <token>\`; modern microservices (Scripts, Pages, Email Templates, Billing, Disputes, External Invoice, Business Rules) read \`Authorization: Bearer <token>\`. This server sends both, plus a mandatory \`User-Agent: AppName (contact@domain.com)\`.

## Scopes (18 families)
| Family | Read | Write | Resources |
| --- | --- | --- | --- |
| Store (implicit) | any token | n/a | Store, Webhooks, GET /scripts |
| Content | read_content | write_content | Pages, Blog, Page metafields |
| Products | read_products | write_products | Product, Variant, Image, Category, Kit, Price Tables, product/category custom fields & metafields, Store Media, Custom Objects/Definitions |
| Customers | read_customers | write_customers | Customer, customer metafields/custom fields |
| Orders | read_orders | write_orders | Order, Cart, Abandoned Checkout, order custom fields, External Invoice |
| Fulfillment orders | read_fulfillment_orders | write_fulfillment_orders | Fulfillment Order + tracking events |
| Draft orders | read_draft_orders | write_draft_orders | Draft Order |
| Locations | read_locations | write_locations | Location, inventory levels, location business rules |
| Shipping | read_shipping | write_shipping | Shipping Carrier, options, legacy fulfillments, shipping business rules |
| Shipping quotation | read_shipping_quotation | write_shipping_quotation | Live rate quotation |
| Coupons | read_coupons | write_coupons | Coupons |
| Discounts | read_discounts | write_discounts | Promotions, discount callbacks |
| Payments | read_payments | write_payments | Payment Provider, Transaction, Disputes |
| Payment options | read_payment_options | n/a | Payment Option, payments business rules |
| Scripts | n/a | write_scripts | POST/PUT/DELETE /scripts |
| Email templates | read_email_templates | write_email_templates | Email Templates |
| App subscriptions | read_subscriptions | write_subscriptions | Billing subscriptions |
| Charges & plans | n/a | write_charges, write_plans | Billing charges / plans |

A 403 means the token lacks the scope: tool descriptions list the scope each one needs.

## Rate limit (leaky bucket)
40 requests burst, drains 2 req/s per store+app (10x on Evolución/Next plans). Headers: x-rate-limit-limit, x-rate-limit-remaining, x-rate-limit-reset (ms). This server pauses when remaining <= 2 and retries 429s. PUT/PATCH on product variants use a weighted bucket (cost grows with variants, languages and inventory_levels).

## Pagination and filters
page (default 1), per_page (default 30, max 200; max 50 for External Invoice), fields, since_id, created_at_min/max, updated_at_min/max. Orders: page * per_page <= 10000. Empty list/out-of-range page answers 404 "Last page is N" (handled as an empty result).

## Data model rules
- i18n text fields (name, description, handle, seo_title, seo_description, subject, template_html) are objects keyed by language: {"es": "...", "pt": "..."}.
- Price, promotional_price, SKU, weight, dimensions and stock live on Product Variant. Infinite stock = stock null (stock_management false). Multi-location stores use inventory_levels [{location_id, stock}].
- Order line IDs (products[].id) exceed int32: always treat as strings/int64.
- Fulfillment: prefer Fulfillment Orders over the deprecated order-level shipping fields.
`;

const CHECKOUT_SDK = `# Checkout and Checkout SDK

Tiendanube lets apps integrate with the checkout in two ways:

1. **Callbacks** (server side): shipping carriers (\`tiendanube_shipping_carriers_create\` with callback_url), payment providers (\`tiendanube_payment_providers_create\` with checkout_payment_options/checkout_js_url), discount callbacks (\`tiendanube_discounts_callbacks_upsert\`) and business rules (\`tiendanube_business_rules_upsert\`).
2. **Checkout SDK** (browser JavaScript): injected through a Script (\`tiendanube_scripts_create\` with a script created in the Partner Portal) it reads and manipulates the state of the checkout and syncs with payment and shipping options. Used for Transparent Checkout and Nube Pago integrations.

Reference documentation:
- https://tiendanube.dev/api/resources/2025-03/checkout
- https://tiendanube.dev/api/resources/2025-03/checkout-sdk
`;

export function registerResources(server: McpServer): void {
  server.registerResource(
    "scopes-and-limits",
    "tiendanube://docs/scopes-and-limits",
    { title: "Tiendanube scopes, limits and data-model rules", description: "OAuth scope matrix, API versions, rate limits, pagination and modeling rules", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: SCOPES_AND_LIMITS }] }),
  );
  server.registerResource(
    "checkout-sdk",
    "tiendanube://docs/checkout-sdk",
    { title: "Checkout and Checkout SDK integration guide", description: "How callbacks, scripts and the Checkout SDK fit together", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: CHECKOUT_SDK }] }),
  );
}
