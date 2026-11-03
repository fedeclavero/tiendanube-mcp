import { CHARACTER_LIMIT } from "../constants.js";

/** Shared MCP result builders for the hand-written (non-declarative) tools. */
export const ok = (text: string, structured?: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: text.length > CHARACTER_LIMIT ? `${text.slice(0, CHARACTER_LIMIT)}\n[Output truncated: use filters or a smaller scope]` : text }],
  ...(structured ? { structuredContent: structured } : {}),
});

export const fail = (text: string) => ({ isError: true as const, content: [{ type: "text" as const, text }] });
