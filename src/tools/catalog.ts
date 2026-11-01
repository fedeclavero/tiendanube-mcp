import { z } from "zod";
import { bool, enumOf, i18n, id, Id, num, objArray, str, timeFilters } from "../schemas/common.js";
import { DELETE, LIST, ONE, PATCH, POST, PUT, payload } from "./helpers.js";
import { ToolModule } from "./registry.js";

const R = "read_products";
const W = "write_products";

const productBody = (requireName: boolean) => ({
  name: requireName ? i18n("Product name") : i18n("Product name").optional(),
  description: i18n("Product description (HTML allowed)").optional(),
  handle: i18n("URL slug").optional(),
  attributes: z
    .array(i18n("Attribute name, e.g. Talle/Color"))
    .max(3)
    .optional()
    .describe("Up to 3 variant attribute names, each an i18n object (e.g. [{\"es\":\"Talle\"},{\"es\":\"Color\"}])"),
  variants: objArray(
    "Variants. Price/SKU/weight/stock live here, not on the product. Each: {price, promotional_price, stock, stock_management, sku, weight, width, height, depth, values:[{es:'M'}], inventory_levels:[{location_id,stock}]}. Infinite stock = stock null",
  ).optional(),
  images: objArray("Images: [{src:'https://...', position, alt}]").optional(),
  categories: z.array(Id).optional().describe("Category IDs"),
  brand: str("Brand").optional(),
  published: bool("Whether visible in the storefront").optional(),
  free_shipping: bool("Free shipping").optional(),
  video_url: str("Video URL").optional(),
  seo_title: i18n("SEO title").optional(),
  seo_description: i18n("SEO description").optional(),
  tags: str("Comma-separated tags").optional(),
  requires_shipping: bool("Whether the product needs shipping").optional(),
});

const variantBody = {
  price: str("Price as decimal string, e.g. '1999.90'").optional(),
  promotional_price: str("Promotional price (decimal string)").optional(),
  cost: str("Unit cost (decimal string)").optional(),
  stock_management: bool("true to track stock; false = infinite stock").optional(),
  stock: z.number().int().nullable().optional().describe("Stock quantity; null = infinite"),
  weight: str("Weight in kg").optional(),
  width: str("Width in cm").optional(),
  height: str("Height in cm").optional(),
  depth: str("Depth in cm").optional(),
  sku: str("SKU").optional(),
  barcode: str("Barcode (EAN/UPC)").optional(),
  mpn: str("Manufacturer part number").optional(),
  age_group: str("Age group (Google Shopping)").optional(),
  gender: str("Gender (Google Shopping)").optional(),
  values: z.array(i18n("Attribute value")).optional().describe("One i18n value per product attribute, e.g. [{\"es\":\"M\"},{\"es\":\"Rojo\"}]"),
  image_id: id("ID of a product image to associate").optional(),
  inventory_levels: z
    .array(z.object({ location_id: Id, stock: z.number().int().nullable() }))
    .optional()
    .describe("Per-location stock for multi-location stores"),
};

const categoryBody = (requireName: boolean) => ({
  name: requireName ? i18n("Category name") : i18n("Category name").optional(),
  description: i18n("Description").optional(),
  handle: i18n("URL slug").optional(),
  parent: Id.nullable().optional().describe("Parent category ID, or null for a root category"),
  google_shopping_category: str("Google Shopping category").optional(),
  seo_title: i18n("SEO title").optional(),
  seo_description: i18n("SEO description").optional(),
});

const productId = { product_id: id("Product ID") };

export const catalogModule: ToolModule = {
  name: "catalog",
  tools: [
    // ---- Products
    LIST("tiendanube_products_list", "/products", R, "List products with their variants, images and categories. Supports rich filters.", {
      query: {
        ids: str("Comma-separated product IDs").optional(),
        since_id: id("Cursor: only products with ID greater than this").optional(),
        language: str("Language code used for text search/sorting (es, pt, en)").optional(),
        q: str("Search text in name/description/SKU").optional(),
        handle: str("Exact handle (slug)").optional(),
        category_id: id("Only products in this category").optional(),
        published: bool("Filter by published state").optional(),
        free_shipping: bool("Filter by free shipping").optional(),
        max_stock: num("Maximum stock").optional(),
        min_stock: num("Minimum stock").optional(),
        has_promotional_price: bool("Only products with promotional price").optional(),
        has_weight: bool("Only products with weight set").optional(),
        has_dimensions: bool("Only products with dimensions set").optional(),
        has_skus: bool("Only products with SKUs set").optional(),
        created_at_min: str("Created at or after (ISO 8601)").optional(),
        created_at_max: str("Created at or before (ISO 8601)").optional(),
        updated_at_min: str("Updated at or after (ISO 8601)").optional(),
        updated_at_max: str("Updated at or before (ISO 8601)").optional(),
        sort_by: str("Sort order, e.g. 'created-at-ascending', 'created-at-descending', 'name-ascending', 'price-descending'").optional(),
      },
    }),
    ONE("tiendanube_products_get", "/products/{id}", R, "Get one product by ID, including variants, images, categories and attributes.", {
      pathParams: { id: id("Product ID") },
    }),
    ONE("tiendanube_products_get_by_sku", "/products/sku/{sku}", R, "Find the product owning a variant with the given SKU.", {
      pathParams: { sku: str("Variant SKU") },
    }),
    POST("tiendanube_products_create", "/products", W, "Create a product (optionally with variants and images). Prices, SKU, weight and stock belong to variants.", {
      body: productBody(true),
    }),
    PUT("tiendanube_products_update", "/products/{id}", W, "Update product metadata. Does NOT modify variants; use the variants tools for price/stock/SKU.", {
      pathParams: { id: id("Product ID") },
      body: productBody(false),
    }),
    DELETE("tiendanube_products_delete", "/products/{id}", W, "Permanently delete a product with all its variants and images.", {
      pathParams: { id: id("Product ID") },
    }),
    PATCH(
      "tiendanube_products_batch_stock_price",
      "/products/stock-price",
      W,
      "Bulk-update price, promotional price and inventory levels of many products/variants in one call. Body items: [{id: product_id, variants:[{id, price, promotional_price, inventory_levels:[{location_id, stock}]}]}].",
      {
        bodyKey: "items",
        body: { items: objArray("Products to update: [{id, variants:[{id, price, promotional_price, inventory_levels:[{location_id, stock}]}]}]") },
        notes: "Prefer this over per-variant calls to save rate limit.",
      },
    ),

    // ---- Variants
    LIST("tiendanube_variants_list", "/products/{product_id}/variants", R, "List variants of a product.", {
      pathParams: productId,
      query: timeFilters,
    }),
    ONE("tiendanube_variants_get", "/products/{product_id}/variants/{id}", R, "Get one variant.", {
      pathParams: { ...productId, id: id("Variant ID") },
    }),
    POST("tiendanube_variants_create", "/products/{product_id}/variants", W, "Create a variant (max 1000 per product).", {
      pathParams: productId,
      body: variantBody,
    }),
    PUT("tiendanube_variants_update", "/products/{product_id}/variants/{id}", W, "Update one variant (price, SKU, weight, stock...).", {
      pathParams: { ...productId, id: id("Variant ID") },
      body: variantBody,
    }),
    PUT(
      "tiendanube_variants_batch_replace",
      "/products/{product_id}/variants",
      W,
      "Replace the full set of variants of a product in one call (array of variant objects). Costs rate limit proportional to variants/languages/inventory_levels (weighted token bucket).",
      {
        pathParams: productId,
        bodyKey: "variants",
        body: { variants: objArray("Complete array of variant objects replacing the existing set") },
        annotations: { destructiveHint: true },
      },
    ),
    PATCH(
      "tiendanube_variants_batch_update",
      "/products/{product_id}/variants",
      W,
      "Partially update many existing variants of a product in one call (array of {id, ...fields}). Weighted token bucket applies.",
      {
        pathParams: productId,
        bodyKey: "variants",
        body: { variants: objArray("Variants to update: [{id, ...fields}]") },
      },
    ),
    DELETE("tiendanube_variants_delete", "/products/{product_id}/variants/{id}", W, "Delete a variant. The only variant of a product cannot be deleted.", {
      pathParams: { ...productId, id: id("Variant ID") },
    }),
    POST(
      "tiendanube_variants_update_stock",
      "/products/{product_id}/variants/stock",
      W,
      "Set or adjust stock. action 'replace' sets an exact value (value null = infinite stock); 'variation' adds/subtracts a delta. Omit id to apply to all variants of the product.",
      {
        pathParams: productId,
        body: {
          action: enumOf(["replace", "variation"], "Stock operation"),
          value: z.number().int().nullable().describe("Integer quantity (or delta for 'variation'); null with 'replace' = infinite stock"),
          id: id("Variant ID; omit to apply to every variant").optional(),
          location_id: id("Location ID for multi-location stores").optional(),
        },
        annotations: { idempotentHint: false },
      },
    ),

    // ---- Product images
    LIST("tiendanube_product_images_list", "/products/{product_id}/images", R, "List images of a product.", {
      pathParams: productId,
      query: { since_id: id("Cursor").optional(), src: str("Filter by image URL").optional(), position: num("Filter by position").optional() },
    }),
    ONE("tiendanube_product_images_get", "/products/{product_id}/images/{id}", R, "Get one product image.", {
      pathParams: { ...productId, id: id("Image ID") },
    }),
    POST("tiendanube_product_images_create", "/products/{product_id}/images", W, "Add an image from a public URL (src) or Base64 (attachment + filename). jpg/png/gif/webp, max 250 per product.", {
      pathParams: productId,
      body: {
        src: str("Public image URL").optional(),
        attachment: str("Base64 image content").optional(),
        filename: str("File name when using attachment").optional(),
        position: num("Position in the gallery").optional(),
        alt: i18n("Alt text").optional(),
      },
    }),
    POST("tiendanube_product_images_upload_unattached", "/products/images", W, "Upload an image to the store repository before attaching it to a product.", {
      body: {
        src: str("Public image URL").optional(),
        attachment: str("Base64 image content").optional(),
        filename: str("File name when using attachment").optional(),
      },
    }),
    PUT("tiendanube_product_images_update", "/products/{product_id}/images/{id}", W, "Update an image's position, alt text or source.", {
      pathParams: { ...productId, id: id("Image ID") },
      body: { position: num("New position").optional(), alt: i18n("Alt text").optional(), src: str("New source URL").optional() },
    }),
    DELETE("tiendanube_product_images_delete", "/products/{product_id}/images/{id}", W, "Delete a product image.", {
      pathParams: { ...productId, id: id("Image ID") },
    }),

    // ---- Categories
    LIST("tiendanube_categories_list", "/categories", R, "List categories.", {
      query: {
        ...timeFilters,
        language: str("Language code").optional(),
        handle: str("Exact handle").optional(),
        parent_id: id("Only children of this category").optional(),
      },
    }),
    ONE("tiendanube_categories_get", "/categories/{id}", R, "Get one category.", { pathParams: { id: id("Category ID") } }),
    POST("tiendanube_categories_create", "/categories", W, "Create a category (set parent for nesting).", { body: categoryBody(true) }),
    PUT("tiendanube_categories_update", "/categories/{id}", W, "Update a category.", {
      pathParams: { id: id("Category ID") },
      body: categoryBody(false),
    }),
    DELETE("tiendanube_categories_delete", "/categories/{id}", W, "Delete a category.", { pathParams: { id: id("Category ID") } }),

    // ---- Kits
    ONE("tiendanube_kits_get", "/kits/{id}", R, "Get a Kit/Combo product and the products/variants composing it.", {
      pathParams: { id: id("Kit ID") },
    }),

    // ---- Price tables (B2B / wholesale)
    LIST("tiendanube_price_tables_list", "/products/price-tables", R, "List price tables (wholesale / B2B price lists)."),
    ONE("tiendanube_price_tables_get", "/products/price-tables/{id}", R, "Get one price table.", { pathParams: { id: id("Price table ID") } }),
    POST("tiendanube_price_tables_create", "/products/price-tables", W, "Create a price table.", {
      body: { name: str("Price table name"), description: str("Description").optional() },
    }),
    PUT("tiendanube_price_tables_update", "/products/price-tables/{id}", W, "Update a price table.", {
      pathParams: { id: id("Price table ID") },
      body: { name: str("Price table name").optional(), description: str("Description").optional() },
    }),
    DELETE("tiendanube_price_tables_delete", "/products/price-tables/{id}", W, "Delete a price table.", {
      pathParams: { id: id("Price table ID") },
    }),
    ...(["categories", "variants", "customers"] as const).flatMap((sub) => {
      const base = `/products/price-tables/{table_id}/${sub}`;
      const pp = { table_id: id("Price table ID") };
      const tools = [
        LIST(`tiendanube_price_tables_${sub}_list`, base, R, `List ${sub} assigned to a price table.`, { pathParams: pp }),
        POST(`tiendanube_price_tables_${sub}_add`, base, W, `Assign ${sub} to a price table. Body shape per the API reference.`, {
          pathParams: pp,
          bodyKey: "payload",
          body: { payload: payload("Request body (object or array)") },
        }),
        DELETE(`tiendanube_price_tables_${sub}_remove`, base, W, `Remove ${sub} from a price table. Body shape per the API reference.`, {
          pathParams: pp,
          bodyKey: "payload",
          body: { payload: payload("Request body (object or array) identifying what to remove", false) },
        }),
      ];
      if (sub !== "customers") {
        tools.splice(2, 0, PUT(`tiendanube_price_tables_${sub}_update`, base, W, `Update ${sub} entries of a price table (e.g. prices). Body shape per the API reference.`, { pathParams: pp, bodyKey: "payload", body: { payload: payload("Request body (object or array)") } }));
      }
      return tools;
    }),
  ],
};
