import { bool, enumOf, id, num, obj, objArray, str, timeFilters } from "../schemas/common.js";
import { DELETE, LIST, ONE, PATCH, POST, PUT, payload } from "./helpers.js";
import { ToolModule } from "./registry.js";

const R = "read_orders";
const W = "write_orders";
const FR = "read_fulfillment_orders";
const FW = "write_fulfillment_orders";
const DR = "read_draft_orders";
const DW = "write_draft_orders";

const orderPath = { order_id: id("Order ID") };
const usesPriceTables = (i: Record<string, unknown>) =>
  String(i.aggregates ?? "").includes("price_tables") ? ("unstable" as const) : undefined;

const orderCreateBody = {
  currency: str("ISO currency code, e.g. ARS").optional(),
  language: str("Language code (es, pt, en)").optional(),
  gateway: str("Payment gateway name").optional(),
  payment_status: enumOf(["pending", "authorized", "paid", "voided", "refunded", "abandoned"], "Payment status").optional(),
  status: enumOf(["open", "closed", "cancelled"], "Order status").optional(),
  products: objArray("Line items: [{variant_id, quantity, price}]"),
  customer: obj("Customer: {name, email, phone, document}").optional(),
  billing_address: obj("Billing address").optional(),
  shipping_address: obj("Shipping address").optional(),
  shipping_pickup_type: enumOf(["ship", "pickup"], "Delivery type").optional(),
  shipping: str("Shipping carrier name").optional(),
  shipping_option: str("Shipping option name").optional(),
  shipping_cost_customer: num("Shipping cost charged to customer").optional(),
  shipping_cost_owner: num("Shipping cost paid by the store").optional(),
  send_confirmation_email: bool("Email confirmation to the buyer").optional(),
  send_fulfillment_email: bool("Email fulfillment updates to the buyer").optional(),
  inventory_behaviour: enumOf(["bypass", "claim"], "bypass = do not touch stock; claim = reserve stock").optional(),
  note: str("Customer note").optional(),
  owner_note: str("Private store note").optional(),
  discount: str("Discount amount").optional(),
};

const draftBody = {
  contact_name: str("Buyer first name").optional(),
  contact_lastname: str("Buyer last name").optional(),
  contact_email: str("Buyer email").optional(),
  payment_status: str("Payment status").optional(),
  products: objArray("Line items: [{variant_id, quantity}]").optional(),
  discount: obj("Discount object").optional(),
  shipping: obj("Shipping: {cost, shipping_address, shipping_option}").optional(),
};

const ffo = "/orders/{order_id}/fulfillment-orders";

export const ordersSalesModule: ToolModule = {
  name: "orders_sales",
  tools: [
    // ---- Orders
    LIST(
      "tiendanube_orders_list",
      "/orders",
      R,
      "List orders. Hard cap: page * per_page must be <= 10000 — for deeper history slice by created_at/updated_at ranges or use since_id.",
      {
        version: usesPriceTables,
        query: {
          ...timeFilters,
          status: enumOf(["open", "closed", "cancelled", "any"], "Order status").optional(),
          financial_status: enumOf(
            ["pending", "authorized", "paid", "partially_paid", "voided", "refunded", "partially_refunded"],
            "Payment status",
          ).optional(),
          shipping_status: enumOf(["unpacked", "unfulfilled", "partially_fulfilled", "fulfilled"], "Shipping status").optional(),
          customer_id: id("Only orders of this customer").optional(),
          q: str("Search by order number, customer name/email, etc.").optional(),
          total_min: num("Minimum order total").optional(),
          total_max: num("Maximum order total").optional(),
          channels: str("Comma-separated: form, store, api, meli, pos").optional(),
          payment_methods: str("Comma-separated payment method names").optional(),
          aggregates: str("Comma-separated extras: fulfillment_orders, custom_fields (price_tables switches to the unstable API)").optional(),
        },
      },
    ),
    ONE("tiendanube_orders_get", "/orders/{id}", R, "Get one order. Note: products[].id values are 64-bit; they are returned as-is (treat as strings).", {
      pathParams: { id: id("Order ID") },
      version: usesPriceTables,
      query: { aggregates: str("Comma-separated extras: fulfillment_orders, custom_fields (price_tables → unstable)").optional() },
    }),
    POST("tiendanube_orders_create", "/orders", W, "Create an order (e.g. for imports or manual sales). Check inventory_behaviour to control stock.", {
      body: orderCreateBody,
    }),
    PUT("tiendanube_orders_update", "/orders/{id}", W, "Update an order's owner_note, status or gateway_link.", {
      pathParams: { id: id("Order ID") },
      body: {
        owner_note: str("Private store note").optional(),
        status: enumOf(["open", "closed", "cancelled"], "Order status").optional(),
        gateway_link: str("Payment gateway link").optional(),
      },
    }),
    POST("tiendanube_orders_close", "/orders/{id}/close", W, "Close (archive) an open order.", { pathParams: { id: id("Order ID") } }),
    POST("tiendanube_orders_open", "/orders/{id}/open", W, "Re-open a closed order.", { pathParams: { id: id("Order ID") } }),
    POST("tiendanube_orders_cancel", "/orders/{id}/cancel", W, "Cancel an order. Irreversible; can email the buyer and restock inventory.", {
      pathParams: { id: id("Order ID") },
      body: {
        reason: enumOf(["customer", "inventory", "fraud", "other"], "Cancellation reason").optional(),
        email: bool("Notify the buyer by email").optional(),
        restock: bool("Return items to inventory").optional(),
      },
      annotations: { destructiveHint: true },
    }),
    ONE("tiendanube_orders_history_values_get", "/orders/{id}/history/values", R, "Get the history of financial values of an edited order.", {
      pathParams: { id: id("Order ID") },
    }),
    ONE("tiendanube_orders_history_editions_get", "/orders/{id}/history/editions", R, "Get the log of product/quantity edits applied to an order.", {
      pathParams: { id: id("Order ID") },
    }),
    ONE("tiendanube_orders_subscriptions_get", "/orders/{id}/subscriptions", R, "List subscriptions linked to an order.", {
      pathParams: { id: id("Order ID") },
    }),
    LIST("tiendanube_orders_invoices_list", "/orders/{id}/invoices", R, "List invoices attached to an order.", {
      pathParams: { id: id("Order ID") },
    }),
    POST("tiendanube_orders_invoices_create", "/orders/{id}/invoices", W, "Attach an invoice to an order. Body per the API reference.", {
      pathParams: { id: id("Order ID") },
      bodyKey: "invoice",
      body: { invoice: payload("Invoice object (fields per the API reference)") },
    }),

    // ---- Draft orders
    LIST("tiendanube_draft_orders_list", "/draft_orders", DR, "List draft orders."),
    ONE("tiendanube_draft_orders_get", "/draft_orders/{id}", DR, "Get a draft order.", { pathParams: { id: id("Draft order ID") } }),
    POST("tiendanube_draft_orders_create", "/draft_orders", DW, "Create a draft order. The response includes a checkout_url to share with the buyer.", {
      body: draftBody,
    }),
    PUT("tiendanube_draft_orders_update", "/draft_orders/{id}", DW, "Update a draft order.", {
      pathParams: { id: id("Draft order ID") },
      body: draftBody,
    }),
    POST("tiendanube_draft_orders_confirm", "/draft_orders/{id}/confirm", DW, "Convert a draft order into a real confirmed Order.", {
      pathParams: { id: id("Draft order ID") },
      annotations: { idempotentHint: false },
    }),
    DELETE("tiendanube_draft_orders_delete", "/draft_orders/{id}", DW, "Delete a draft order.", { pathParams: { id: id("Draft order ID") } }),

    // ---- Fulfillment orders
    LIST("tiendanube_fulfillment_orders_list", ffo, FR, "List fulfillment orders of an order (modern way to manage packing, dispatch and tracking).", {
      pathParams: orderPath,
    }),
    ONE("tiendanube_fulfillment_orders_get", `${ffo}/{id}`, FR, "Get one fulfillment order.", {
      pathParams: { ...orderPath, id: id("Fulfillment order ID") },
    }),
    PATCH("tiendanube_fulfillment_orders_update", `${ffo}/{id}`, FW, "Update fulfillment status, tracking info and customer notification.", {
      pathParams: { ...orderPath, id: id("Fulfillment order ID") },
      body: {
        status: enumOf(
          ["UNPACKED", "PACKED", "DISPATCHED", "READY_FOR_PICKUP", "DELIVERED", "NOT_DELIVERED", "CANCELLED"],
          "New fulfillment status",
        ).optional(),
        tracking_info: obj("Tracking info, e.g. {code, url, carrier}").optional(),
        notify_customer: bool("Email the customer about this change").optional(),
      },
    }),
    DELETE("tiendanube_fulfillment_orders_delete", `${ffo}/{id}`, FW, "Delete a fulfillment order.", {
      pathParams: { ...orderPath, id: id("Fulfillment order ID") },
    }),
    POST("tiendanube_fulfillment_tracking_events_create", `${ffo}/{id}/tracking-events`, FW, "Add a tracking event to a fulfillment order.", {
      pathParams: { ...orderPath, id: id("Fulfillment order ID") },
      body: { event: payload("Tracking event fields per the API reference (status, description, location, happened_at, ...)") },
      bodyKey: "event",
    }),
    PUT("tiendanube_fulfillment_tracking_events_update", `${ffo}/{id}/tracking-events/{event_id}`, FW, "Update a tracking event.", {
      pathParams: { ...orderPath, id: id("Fulfillment order ID"), event_id: id("Tracking event ID") },
      body: { event: payload("Tracking event fields to update") },
      bodyKey: "event",
    }),
    DELETE("tiendanube_fulfillment_tracking_events_delete", `${ffo}/{id}/tracking-events/{event_id}`, FW, "Delete a tracking event.", {
      pathParams: { ...orderPath, id: id("Fulfillment order ID"), event_id: id("Tracking event ID") },
    }),

    // ---- Carts
    ONE("tiendanube_carts_get", "/carts/{id}", R, "Get the state and contents of an active cart.", { pathParams: { id: id("Cart ID") } }),
    DELETE("tiendanube_carts_delete_line_item", "/carts/{id}/line-items/{line_item_id}", W, "Remove one line item from an active cart.", {
      pathParams: { id: id("Cart ID"), line_item_id: id("Line item ID (64-bit; pass as string)") },
    }),
    DELETE("tiendanube_carts_delete_coupon", "/carts/{id}/coupons/{coupon_id}", W, "Remove a coupon applied to an active cart.", {
      pathParams: { id: id("Cart ID"), coupon_id: id("Coupon ID") },
    }),

    // ---- Abandoned checkouts
    LIST("tiendanube_abandoned_checkouts_list", "/checkouts", R, "List abandoned checkouts (abandoned > 6 hours ago, up to 30 days back).", {
      query: timeFilters,
    }),
    ONE("tiendanube_abandoned_checkouts_get", "/checkouts/{id}", R, "Get one abandoned checkout.", { pathParams: { id: id("Checkout ID") } }),
    POST("tiendanube_abandoned_checkouts_apply_coupon", "/checkouts/{id}/coupon", W, "Attach a coupon to an abandoned checkout (recovery campaigns).", {
      pathParams: { id: id("Checkout ID") },
      body: { coupon_id: id("Coupon ID to apply") },
    }),
  ],
};
