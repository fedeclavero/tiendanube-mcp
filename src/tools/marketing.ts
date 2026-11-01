import { z } from "zod";
import { bool, enumOf, Id, id, num, str, timeFilters } from "../schemas/common.js";
import { DELETE, LIST, ONE, POST, PUT, payload } from "./helpers.js";
import { ToolModule } from "./registry.js";

const couponBody = (required: boolean) => {
  const o = <T extends z.ZodTypeAny>(s: T) => (required ? s : s.optional());
  return {
    code: o(str("Coupon code text")),
    type: o(enumOf(["percentage", "absolute", "shipping"], "Coupon type")),
    value: str("Percentage or amount as string; omit for 'shipping' coupons").optional(),
    valid: bool("Whether the coupon is active").optional(),
    start_date: str("Start date (YYYY-MM-DD)").optional(),
    end_date: str("End date (YYYY-MM-DD)").optional(),
    min_price: num("Minimum cart subtotal").optional(),
    max_uses: num("Maximum total uses").optional(),
    includes_shipping: bool("Discount also applies to shipping").optional(),
    first_consumer_purchase: bool("Only for a customer's first purchase").optional(),
    max_uses_per_client: num("Maximum uses per client").optional(),
    combines_with_other_discounts: bool("Can be combined with other discounts").optional(),
    categories: z.array(Id).optional().describe("Category IDs the coupon applies to"),
    products: z.array(Id).optional().describe("Product IDs the coupon applies to"),
  };
};

export const marketingModule: ToolModule = {
  name: "marketing",
  tools: [
    LIST("tiendanube_coupons_list", "/coupons", "read_coupons", "List coupons.", {
      query: {
        ...timeFilters,
        code: str("Exact coupon code").optional(),
        type: enumOf(["percentage", "absolute", "shipping"], "Coupon type").optional(),
        valid: bool("Filter by validity").optional(),
        min_start_date: str("Start date from (YYYY-MM-DD)").optional(),
        max_start_date: str("Start date to").optional(),
        min_end_date: str("End date from").optional(),
        max_end_date: str("End date to").optional(),
        status: enumOf(["activated", "deactivated"], "Coupon status").optional(),
        sort_by: str("Sort order").optional(),
      },
    }),
    ONE("tiendanube_coupons_get", "/coupons/{id}", "read_coupons", "Get one coupon.", { pathParams: { id: id("Coupon ID") } }),
    POST("tiendanube_coupons_create", "/coupons", "write_coupons", "Create a discount coupon.", { body: couponBody(true) }),
    PUT("tiendanube_coupons_update", "/coupons/{id}", "write_coupons", "Update a coupon.", {
      pathParams: { id: id("Coupon ID") },
      body: couponBody(false),
    }),
    DELETE("tiendanube_coupons_delete", "/coupons/{id}", "write_coupons", "Delete a coupon.", { pathParams: { id: id("Coupon ID") } }),

    LIST("tiendanube_promotions_list", "/promotions", "read_discounts", "List automatic promotions (2x1, 3x2, volume discounts...)."),
    ONE("tiendanube_promotions_get", "/promotions/{id}", "read_discounts", "Get one promotion.", { pathParams: { id: id("Promotion ID") } }),
    POST("tiendanube_promotions_create", "/promotions", "write_discounts", "Create an automatic cart/catalog promotion. Body per the Discount API reference.", {
      bodyKey: "promotion",
      body: { promotion: payload("Promotion definition (name, type, conditions, benefits...) per the API reference") },
    }),
    DELETE("tiendanube_promotions_delete", "/promotions/{id}", "write_discounts", "Delete a promotion.", { pathParams: { id: id("Promotion ID") } }),
    PUT("tiendanube_discounts_callbacks_upsert", "/discounts/callbacks", "write_discounts", "Register/replace the external callback used to compute dynamic discounts.", {
      bodyKey: "callback",
      body: { callback: payload("Callback config, e.g. {url: 'https://...'} per the API reference") },
    }),
    DELETE("tiendanube_discounts_callbacks_delete", "/discounts/callbacks", "write_discounts", "Remove the registered discount callback."),
  ],
};
