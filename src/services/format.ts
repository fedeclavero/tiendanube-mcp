import { CHARACTER_LIMIT } from "../constants.js";

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

export interface ListEnvelope {
  count: number;
  page: number;
  per_page: number;
  total?: number;
  has_more: boolean;
  next_page?: number;
  items: unknown[];
  truncated?: boolean;
  truncation_message?: string;
}

function scalar(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  return String(value);
}

function label(item: unknown): string {
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    const name = o.name ?? o.title ?? o.code ?? o.email ?? o.number;
    const shown =
      name && typeof name === "object" ? Object.values(name as object).find((v) => typeof v === "string") : name;
    const id = o.id ?? o.key;
    if (shown !== undefined && id !== undefined) return `${scalar(shown)} (${scalar(id)})`;
    if (shown !== undefined) return scalar(shown);
    if (id !== undefined) return `#${scalar(id)}`;
  }
  return "item";
}

/** Generic JSON -> Markdown renderer (bounded depth) for arbitrary API payloads. */
export function toMarkdown(value: unknown, indent = 0, depth = 0): string {
  const pad = "  ".repeat(indent);
  if (value === null || typeof value !== "object") return `${pad}${scalar(value)}`;
  if (depth > 5) return `${pad}${JSON.stringify(value)}`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}(empty)`;
    return value
      .map((item) =>
        item && typeof item === "object"
          ? `${pad}- **${label(item)}**\n${toMarkdown(item, indent + 1, depth + 1)}`
          : `${pad}- ${scalar(item)}`,
      )
      .join("\n");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return `${pad}(empty)`;
  return entries
    .map(([k, v]) => {
      if (v !== null && typeof v === "object") {
        const inner = toMarkdown(v, indent + 1, depth + 1);
        return `${pad}- **${k}**:\n${inner}`;
      }
      return `${pad}- **${k}**: ${scalar(v)}`;
    })
    .join("\n");
}

export interface Rendered {
  text: string;
  structured: Record<string, unknown>;
}

function toStructured(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) return payload as Record<string, unknown>;
  if (Array.isArray(payload)) return { items: payload };
  return { result: payload };
}

/**
 * Render a payload honouring CHARACTER_LIMIT. List envelopes are truncated by
 * dropping trailing items; anything else is cut at the limit with a notice.
 */
export function render(payload: unknown, format: ResponseFormat): Rendered {
  const asText = (p: unknown) =>
    format === ResponseFormat.JSON ? JSON.stringify(p, null, 2) : toMarkdown(p);

  let text = asText(payload);
  let structured = toStructured(payload);

  if (text.length > CHARACTER_LIMIT) {
    const env = payload as Partial<ListEnvelope> | undefined;
    if (env && Array.isArray(env.items) && env.items.length > 1) {
      let items = env.items;
      while (items.length > 1 && asText({ ...env, items }).length > CHARACTER_LIMIT) {
        items = items.slice(0, Math.max(1, Math.floor(items.length / 2)));
      }
      const truncated: ListEnvelope = {
        ...(env as ListEnvelope),
        items,
        count: items.length,
        truncated: true,
        truncation_message: `Response truncated from ${env.items.length} to ${items.length} items. Use a smaller per_page, the 'fields' parameter, or more filters to narrow the result.`,
      };
      text = asText(truncated);
      structured = toStructured(truncated);
    }
    if (text.length > CHARACTER_LIMIT) {
      text =
        text.slice(0, CHARACTER_LIMIT) +
        "\n\n[Output truncated. Use the 'fields' parameter to request fewer fields or add filters.]";
    }
  }
  return { text, structured };
}
