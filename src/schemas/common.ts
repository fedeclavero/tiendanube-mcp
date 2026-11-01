import { z } from "zod";
import { MAX_PER_PAGE } from "../constants.js";
import { ResponseFormat } from "../services/format.js";

export type Shape = Record<string, z.ZodTypeAny>;

/** IDs may arrive as numbers or strings; 64-bit order line IDs must stay strings. */
export const Id = z.union([z.string(), z.number()]);
export const id = (description: string) => Id.describe(description);

/** i18n object, e.g. {"es": "Remera", "pt": "Camiseta"}. */
export const i18n = (description: string) =>
  z.record(z.string(), z.string()).describe(`${description} — i18n object keyed by language code, e.g. {"es": "...", "pt": "...", "en": "..."}`);

export const obj = (description: string) => z.record(z.string(), z.unknown()).describe(description);
export const objArray = (description: string) => z.array(z.record(z.string(), z.unknown())).describe(description);

export const str = (description: string) => z.string().describe(description);
export const num = (description: string) => z.number().describe(description);
export const bool = (description: string) => z.boolean().describe(description);
export const enumOf = <T extends [string, ...string[]]>(values: T, description: string) =>
  z.enum(values).describe(`${description} (${values.join(" | ")})`);

export const responseFormat = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.JSON)
  .describe("Output format: 'json' (default, full data) or 'markdown' (human-readable)");

export const paginationShape: Shape = {
  page: z.number().int().min(1).default(1).describe("Page number (default 1). Orders: page * per_page must be <= 10000"),
  per_page: z
    .number()
    .int()
    .min(1)
    .max(MAX_PER_PAGE)
    .default(30)
    .describe(`Items per page (default 30, max ${MAX_PER_PAGE}; max 50 for external invoices)`),
};

export const fieldsParam = z
  .string()
  .optional()
  .describe("Comma-separated list of fields to return, to reduce payload size (e.g. 'id,name,variants')");

/** Common date-range / cursor filters shared by many list endpoints. */
export const sinceId = id("Only return records with an ID greater than this value (cursor pagination)").optional();
export const created = {
  created_at_min: str("Created at or after (ISO 8601, e.g. 2025-01-31T00:00:00-03:00)").optional(),
  created_at_max: str("Created at or before (ISO 8601)").optional(),
};
export const updated = {
  updated_at_min: str("Updated at or after (ISO 8601)").optional(),
  updated_at_max: str("Updated at or before (ISO 8601)").optional(),
};
export const timeFilters: Shape = { since_id: sinceId, ...created, ...updated };
