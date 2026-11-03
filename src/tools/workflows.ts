import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { z } from "zod";
import { Id, i18n } from "../schemas/common.js";
import { TiendanubeClient } from "../services/client.js";
import { formatError } from "../services/errors.js";
import { fail, ok } from "./result.js";

type Json = Record<string, any>;

/** Documented general limit for product images (Tiendanube API docs: "less than 10MB"). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const textOf = (v: unknown, lang?: string): string => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (lang && typeof o[lang] === "string" && o[lang]) return o[lang] as string;
    return (Object.values(o).find((x) => typeof x === "string" && x) as string | undefined) ?? "";
  }
  return "";
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const toNumber = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : NaN;
};

function expandPath(p: string): string {
  return resolve(p.startsWith("~/") ? p.replace("~", homedir()) : p);
}

export interface ImageFile {
  base64: string;
  filename: string;
  mime: string;
  bytes: number;
}

/**
 * Read a local image for upload. Only real images are accepted (checked by magic bytes, not by
 * extension), so a prompt-injected "upload ~/.ssh/id_rsa" can never leave the machine through this tool.
 */
export function readImageFile(path: string): ImageFile {
  const file = expandPath(path);
  let size: number;
  try {
    const st = statSync(file);
    if (!st.isFile()) throw new Error("not a regular file");
    size = st.size;
  } catch {
    throw new Error(`File not found or unreadable: ${file}\nNext step: save the image to disk first and pass its absolute path.`);
  }
  if (size > MAX_IMAGE_BYTES) {
    throw new Error(`Image is ${(size / 1048576).toFixed(1)} MB; Tiendanube documents a limit of 10 MB.\nNext step: re-export it smaller (e.g. 1600x1600 JPG) and try again.`);
  }
  const head = Buffer.alloc(12);
  const fd = openSync(file, "r");
  try {
    readSync(fd, head, 0, 12, 0);
  } finally {
    closeSync(fd);
  }
  let mime: string | undefined;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) mime = "image/jpeg";
  else if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) mime = "image/png";
  else if (head.subarray(0, 4).toString("latin1") === "GIF8") mime = "image/gif";
  else if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") mime = "image/webp";
  if (!mime) {
    throw new Error(`${file} is not a JPEG, PNG, GIF or WEBP image (checked by file signature).\nNext step: export the picture as PNG or JPG and pass that file.`);
  }
  return { base64: readFileSync(file).toString("base64"), filename: basename(file), mime, bytes: size };
}

async function uploadImage(client: TiendanubeClient, productId: string | number, img: ImageFile, position?: number, alt?: Record<string, string>) {
  const body: Json = { attachment: img.base64, filename: img.filename };
  if (position !== undefined) body.position = position;
  if (alt) body.alt = alt;
  const { data } = await client.request<Json>({ method: "POST", path: `/products/${encodeURIComponent(String(productId))}/images`, body });
  return data;
}

async function storeLanguage(client: TiendanubeClient): Promise<{ lang: string; languages: string[] }> {
  const { data } = await client.request<Json>({ method: "GET", path: "/store", query: { fields: "languages,main_language" } });
  const languages: string[] = Array.isArray(data.languages) ? data.languages : [];
  const lang = (typeof data.main_language === "string" && data.main_language) || languages[0] || "es";
  return { lang, languages };
}

const asI18n = (v: string | Record<string, string> | undefined, lang: string): Record<string, string> | undefined =>
  v === undefined ? undefined : typeof v === "string" ? { [lang]: v } : v;

const variantLabel = (v: Json, lang: string) => (Array.isArray(v.values) ? v.values.map((x: unknown) => textOf(x, lang)).filter(Boolean).join(" / ") : "");

// ---------------------------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------------------------

export function registerWorkflowTools(server: McpServer, client: TiendanubeClient, options: { readOnly?: boolean } = {}): void {
  const readOnly = Boolean(options.readOnly);

  // ---- Image from a local file -------------------------------------------------------------
  if (!readOnly) {
    server.registerTool(
      "tiendanube_product_image_add_from_file",
      {
        title: "Upload A Local Image File To A Product",
        description:
          'Use this tool, not the browser or the admin panel, to upload an image file from this computer (for example one you just generated with your own image tool) to a product. Accepts JPG, PNG, GIF or WEBP under 10 MB; the file is verified to be a real image. Pass an ABSOLUTE path. Never paste base64 into the chat. For a public URL use tiendanube_product_images_create. Required scope: write_products. Example arguments: {"product_id":123456,"file_path":"/home/user/combo.png","position":1,"alt":{"es":"Combo verano"}}',
        inputSchema: {
          product_id: Id.describe("Product ID"),
          file_path: z.string().min(1).describe("Absolute path of the image file on this computer"),
          position: z.number().int().min(1).optional().describe("Position in the gallery (1 = main image)"),
          alt: i18n("Alt text").optional(),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async ({ product_id, file_path, position, alt }) => {
        try {
          const img = readImageFile(file_path);
          const image = await uploadImage(client, product_id, img, position, alt);
          return ok(`Uploaded ${img.filename} (${(img.bytes / 1024).toFixed(0)} KB) to product ${product_id}.\n${JSON.stringify(image, null, 2)}`, { image });
        } catch (error) {
          return fail(error instanceof Error && !("status" in error) ? `Error: ${error.message}` : formatError(error, { toolName: "tiendanube_product_image_add_from_file", scope: "write_products" }));
        }
      },
    );

    // ---- Combo ------------------------------------------------------------------------------
    server.registerTool(
      "tiendanube_create_combo",
      {
        title: "Create A Combo / Pack From Existing Products",
        description:
          'Use this tool, not the browser or the admin panel, to create a combo / pack / bundle product from products ALREADY in the store, in ONE call: it reads the components, computes the price (sum of component prices minus discount_percent, or your explicit price) and the stock (the scarcest component), builds the description, creates the product and uploads your images. It is created UNPUBLISHED (draft); tell the user and publish with tiendanube_products_update {"id":<id>,"published":true} once they agree. NOTE: the API cannot create native Kits, and a regular combo product does not deduct component stock when sold (warnings are returned). Components with several variants need variant_id. Required scope: read_products + write_products. Example arguments: {"name":"Combo Verano","components":[{"product_id":111,"quantity":1},{"product_id":222,"quantity":2}],"discount_percent":10,"image_files":["/home/user/combo.png"]}',
        inputSchema: {
          name: z.union([z.string().min(1), i18n("Combo name")]).describe("Combo name (plain text, or a language object)"),
          components: z
            .array(
              z.object({
                product_id: Id.describe("ID of an existing product"),
                variant_id: Id.optional().describe("Needed only when the product has more than one variant"),
                quantity: z.number().int().min(1).max(100).default(1).describe("Units of this product inside the combo"),
              }),
            )
            .min(1)
            .max(20)
            .describe("Products that make up the combo"),
          discount_percent: z.number().min(0).max(95).default(0).describe("Discount over the sum of component prices (0-95)"),
          price: z.union([z.number().positive(), z.string()]).optional().describe("Explicit combo price; overrides the computed one"),
          description: z.union([z.string(), i18n("Description (HTML allowed)")]).optional().describe("Default: an automatic 'Includes: ...' list"),
          sku: z.string().optional().describe("SKU for the combo (default COMBO-<ids>)"),
          category_ids: z.array(Id).optional().describe("Category IDs for the combo"),
          stock: z.number().int().min(0).nullable().optional().describe("Combo stock; default = scarcest component; null = unlimited"),
          image_files: z.array(z.string()).max(9).optional().describe("Absolute paths of image files to upload (first = main image)"),
          use_component_images: z.boolean().default(true).describe("If no image_files are given, reuse the components' main photos"),
          published: z.boolean().default(false).describe("Publish immediately (default false = draft)"),
          dry_run: z.boolean().default(false).describe("Only compute and return the plan; create nothing"),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (input) => {
        try {
          const { lang } = await storeLanguage(client);
          const cache = new Map<string, Json>();
          const parts: Array<{ product: Json; variant: Json; quantity: number; unit: number }> = [];
          for (const c of input.components) {
            const key = String(c.product_id);
            if (!cache.has(key)) {
              const { data } = await client.request<Json>({ method: "GET", path: `/products/${encodeURIComponent(key)}`, query: { fields: "id,name,variants,images" } });
              cache.set(key, data);
            }
            const product = cache.get(key)!;
            const variants: Json[] = Array.isArray(product.variants) ? product.variants : [];
            let variant: Json | undefined;
            if (c.variant_id !== undefined) variant = variants.find((v) => String(v.id) === String(c.variant_id));
            else if (variants.length === 1) variant = variants[0];
            if (!variant) {
              const options = variants.map((v) => `${v.id} (${variantLabel(v, lang) || v.sku || "?"}, price ${v.price})`).join("; ");
              return fail(
                c.variant_id !== undefined
                  ? `Error: variant ${c.variant_id} does not belong to product ${key}. Variants: ${options}\nNext step: call again with one of those variant_id values.`
                  : `Error: product ${key} ("${textOf(product.name, lang)}") has ${variants.length} variants, so variant_id is required. Variants: ${options}\nNext step: call again adding "variant_id" to that component.`,
              );
            }
            const promo = toNumber(variant.promotional_price);
            const unit = Number.isFinite(promo) && promo > 0 ? promo : toNumber(variant.price);
            if (!Number.isFinite(unit)) return fail(`Error: variant ${variant.id} of product ${key} has no price.\nNext step: set its price with tiendanube_variants_update or pick another variant.`);
            parts.push({ product, variant, quantity: c.quantity, unit });
          }

          const listTotal = parts.reduce((sum, p) => sum + p.unit * p.quantity, 0);
          const price = input.price !== undefined ? toNumber(input.price) : listTotal * (1 - input.discount_percent / 100);
          if (!Number.isFinite(price) || price <= 0) return fail("Error: the combo price is not a positive number.\nNext step: pass a valid 'price' or check the component prices.");

          const managed = parts.filter((p) => p.variant.stock_management !== false && typeof p.variant.stock === "number");
          const computedStock = managed.length ? Math.min(...managed.map((p) => Math.floor((p.variant.stock as number) / p.quantity))) : null;
          const stock = input.stock !== undefined ? input.stock : computedStock;

          const weights = parts.map((p) => toNumber(p.variant.weight));
          const weight = weights.every(Number.isFinite) ? weights.reduce((s, w, i) => s + w * parts[i].quantity, 0) : undefined;

          const name = asI18n(input.name as string | Record<string, string>, lang)!;
          const includes = parts
            .map((p) => `<li>${p.quantity} x ${escapeHtml(textOf(p.product.name, lang))}${variantLabel(p.variant, lang) ? ` (${escapeHtml(variantLabel(p.variant, lang))})` : ""}</li>`)
            .join("");
          const description = asI18n(input.description as string | Record<string, string> | undefined, lang) ?? { [lang]: `<p>Incluye:</p><ul>${includes}</ul>` };

          const variantBody: Json = {
            price: money(price),
            stock_management: stock !== null,
            stock,
            sku: input.sku ?? `COMBO-${parts.map((p) => p.product.id).join("-")}`.slice(0, 60),
          };
          if (weight !== undefined && weight > 0) variantBody.weight = String(Math.round(weight * 1000) / 1000);

          const body: Json = { name, description, published: input.published, variants: [variantBody] };
          if (input.category_ids?.length) body.categories = input.category_ids;
          if (!input.image_files?.length && input.use_component_images) {
            const srcs = [...new Set(parts.map((p) => (Array.isArray(p.product.images) ? p.product.images[0]?.src : undefined)).filter(Boolean))].slice(0, 9);
            if (srcs.length) body.images = srcs.map((src, i) => ({ src, position: i + 1 }));
          }

          const warnings = [
            "A regular combo product does NOT deduct the components' stock when it sells. Combo stock was set to the scarcest component; keep it in sync, or create a native Kit in the admin panel (the API can only read Kits) if automatic deduction is required.",
          ];
          if (listTotal > 0 && price >= listTotal && input.price === undefined && input.discount_percent === 0) warnings.push("No discount was applied: price equals the sum of the components. Pass discount_percent to make the combo attractive.");
          if (!input.published) warnings.push("Created as a DRAFT (not visible in the store).");

          const plan = {
            name,
            price: money(price),
            list_price_sum: money(listTotal),
            stock,
            weight_kg: variantBody.weight,
            components: parts.map((p) => ({ product_id: p.product.id, variant_id: p.variant.id, name: textOf(p.product.name, lang), quantity: p.quantity, unit_price: money(p.unit) })),
          };
          if (input.dry_run) return ok(`DRY RUN (nothing created):\n${JSON.stringify({ ...plan, request_body: body, warnings }, null, 2)}`, { dry_run: true, ...plan, warnings });

          const { data: created } = await client.request<Json>({ method: "POST", path: "/products", body });
          const uploaded: unknown[] = [];
          const uploadErrors: string[] = [];
          for (const [i, file] of (input.image_files ?? []).entries()) {
            try {
              uploaded.push(await uploadImage(client, created.id, readImageFile(file), i + 1));
            } catch (error) {
              uploadErrors.push(`${file}: ${error instanceof Error && !("status" in error) ? error.message : formatError(error, { scope: "write_products" })}`);
            }
          }
          const next = [
            input.published ? "The combo is live." : `Ask the user if you should publish it, then: tiendanube_products_update {"id":${created.id},"published":true}.`,
            ...(uploadErrors.length ? [`Some images failed to upload; fix and retry with tiendanube_product_image_add_from_file {"product_id":${created.id},"file_path":"..."}.`] : []),
          ];
          const result = {
            created: { id: created.id, name: textOf(created.name, lang), handle: textOf(created.handle, lang), published: created.published, canonical_url: created.canonical_url },
            ...plan,
            images_uploaded: uploaded.length,
            image_errors: uploadErrors,
            warnings,
            next_steps: next,
          };
          return ok(`Combo created (id ${created.id}, ${input.published ? "published" : "draft"}) at price ${plan.price}, stock ${stock === null ? "unlimited" : stock}.\n${JSON.stringify(result, null, 2)}`, result);
        } catch (error) {
          return fail(error instanceof Error && !("status" in error) ? `Error: ${error.message}` : formatError(error, { toolName: "tiendanube_create_combo", scope: "read_products + write_products" }));
        }
      },
    );
  }
}
