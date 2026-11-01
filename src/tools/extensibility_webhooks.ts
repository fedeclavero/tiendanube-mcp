import { z } from "zod";
import { bool, enumOf, id, str, timeFilters } from "../schemas/common.js";
import { DELETE, GET, LIST, ONE, POST, PUT, payload } from "./helpers.js";
import { ToolModule } from "./registry.js";

export const WEBHOOK_EVENTS = [
  "app/uninstalled", "app/suspended", "app/resumed",
  "product/created", "product/updated", "product/deleted",
  "category/created", "category/updated", "category/deleted",
  "order/created", "order/updated", "order/paid", "order/packed", "order/fulfilled", "order/cancelled",
  "order/custom_fields_updated", "order/edited", "order/pending", "order/voided",
  "fulfillment/updated",
  "customer/created", "customer/updated", "customer/deleted",
  "store/redact", "customers/redact", "customers/data_request",
  "location/created", "location/updated", "location/deleted",
  "product_price_table/created", "product_price_table/updated", "product_price_table/deleted",
  "product/custom_fields_updated", "product_variant/custom_fields_updated",
  "category/custom_fields_updated", "customer/custom_fields_updated",
] as const;

const OWNER_RESOURCES = ["Product", "Product_Variant", "Category", "Page", "Order", "Customer"] as const;
const META_SCOPE = "read_*/write_* matching owner_resource: products (Product, Product_Variant, Category) | content (Page) | orders (Order) | customers (Customer)";

const ENTITIES = ["categories", "customers", "orders", "products", "products/variants"] as const;
const CF_SCOPE = "read_products/write_products (categories, products, products/variants) | read_customers/write_customers (customers) | read_orders/write_orders (orders)";
const entity = { entity: enumOf([...ENTITIES], "Entity whose custom fields are managed") };
const cf = "/{entity}/custom-fields";

const defEntity = { entity: enumOf([...ENTITIES], "Entity type owning the definitions") };
const defs = "/{entity}/custom-fields";
const defKey = { ...defEntity, namespace: str("Definition namespace"), slug: str("Definition slug") };
const co = "/custom-objects";
const coKey = { namespace: str("Custom object namespace"), slug: str("Custom object slug") };
const entryKey = { ...coKey, entrySlug: str("Entry slug") };
const UNSTABLE = { version: "unstable" as const };
const CFS = "read_products/write_products";

export const extensibilityModule: ToolModule = {
  name: "extensibility_webhooks",
  tools: [
    // ---- Metafields
    LIST("tiendanube_metafields_list_by_resource", "/metafields/{owner_resource}", META_SCOPE, "List metafields of a resource type, optionally filtered by owner/namespace/key/value.", {
      pathParams: { owner_resource: enumOf([...OWNER_RESOURCES], "Owner resource type") },
      query: {
        owner_id: id("Only metafields of this owner").optional(),
        namespace: str("Namespace").optional(),
        key: str("Key").optional(),
        value: str("Value").optional(),
      },
    }),
    ONE("tiendanube_metafields_get", "/metafields/{id}", META_SCOPE, "Get one metafield.", { pathParams: { id: id("Metafield ID") } }),
    POST("tiendanube_metafields_create", "/metafields", META_SCOPE, "Create a metafield.", {
      body: {
        namespace: str("Namespace"),
        key: str("Key"),
        value: str("Value"),
        description: str("Description").optional(),
        owner_resource: enumOf([...OWNER_RESOURCES], "Owner resource type"),
        owner_id: id("Owner ID"),
      },
    }),
    PUT("tiendanube_metafields_update", "/metafields/{id}", META_SCOPE, "Update a metafield.", {
      pathParams: { id: id("Metafield ID") },
      body: { value: str("New value").optional(), description: str("Description").optional() },
    }),
    DELETE("tiendanube_metafields_delete", "/metafields/{id}", META_SCOPE, "Delete a metafield.", { pathParams: { id: id("Metafield ID") } }),

    // ---- Custom fields (2025-03)
    POST("tiendanube_custom_fields_create", cf, CF_SCOPE, "Define a custom field for an entity.", {
      pathParams: entity,
      body: {
        name: str("Field name"),
        description: str("Description").optional(),
        value_type: enumOf(["text", "text_list", "numeric", "date", "boolean", "object"], "Value type"),
        read_only: bool("Read-only for merchants").optional(),
        values: z.array(z.unknown()).optional().describe("Allowed values (for list types)"),
      },
    }),
    LIST("tiendanube_custom_fields_list", cf, CF_SCOPE, "List custom field definitions of an entity.", { pathParams: entity }),
    ONE("tiendanube_custom_fields_get", `${cf}/{custom_field_id}`, CF_SCOPE, "Get one custom field definition.", {
      pathParams: { ...entity, custom_field_id: id("Custom field ID") },
    }),
    PUT("tiendanube_custom_fields_update", `${cf}/{custom_field_id}`, CF_SCOPE, "Update a custom field definition.", {
      pathParams: { ...entity, custom_field_id: id("Custom field ID") },
      body: {
        name: str("Field name").optional(),
        description: str("Description").optional(),
        read_only: bool("Read-only for merchants").optional(),
        values: z.array(z.unknown()).optional().describe("Allowed values"),
      },
    }),
    DELETE("tiendanube_custom_fields_delete", `${cf}/{custom_field_id}`, CF_SCOPE, "Delete a custom field definition (and its values).", {
      pathParams: { ...entity, custom_field_id: id("Custom field ID") },
    }),
    ONE("tiendanube_custom_fields_get_by_entity_id", "/{entity}/{entity_id}/custom-fields", CF_SCOPE, "Get the custom field values of one entity instance (e.g. one product).", {
      pathParams: { ...entity, entity_id: id("ID of the product/customer/order/category/variant") },
    }),
    LIST("tiendanube_custom_fields_list_owners", `${cf}/{custom_field_id}/owners`, CF_SCOPE, "List entity instances that have a value for a custom field.", {
      pathParams: { ...entity, custom_field_id: id("Custom field ID") },
    }),
    PUT("tiendanube_custom_fields_set_values", "/{entity}/{entity_id}/custom-fields/values", CF_SCOPE, "Set custom field values on one entity instance.", {
      pathParams: { ...entity, entity_id: id("ID of the entity instance") },
      bodyKey: "values",
      body: { values: payload("Values payload per the API reference, e.g. [{id: <custom_field_id>, value: ...}]") },
    }),

    // ---- Custom field definitions (unstable)
    POST("tiendanube_custom_field_defs_create", defs, CFS, "Create a custom field definition (unstable API).", {
      ...UNSTABLE,
      pathParams: defEntity,
      bodyKey: "definition",
      body: { definition: payload("Definition per the unstable Custom Fields API reference (namespace, slug, name, value_type...)") },
    }),
    LIST("tiendanube_custom_field_defs_list", defs, CFS, "List custom field definitions (unstable API).", { ...UNSTABLE, pathParams: defEntity }),
    ONE("tiendanube_custom_field_defs_get", `${defs}/{namespace}/{slug}`, CFS, "Get a custom field definition by namespace/slug (unstable API).", {
      ...UNSTABLE,
      pathParams: defKey,
    }),
    DELETE("tiendanube_custom_field_defs_delete", `${defs}/{namespace}/{slug}`, CFS, "Delete a custom field definition (unstable API).", {
      ...UNSTABLE,
      pathParams: defKey,
    }),
    GET("tiendanube_custom_field_capabilities_list", `${defs}/{namespace}/{slug}/capabilities`, CFS, "List capabilities of a custom field definition (unstable API).", {
      ...UNSTABLE,
      pathParams: defKey,
    }),
    POST("tiendanube_custom_field_capabilities_add", `${defs}/{namespace}/{slug}/capabilities`, CFS, "Add a capability to a custom field definition (unstable API).", {
      ...UNSTABLE,
      pathParams: defKey,
      bodyKey: "capability",
      body: { capability: payload("Capability per the API reference") },
    }),
    DELETE("tiendanube_custom_field_capabilities_remove", `${defs}/{namespace}/{slug}/capabilities`, CFS, "Remove a capability from a custom field definition (unstable API).", {
      ...UNSTABLE,
      pathParams: defKey,
      bodyKey: "capability",
      body: { capability: payload("Capability to remove per the API reference", false) },
    }),

    // ---- Custom objects (unstable)
    POST("tiendanube_custom_objects_create", co, CFS, "Create a custom object definition (unstable API).", {
      ...UNSTABLE,
      bodyKey: "definition",
      body: { definition: payload("Custom object definition per the API reference") },
    }),
    LIST("tiendanube_custom_objects_list", co, CFS, "List custom object definitions (unstable API).", UNSTABLE),
    ONE("tiendanube_custom_objects_get", `${co}/{namespace}/{slug}`, CFS, "Get a custom object definition (unstable API).", { ...UNSTABLE, pathParams: coKey }),
    PUT("tiendanube_custom_objects_update", `${co}/{namespace}/{slug}`, CFS, "Update a custom object definition (unstable API).", {
      ...UNSTABLE,
      pathParams: coKey,
      bodyKey: "definition",
      body: { definition: payload("Fields to update per the API reference") },
    }),
    DELETE("tiendanube_custom_objects_delete", `${co}/{namespace}/{slug}`, CFS, "Delete a custom object definition (unstable API).", { ...UNSTABLE, pathParams: coKey }),
    POST("tiendanube_custom_object_entries_create", `${co}/{namespace}/{slug}/entries`, CFS, "Create an entry in a custom object (unstable API).", {
      ...UNSTABLE,
      pathParams: coKey,
      bodyKey: "entry",
      body: { entry: payload("Entry data per the API reference") },
    }),
    LIST("tiendanube_custom_object_entries_list", `${co}/{namespace}/{slug}/entries`, CFS, "List entries of a custom object (unstable API).", { ...UNSTABLE, pathParams: coKey }),
    ONE("tiendanube_custom_object_entries_get", `${co}/{namespace}/{slug}/entries/{entrySlug}`, CFS, "Get one custom object entry (unstable API).", {
      ...UNSTABLE,
      pathParams: entryKey,
    }),
    PUT("tiendanube_custom_object_entries_update", `${co}/{namespace}/{slug}/entries/{entrySlug}`, CFS, "Update a custom object entry (unstable API).", {
      ...UNSTABLE,
      pathParams: entryKey,
      bodyKey: "entry",
      body: { entry: payload("Entry fields to update") },
    }),
    DELETE("tiendanube_custom_object_entries_delete", `${co}/{namespace}/{slug}/entries/{entrySlug}`, CFS, "Delete a custom object entry (unstable API).", {
      ...UNSTABLE,
      pathParams: entryKey,
    }),

    // ---- Webhooks
    LIST("tiendanube_webhooks_list", "/webhooks", "scope of the event's entity (none for app/* and GDPR events)", "List webhooks registered by the app.", {
      query: { ...timeFilters, url: str("Exact webhook URL").optional(), event: str("Event name").optional() },
    }),
    ONE("tiendanube_webhooks_get", "/webhooks/{id}", "scope of the event's entity", "Get one webhook.", { pathParams: { id: id("Webhook ID") } }),
    POST("tiendanube_webhooks_create", "/webhooks", "scope of the event's entity (none for app/* and GDPR events)", "Subscribe an HTTPS URL to a store event.", {
      body: { url: z.string().url().startsWith("https://", "Webhook URL must use HTTPS").describe("HTTPS endpoint that will receive the events"), event: enumOf([...WEBHOOK_EVENTS], "Event name") },
    }),
    PUT("tiendanube_webhooks_update", "/webhooks/{id}", "scope of the event's entity", "Change a webhook's URL or event.", {
      pathParams: { id: id("Webhook ID") },
      body: { url: z.string().url().startsWith("https://", "Webhook URL must use HTTPS").optional().describe("HTTPS endpoint"), event: enumOf([...WEBHOOK_EVENTS], "Event name").optional() },
    }),
    DELETE("tiendanube_webhooks_delete", "/webhooks/{id}", "scope of the event's entity", "Delete a webhook.", { pathParams: { id: id("Webhook ID") } }),
  ],
};
