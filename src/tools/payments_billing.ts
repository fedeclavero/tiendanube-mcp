import { z } from "zod";
import { bool, id, obj, str } from "../schemas/common.js";
import { DELETE, LIST, ONE, PATCH, POST, PUT, payload } from "./helpers.js";
import { ToolModule } from "./registry.js";

const PR = "read_payments";
const PW = "write_payments";
const order = { order_id: id("Order ID") };
const txn = { ...order, transaction_id: id("Transaction ID") };
const dispPath = { ...txn, dispute_id: id("Dispute ID") };

const providerBody = (required: boolean) => {
  const o = <T extends z.ZodTypeAny>(s: T) => (required ? s : s.optional());
  return {
    name: o(str("Internal provider name")),
    public_name: str("Name shown to buyers").optional(),
    description: str("Description").optional(),
    logo_urls: obj("Logo URLs by size").optional(),
    configuration_url: str("Merchant configuration URL").optional(),
    support_url: str("Support URL").optional(),
    rates_url: str("Rates/fees URL").optional(),
    checkout_js_url: str("URL of the checkout JavaScript").optional(),
    checkout_payment_options: z.array(z.record(z.string(), z.unknown())).optional().describe("Payment options offered at checkout"),
    features: z.array(z.string()).optional().describe("Provider feature flags"),
    enabled: bool("Whether the provider is enabled").optional(),
  };
};

const ext = "/orders/{order_id}/invoices/external";
const extPath = { order_id: id("Order ID") };
const extKey = { ...extPath, key: str("Invoice fiscal key (44 digits, e.g. NFe access key or CAE)") };

const svc = { service_id: id("Billing service ID (from the Partner Portal)") };

export const paymentsBillingModule: ToolModule = {
  name: "payments_billing",
  tools: [
    // ---- Payment providers
    LIST("tiendanube_payment_providers_list", "/payment_providers", PR, "List payment providers registered by the app."),
    ONE("tiendanube_payment_providers_get", "/payment_providers/{id}", PR, "Get one payment provider.", { pathParams: { id: id("Provider ID") } }),
    POST("tiendanube_payment_providers_create", "/payment_providers", PW, "Register a payment provider.", { body: providerBody(true) }),
    PUT("tiendanube_payment_providers_update", "/payment_providers/{id}", PW, "Update a payment provider.", {
      pathParams: { id: id("Provider ID") },
      body: providerBody(false),
    }),
    DELETE("tiendanube_payment_providers_delete", "/payment_providers/{id}", PW, "Delete a payment provider.", { pathParams: { id: id("Provider ID") } }),

    // ---- Payment options
    LIST("tiendanube_payment_options_list", "/payment-options", "read_payment_options", "List the payment options available in the store."),
    LIST("tiendanube_payment_provider_options_list", "/payment_providers/options", PR, "List the options of the app's payment providers."),

    // ---- Transactions
    LIST("tiendanube_transactions_list", "/orders/{order_id}/transactions", PR, "List payment transactions of an order.", { pathParams: order }),
    ONE("tiendanube_transactions_get", "/orders/{order_id}/transactions/{id}", PR, "Get one transaction.", {
      pathParams: { ...order, id: id("Transaction ID") },
    }),
    POST("tiendanube_transactions_create", "/orders/{order_id}/transactions", PW, "Record a financial transaction (authorization, capture, charge, refund, void) on an order.", {
      pathParams: order,
      bodyKey: "transaction",
      body: { transaction: payload("Transaction fields per the API reference (type/status, amount, currency, payment method...)") },
      annotations: { idempotentHint: false },
    }),
    POST("tiendanube_transaction_events_create", "/orders/{order_id}/transactions/{transaction_id}/events", PW, "Add a lifecycle event to an existing transaction.", {
      pathParams: txn,
      bodyKey: "event",
      body: { event: payload("Event fields per the API reference") },
    }),

    // ---- Disputes
    POST("tiendanube_disputes_create", "/orders/{order_id}/transactions/{transaction_id}/disputes", PW, "Open a dispute/chargeback on a transaction.", {
      pathParams: txn,
      selectVersion: true,
      bodyKey: "dispute",
      body: { dispute: payload("Dispute fields per the Disputes API reference") },
    }),
    PUT("tiendanube_disputes_update", "/orders/{order_id}/transactions/{transaction_id}/disputes/{dispute_id}", PW, "Update a dispute (status, evidence...).", {
      pathParams: dispPath,
      selectVersion: true,
      bodyKey: "dispute",
      body: { dispute: payload("Dispute fields to update") },
    }),
    ONE("tiendanube_disputes_get", "/orders/{order_id}/transactions/{transaction_id}/disputes/{dispute_id}", PR, "Get a dispute.", {
      pathParams: dispPath,
      selectVersion: true,
    }),

    // ---- External invoices (unstable)
    LIST("tiendanube_external_invoices_list", ext, "read_orders", "List external fiscal invoices of an order (unstable API; per_page max 50).", {
      version: "unstable",
      pathParams: extPath,
    }),
    ONE("tiendanube_external_invoices_get", `${ext}/{key}`, "read_orders", "Get an external invoice by fiscal key.", {
      version: "unstable",
      pathParams: extKey,
    }),
    POST("tiendanube_external_invoices_create", ext, "write_orders", "Attach an external fiscal invoice (NFe/CAE...) to an order (unstable API).", {
      version: "unstable",
      pathParams: extPath,
      body: {
        key: str("44-digit fiscal key"),
        number: str("Invoice number").optional(),
        series: str("Invoice series").optional(),
        issued_at: str("Issue timestamp (ISO 8601)").optional(),
        xml: str("Fiscal XML (or URL/data per the API reference)").optional(),
      },
    }),
    PUT("tiendanube_external_invoices_update", `${ext}/{key}`, "write_orders", "Update an external invoice (unstable API).", {
      version: "unstable",
      pathParams: extKey,
      body: {
        number: str("Invoice number").optional(),
        series: str("Invoice series").optional(),
        issued_at: str("Issue timestamp (ISO 8601)").optional(),
        xml: str("Fiscal XML").optional(),
      },
    }),
    DELETE("tiendanube_external_invoices_delete", `${ext}/{key}`, "write_orders", "Delete an external invoice (unstable API).", {
      version: "unstable",
      pathParams: extKey,
    }),

    // ---- Billing (app monetization)
    POST("tiendanube_billing_plans_create", "/plans", "write_plans", "Create an app billing plan.", {
      bodyKey: "plan",
      body: { plan: payload("Plan definition per the Billing API reference") },
    }),
    PATCH("tiendanube_billing_plans_update", "/plans/{plan_id}", "write_plans", "Update an app billing plan.", {
      pathParams: { plan_id: id("Plan ID") },
      bodyKey: "plan",
      body: { plan: payload("Plan fields to update") },
    }),
    DELETE("tiendanube_billing_plans_delete", "/plans/{plan_id}", "write_plans", "Delete an app billing plan.", {
      pathParams: { plan_id: id("Plan ID") },
    }),
    ONE("tiendanube_billing_subscriptions_get", "/concepts/app-cost/services/{service_id}/subscriptions", "read_subscriptions", "Get the store's subscription(s) for an app service.", {
      pathParams: svc,
    }),
    PATCH("tiendanube_billing_subscriptions_update", "/concepts/app-cost/services/{service_id}/subscriptions", "write_subscriptions", "Update the store's subscription for an app service.", {
      pathParams: svc,
      bodyKey: "subscription",
      body: { subscription: payload("Subscription fields to update per the Billing API reference") },
    }),
    POST("tiendanube_billing_charges_create", "/services/{service_id}/charges", "write_charges", "Create a one-off or usage charge for an app service.", {
      pathParams: svc,
      bodyKey: "charge",
      body: { charge: payload("Charge fields per the Billing API reference (amount, description, ...)") },
      annotations: { idempotentHint: false },
    }),
  ],
};
