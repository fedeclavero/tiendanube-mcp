import { bool, enumOf, i18n, id, obj, str } from "../schemas/common.js";
import { DELETE, LIST, ONE, PATCH, POST, PUT, payload } from "./helpers.js";
const LR = "read_locations";
const LW = "write_locations";
const SR = "read_shipping";
const SW = "write_shipping";
const locationBody = (required) => ({
    name: required ? i18n("Location name") : i18n("Location name").optional(),
    address: obj("Address: {zipcode, street, number, floor, locality, city, region:{code}, country:{code}}").optional(),
    allows_pickup: bool("Customers can pick up orders here").optional(),
});
const carrierBody = (required) => ({
    name: required ? str("Carrier name") : str("Carrier name").optional(),
    callback_url: required
        ? str("HTTPS endpoint Tiendanube calls to quote live rates at checkout")
        : str("HTTPS endpoint Tiendanube calls to quote live rates at checkout").optional(),
    types: str("Comma-separated delivery types, e.g. 'ship,pickup'").optional(),
    active: bool("Whether the carrier is active").optional(),
});
const carrier = { carrier_id: id("Shipping carrier ID") };
const ffPath = { order_id: id("Order ID") };
export const logisticsModule = {
    name: "logistics",
    tools: [
        // ---- Locations
        LIST("tiendanube_locations_list", "/locations", LR, "List locations (branches / distribution centers)."),
        ONE("tiendanube_locations_get", "/locations/{id}", LR, "Get one location.", { pathParams: { id: id("Location ID") } }),
        POST("tiendanube_locations_create", "/locations", LW, "Create a location.", { body: locationBody(true) }),
        PUT("tiendanube_locations_update", "/locations/{id}", LW, "Update a location.", {
            pathParams: { id: id("Location ID") },
            body: locationBody(false),
        }),
        DELETE("tiendanube_locations_delete", "/locations/{id}", LW, "Delete a location.", { pathParams: { id: id("Location ID") } }),
        PATCH("tiendanube_locations_update_priorities", "/locations/priorities", LW, "Set the order in which locations are used to deduct stock.", {
            bodyKey: "priorities",
            body: { priorities: payload("Priority list per the API reference, e.g. [{id: <location_id>, priority: 0}, ...]") },
        }),
        PATCH("tiendanube_locations_set_default", "/locations/{id}/chosen-as-default", LW, "Mark a location as the default one.", {
            pathParams: { id: id("Location ID") },
        }),
        LIST("tiendanube_locations_inventory_levels_list", "/locations/{id}/inventory-levels", LR, "List stock levels of variants at one location.", {
            pathParams: { id: id("Location ID") },
        }),
        // ---- Shipping carriers
        LIST("tiendanube_shipping_carriers_list", "/shipping_carriers", SR, "List shipping carriers registered by the app."),
        ONE("tiendanube_shipping_carriers_get", "/shipping_carriers/{id}", SR, "Get one shipping carrier.", { pathParams: { id: id("Carrier ID") } }),
        POST("tiendanube_shipping_carriers_create", "/shipping_carriers", SW, "Register a shipping carrier with a live-rate callback.", {
            body: carrierBody(true),
        }),
        PUT("tiendanube_shipping_carriers_update", "/shipping_carriers/{id}", SW, "Update a shipping carrier.", {
            pathParams: { id: id("Carrier ID") },
            body: carrierBody(false),
        }),
        DELETE("tiendanube_shipping_carriers_delete", "/shipping_carriers/{id}", SW, "Delete a shipping carrier.", { pathParams: { id: id("Carrier ID") } }),
        LIST("tiendanube_shipping_carrier_options_list", "/shipping_carriers/{carrier_id}/options", SR, "List options of a shipping carrier.", { pathParams: carrier }),
        ONE("tiendanube_shipping_carrier_options_get", "/shipping_carriers/{carrier_id}/options/{option_id}", SR, "Get one carrier option.", {
            pathParams: { ...carrier, option_id: id("Option ID") },
        }),
        POST("tiendanube_shipping_carrier_options_create", "/shipping_carriers/{carrier_id}/options", SW, "Create a carrier option. Body per the API reference.", {
            pathParams: carrier,
            bodyKey: "option",
            body: { option: payload("Carrier option fields (name, code, additional_days, additional_cost, allow_free_shipping, active, ...)") },
        }),
        PUT("tiendanube_shipping_carrier_options_update", "/shipping_carriers/{carrier_id}/options/{option_id}", SW, "Update a carrier option.", {
            pathParams: { ...carrier, option_id: id("Option ID") },
            bodyKey: "option",
            body: { option: payload("Carrier option fields to update") },
        }),
        DELETE("tiendanube_shipping_carrier_options_delete", "/shipping_carriers/{carrier_id}/options/{option_id}", SW, "Delete a carrier option.", {
            pathParams: { ...carrier, option_id: id("Option ID") },
        }),
        // ---- Legacy fulfillment events
        LIST("tiendanube_order_fulfillments_list", "/orders/{order_id}/fulfillments", SR, "List legacy fulfillment events of an order (prefer fulfillment orders).", { pathParams: ffPath }),
        ONE("tiendanube_order_fulfillments_get", "/orders/{order_id}/fulfillments/{id}", SR, "Get a legacy fulfillment event.", {
            pathParams: { ...ffPath, id: id("Fulfillment ID") },
        }),
        POST("tiendanube_order_fulfillments_create", "/orders/{order_id}/fulfillments", SW, "Create a legacy fulfillment event (e.g. shipped with tracking).", {
            pathParams: ffPath,
            bodyKey: "fulfillment",
            body: { fulfillment: payload("Fulfillment fields (status, tracking_number, tracking_url, notify_customer, ...)") },
        }),
        DELETE("tiendanube_order_fulfillments_delete", "/orders/{order_id}/fulfillments/{id}", SW, "Delete a legacy fulfillment event.", {
            pathParams: { ...ffPath, id: id("Fulfillment ID") },
        }),
        // ---- Business rules
        PUT("tiendanube_business_rules_upsert", "/business_rules/integrations/{domain}", "write_shipping (domain shipping) | read_payment_options (payments) | write_locations (location) | write_orders (cart)", "Create or replace conditional business rules that filter payment methods, carriers, locations or cart behaviour at checkout.", {
            pathParams: { domain: enumOf(["payments", "shipping", "location", "cart"], "Rule domain") },
            bodyKey: "rules",
            body: { rules: payload("Rules definition per the Business Rules API reference") },
        }),
    ],
};
//# sourceMappingURL=logistics.js.map