import { EXAMPLES } from "./tools/examples.js";

/**
 * Everything an AI agent needs to USE this server instead of falling back to a browser.
 * Written for weak models: imperative, no ambiguity, exact tool names and example arguments.
 * The same content is reachable three ways because clients differ:
 *   1. server `instructions` (sent on initialize),  2. tools (start_here / find_tool / get_recipe),
 *   3. MCP resources (tiendanube://guide/*). Many clients ignore 1 and 3, so 2 is the one that matters.
 */

export const SERVER_INSTRUCTIONS = `TIENDANUBE MCP: USE THESE TOOLS. This server is already connected to the user's Tiendanube / Nuvemshop store with the user's API access. It does everything the store admin panel does, in seconds.

RULES (follow them exactly):
1. For ANY task about the user's store (products, variants, prices, stock, images, categories, orders, customers, coupons, promotions, shipping, pages, webhooks, reports) call THIS server's tools. NEVER use a browser, agent-browser, Playwright, screenshots, scraping or the web admin for these tasks: it is 50x slower and breaks. If you are about to open the admin panel in a browser, STOP and use a tool below.
2. Not sure which tool? Call tiendanube_start_here (task -> tool map) or tiendanube_find_tool with a plain-language query (Spanish or English). For multi-step jobs call tiendanube_get_recipe.
3. Prefer the one-call workflow tools: tiendanube_create_combo (combos/packs) and tiendanube_product_image_add_from_file (upload an image file).
4. No dedicated tool for what you need? Use tiendanube_api_request (any store API route). Only if that also fails, ask the user.
5. Images: create or edit the image yourself with your own image tool, save it to a local file, then upload it with tiendanube_product_image_add_from_file (or pass a public URL as "src"). Never paste base64 into the chat.
6. Text fields (name, description, handle, seo_*) are objects per language: {"es": "..."}. Call tiendanube_store_get once to learn the store's languages.
7. Price, SKU, weight and stock live on VARIANTS, not on the product.
8. Errors end with "Next step:". Do that step yourself. For 401/403 or anything that looks like a setup problem call tiendanube_doctor and follow it. You are allowed to handle the user's keys to fix it: ask the user for the missing value and save it yourself; never answer "I can't do that, do it yourself".
9. Before deleting, cancelling or changing MANY records, tell the user what will happen and how many records are affected, then proceed once they agree.
10. Answer the user in the user's language.`;

export interface Recipe {
  id: string;
  title: string;
  /** Phrases (ES/EN) that should make the agent pick this recipe. */
  triggers: string[];
  steps: string[];
  notes?: string[];
}

export const RECIPES: Recipe[] = [
  {
    id: "combo",
    title: "Create combos / packs / kits from products already in the store (with generated images)",
    triggers: ["combo", "combos", "pack", "kit", "bundle", "armame combos", "generame combos", "paquete de productos", "promo pack"],
    steps: [
      'tiendanube_store_get {} -> note "languages" (e.g. ["es"]).',
      'Find the components: tiendanube_products_list {"q":"remera","fields":"id,name,variants,images","per_page":50}. Never browse the admin for this.',
      "OPTIONAL image: make the combo picture with YOUR OWN image tool (e.g. a collage/composition of the component photos on a clean background, square, at least 1000x1000), save it as a local .png/.jpg and keep the absolute path.",
      'tiendanube_create_combo {"name":"Combo Verano","components":[{"product_id":111,"quantity":1},{"product_id":222,"quantity":2}],"discount_percent":10,"image_files":["/absolute/path/combo.png"]}. Add "dry_run":true first only if you want to preview. Components with more than one variant need "variant_id".',
      'The combo is created UNPUBLISHED (draft). Tell the user the name, price and stock, then ask "Do you want me to publish it?". To publish: tiendanube_products_update {"id":<new product id>,"published":true}.',
      "Repeat step 4 for each combo the user asked for (one call per combo).",
    ],
    notes: [
      "The Tiendanube API only READS native Kits (GET /kits/{id}); native Kits are created in the admin panel. This tool creates a regular product that represents the combo.",
      "A regular combo product does NOT deduct the components' stock when sold. The tool sets the combo stock to the scarcest component; tell the user to keep it in sync, or to create a native Kit in the admin if they need automatic deduction.",
    ],
  },
  {
    id: "bulk-price",
    title: "Raise or lower prices on many products",
    triggers: ["subir precios", "bajar precios", "aumentar precios", "descuento masivo", "raise prices", "change prices", "inflation", "actualizar precios", "porcentaje"],
    steps: [
      'Read the affected variants: tiendanube_products_list {"category_id":456,"fields":"id,name,variants","per_page":200} (add "q" or "published" to narrow; follow next_page).',
      "Compute the new price of every variant yourself and show the user a before/after table with the number of variants. Wait for the user to agree.",
      'Apply: tiendanube_products_batch_stock_price {"items":[{"id":123,"variants":[{"id":789,"price":"16800.00"}]}]}. MAX 50 VARIANTS PER CALL (API limit): split longer lists into several calls.',
      "Keep the old prices in your answer so the change can be undone with the same tool.",
    ],
    notes: ["Prices are decimal strings. Promotional prices are set per variant with tiendanube_variants_update {\"promotional_price\":\"...\"}."],
  },
  {
    id: "stock",
    title: "Check or change stock",
    triggers: ["stock", "inventario", "sin stock", "reponer", "poner stock", "inventory", "out of stock"],
    steps: [
      'Low stock list: tiendanube_products_list {"max_stock":5,"fields":"id,name,variants"}.',
      'Find by SKU: tiendanube_products_get_by_sku {"sku":"REM-001-M"} -> note product id and variant id.',
      'Set exact stock: tiendanube_variants_update_stock {"product_id":123,"id":789,"action":"replace","value":40}. Add stock: "action":"variation","value":20.',
      'Many products at once: tiendanube_products_batch_stock_price {"items":[{"id":123,"variants":[{"id":789,"inventory_levels":[{"location_id":"L1","stock":40}]}]}]} (max 50 variants per call).',
    ],
  },
  {
    id: "create-product",
    title: "Create a new product (with variants, images, category)",
    triggers: ["crear producto", "nuevo producto", "subir producto", "agregar producto", "create product", "add product", "new product"],
    steps: [
      "tiendanube_store_get {} for the languages, then tiendanube_categories_list {} to find (or tiendanube_categories_create {\"name\":{\"es\":\"Remeras\"}}) the category id.",
      'tiendanube_products_create {"name":{"es":"Remera Básica"},"published":false,"categories":[456],"attributes":[{"es":"Talle"}],"variants":[{"values":[{"es":"S"}],"price":"15000.00","stock_management":true,"stock":10,"sku":"REM-001-S"},{"values":[{"es":"M"}],"price":"15000.00","stock_management":true,"stock":10,"sku":"REM-001-M"}],"images":[{"src":"https://example.com/foto.jpg"}]}. No sizes/colors: omit "attributes" and send one variant without "values".',
      "Local image file instead of URL: tiendanube_product_image_add_from_file {\"product_id\":<new id>,\"file_path\":\"/absolute/path/foto.png\"}.",
      "Tell the user it was created as a draft and ask before publishing (tiendanube_products_update {\"id\":<id>,\"published\":true}).",
    ],
  },
  {
    id: "images",
    title: "Add or replace product images (including images you generated)",
    triggers: ["imagen", "imágenes", "foto", "fotos", "subir imagen", "image", "picture", "photo", "upload image"],
    steps: [
      'Local file (generated or downloaded): tiendanube_product_image_add_from_file {"product_id":123,"file_path":"/absolute/path/foto.png","position":1,"alt":{"es":"Remera roja"}}.',
      'Public URL: tiendanube_product_images_create {"product_id":123,"src":"https://example.com/foto.jpg"}.',
      'Reorder / alt text: tiendanube_product_images_update {"product_id":123,"id":<image id>,"position":1}. Remove: tiendanube_product_images_delete.',
    ],
    notes: ["jpg, png, gif or webp; under 10 MB (the documented general limit); max 250 images per product."],
  },
  {
    id: "catalog-audit",
    title: "Audit the catalog (missing images, SKU, weight, hidden or out-of-stock products)",
    triggers: ["auditar", "auditoría", "salud del catálogo", "revisar catálogo", "audit", "catalog health", "productos sin", "missing"],
    steps: [
      'Hidden products: tiendanube_products_list {"published":false,"fields":"id,name"}.',
      'Without SKU or weight: tiendanube_products_list {"has_skus":false,"fields":"id,name"} and {"has_weight":false,"fields":"id,name"}.',
      'Low stock: tiendanube_products_list {"max_stock":5,"fields":"id,name,variants"}.',
      'Without images or description: tiendanube_products_list {"fields":"id,name,images,description","per_page":200} and check the empty ones yourself.',
      "Fix what the user approves with tiendanube_products_update / tiendanube_variants_update / tiendanube_product_image_add_from_file.",
    ],
  },
  {
    id: "seo",
    title: "Improve titles, descriptions and SEO fields",
    triggers: ["seo", "descripciones", "mejorar títulos", "mejorar descripciones", "titles", "descriptions", "meta"],
    steps: [
      'Read: tiendanube_products_list {"fields":"id,name,description,seo_title,seo_description","per_page":50}.',
      'Write per product: tiendanube_products_update {"id":123,"seo_title":{"es":"..."},"seo_description":{"es":"..."},"description":{"es":"<p>...</p>"}}.',
    ],
    notes: ["seo_title max 70 characters, seo_description max 320."],
  },
  {
    id: "orders-to-ship",
    title: "Orders that are paid but not shipped",
    triggers: ["pedidos", "órdenes", "ordenes", "por enviar", "sin enviar", "pendientes de envío", "orders", "to ship", "unshipped"],
    steps: [
      'tiendanube_orders_list {"financial_status":"paid","shipping_status":"unpacked","per_page":50}.',
      'Order detail: tiendanube_orders_get {"id":1042}.',
    ],
  },
  {
    id: "ship-order",
    title: "Mark an order as dispatched with tracking",
    triggers: ["despachar", "marcar como enviado", "tracking", "código de seguimiento", "dispatch", "ship order"],
    steps: [
      'tiendanube_fulfillment_orders_list {"order_id":1042} -> note the fulfillment order id.',
      'tiendanube_fulfillment_orders_update {"order_id":1042,"id":"<fulfillment id>","status":"DISPATCHED","tracking_info":{"code":"ABC123"},"notify_customer":true}.',
    ],
  },
  {
    id: "sales-report",
    title: "Sales summary for a period",
    triggers: ["ventas", "reporte", "resumen de ventas", "facturación", "sales", "report", "revenue"],
    steps: [
      'tiendanube_orders_list {"created_at_min":"2026-10-01T00:00:00-03:00","created_at_max":"2026-10-31T23:59:59-03:00","financial_status":"paid","per_page":200,"fields":"id,number,total,created_at,products"}; follow "next_page" until has_more is false.',
      "Compute orders, revenue, average ticket and top products yourself from the items.",
    ],
    notes: ["Orders are capped at page*per_page <= 10000: slice long periods by date ranges."],
  },
  {
    id: "coupon",
    title: "Create a discount coupon",
    triggers: ["cupón", "cupon", "descuento", "código de descuento", "coupon", "discount code"],
    steps: ['tiendanube_coupons_create {"code":"BIENVENIDA15","type":"percentage","value":"15","max_uses_per_client":1,"end_date":"2026-12-31"}. Types: percentage | absolute | shipping.'],
  },
  {
    id: "abandoned-carts",
    title: "Recover abandoned carts",
    triggers: ["carritos abandonados", "checkouts abandonados", "recuperar", "abandoned"],
    steps: [
      'tiendanube_abandoned_checkouts_list {"created_at_min":"2026-10-30T00:00:00-03:00"}.',
      'Create a coupon (recipe "coupon"), then tiendanube_abandoned_checkouts_apply_coupon {"id":<checkout id>,"coupon_id":<coupon id>} for each checkout.',
    ],
  },
  {
    id: "fix-access",
    title: "Fix connection problems (401, 403 missing scope, wrong token, new permissions)",
    triggers: ["401", "403", "permiso", "permisos", "token", "scope", "no funciona", "unauthorized", "forbidden", "credenciales", "credentials"],
    steps: [
      "Call tiendanube_doctor {}. It tells you which credentials are active and which read scopes are missing.",
      "401 -> the token is wrong/rotated/uninstalled. Ask the user for the new token (or run the login flow below) and save it yourself: npx -y github:fedeclavero/tiendanube-mcp configure --store-id <ID> --token <TOKEN>.",
      "403 (missing scope) -> in the app settings tick ALL permissions (scopes), then re-authorize so a NEW token is issued (scopes only apply to new tokens): npx -y github:fedeclavero/tiendanube-mcp login --client-id <APP_ID> --client-secret <SECRET>. Custom app from the admin panel: edit permissions there and copy the new token.",
      "After saving credentials ask the user to restart the AI client so the server reloads them.",
    ],
    notes: ["Full guide: guides/GETTING_CREDENTIALS.md. You may handle the user's keys for this; ask the user for values, then do it yourself."],
  },
];

/** Task -> tool map shown by tiendanube_start_here. */
export const TASK_MAP: Array<[string, string]> = [
  ["Store info, languages, currency", "tiendanube_store_get"],
  ["Search / list / read products", "tiendanube_products_list, tiendanube_products_get, tiendanube_products_get_by_sku"],
  ["Create or edit a product", "tiendanube_products_create, tiendanube_products_update"],
  ["Change price of one variant", "tiendanube_variants_update"],
  ["Change prices of MANY products", "recipe bulk-price (tiendanube_products_batch_stock_price, max 50 variants per call)"],
  ["Set / add stock", "tiendanube_variants_update_stock, tiendanube_products_batch_stock_price"],
  ["Create combos / packs from existing products", "tiendanube_create_combo"],
  ["Upload an image file you generated", "tiendanube_product_image_add_from_file"],
  ["Add an image from a URL", "tiendanube_product_images_create"],
  ["Audit the catalog", "recipe catalog-audit (tiendanube_products_list with filters)"],
  ["Categories", "tiendanube_categories_list, tiendanube_categories_create, tiendanube_categories_update"],
  ["Orders: list, read, cancel, close", "tiendanube_orders_list, tiendanube_orders_get, tiendanube_orders_cancel, tiendanube_orders_close"],
  ["Ship an order / tracking", "tiendanube_fulfillment_orders_list, tiendanube_fulfillment_orders_update"],
  ["Customers", "tiendanube_customers_list, tiendanube_customers_get, tiendanube_customers_create"],
  ["Coupons and promotions", "tiendanube_coupons_create, tiendanube_coupons_list, tiendanube_promotions_create"],
  ["Abandoned carts", "tiendanube_abandoned_checkouts_list, tiendanube_abandoned_checkouts_apply_coupon"],
  ["Pages and blog", "tiendanube_pages_create, tiendanube_pages_update, tiendanube_blogs_list"],
  ["Webhooks", "tiendanube_webhooks_create, tiendanube_webhooks_list"],
  ["Anything else in the Tiendanube API", "tiendanube_find_tool, then tiendanube_api_request"],
  ["Something fails (401/403/setup)", "tiendanube_doctor"],
];

export function startHereText(toolCount?: number): string {
  return [
    "# Tiendanube MCP: start here",
    "",
    `You are connected to the user's store through ${toolCount ? `${toolCount} tools` : "this server's tools"}. USE THEM. Do not open a browser or the admin panel for store tasks.`,
    "",
    "## If the user asks for... -> call...",
    ...TASK_MAP.map(([task, tools]) => `- ${task}: ${tools}`),
    "",
    "## Golden rules",
    "1. Tools first. A browser is never needed for store tasks.",
    '2. Text fields are language objects: {"es": "..."}. Price, SKU, weight and stock live on variants.',
    "3. Generate images with your own image tool, save a local file, upload it with tiendanube_product_image_add_from_file.",
    "4. New products and combos are created as drafts (published:false). Ask the user before publishing.",
    "5. Before deleting or changing many records, say what you will do and how many, then do it once the user agrees.",
    '6. When a call fails, read the "Next step:" at the end of the error and do it. For setup/permission problems call tiendanube_doctor.',
    "",
    "## Step-by-step recipes (call tiendanube_get_recipe with the id)",
    ...RECIPES.map((r) => `- ${r.id}: ${r.title}`),
    "",
    "Unsure which tool? tiendanube_find_tool {\"query\":\"what you want to do\"} (Spanish or English).",
  ].join("\n");
}

export function recipeText(r: Recipe): string {
  return [
    `# Recipe "${r.id}": ${r.title}`,
    "",
    ...r.steps.map((s, i) => `${i + 1}. ${s}`),
    ...(r.notes?.length ? ["", "Notes:", ...r.notes.map((n) => `- ${n}`)] : []),
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------
// Tool search (for models that cannot scan 200 tool definitions)
// ---------------------------------------------------------------------------------------------

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Spanish -> English stems so Spanish queries hit the English tool descriptions. */
const SYNONYMS: Record<string, string> = {
  producto: "product", productos: "product", articulo: "product", articulos: "product",
  variante: "variant", variantes: "variant", talle: "variant", color: "variant",
  precio: "price", precios: "price", costo: "price",
  pedido: "order", pedidos: "order", orden: "order", ordenes: "order", venta: "order", ventas: "order", compra: "order",
  cliente: "customer", clientes: "customer",
  cupon: "coupon", cupones: "coupon", descuento: "coupon", descuentos: "discount", promocion: "promotion", promociones: "promotion",
  envio: "shipping", envios: "shipping", despacho: "fulfillment", despachar: "fulfillment", seguimiento: "tracking",
  imagen: "image", imagenes: "image", foto: "image", fotos: "image",
  categoria: "category", categorias: "category",
  pagina: "page", paginas: "page",
  carrito: "cart", carritos: "cart", abandonado: "abandoned", abandonados: "abandoned",
  inventario: "stock", existencias: "stock",
  tienda: "store", sucursal: "location", deposito: "location",
  factura: "invoice", facturas: "invoice", pago: "payment", pagos: "payment",
  eliminar: "delete", borrar: "delete", crear: "create", agregar: "create", actualizar: "update", modificar: "update", editar: "update",
  listar: "list", buscar: "list", ver: "get", obtener: "get", cancelar: "cancel",
  combo: "combo", combos: "combo", paquete: "combo", pack: "combo", kit: "combo",
};

export interface SearchableTool {
  name: string;
  description: string;
  method: string;
}

const STOPWORDS = new Set(
  "quiero queres quiere necesito necesitas hacer haceme dame darme poder puedo puedes los las el la lo le les de del una un unos unas mi mis tu tus su sus que para por con sin en y o a al me te se es son hay todo todos toda todas the an of to my me i we you want need would like please can could all and or for with from in on is are do how what which".split(" "),
);

/** "categories" -> "category", "prices" -> "price", "orders" -> "order": cheap, language-agnostic plural folding. */
const stem = (w: string) => (w.endsWith("ies") && w.length > 4 ? `${w.slice(0, -3)}y` : w.endsWith("s") && w.length > 3 ? w.slice(0, -1) : w);

function queryWords(query: string): string[] {
  return [
    ...new Set(
      normalize(query)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w))
        .map((w) => stem(SYNONYMS[w] ?? w)),
    ),
  ];
}

export interface SearchableTool {
  name: string;
  description: string;
  method: string;
}

export function searchTools(query: string, tools: SearchableTool[], limit = 8): SearchableTool[] {
  const words = queryWords(query);
  if (!words.length) return [];
  const scored = tools.map((t) => {
    const parts = normalize(t.name).replace(/^tiendanube_/, "").split("_").map(stem);
    const desc = new Set(normalize(t.description).split(/[^a-z0-9]+/).filter(Boolean).map(stem));
    let score = 0;
    for (const w of words) {
      if (parts.includes(w)) score += 5;
      else if (w.length >= 4 && parts.some((p) => p.startsWith(w))) score += 3;
      if (desc.has(w)) score += 1;
    }
    if (score > 0 && EXAMPLES[t.name]) score += 1; // the main, best-documented tools win ties
    return { t, score };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.t.name.localeCompare(b.t.name))
    .slice(0, limit)
    .map((x) => x.t);
}

export function searchRecipes(query: string): Recipe[] {
  const q = normalize(query);
  const words = queryWords(query);
  return RECIPES.map((r) => {
    let score = 0;
    for (const trig of r.triggers) {
      const t = normalize(trig);
      if (q.includes(t)) score += 4;
      else if (words.some((w) => t.split(/[^a-z0-9]+/).map(stem).includes(w))) score += 1;
    }
    if (words.some((w) => normalize(r.title).split(/[^a-z0-9]+/).map(stem).includes(w))) score += 1;
    return { r, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.r);
}
