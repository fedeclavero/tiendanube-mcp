import { CHARACTER_LIMIT } from "../constants.js";
/** Shared MCP result builders for the hand-written (non-declarative) tools. */
export const ok = (text, structured) => ({
    content: [{ type: "text", text: text.length > CHARACTER_LIMIT ? `${text.slice(0, CHARACTER_LIMIT)}\n[Output truncated: use filters or a smaller scope]` : text }],
    ...(structured ? { structuredContent: structured } : {}),
});
export const fail = (text) => ({ isError: true, content: [{ type: "text", text }] });
//# sourceMappingURL=result.js.map