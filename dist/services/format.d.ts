export declare enum ResponseFormat {
    MARKDOWN = "markdown",
    JSON = "json"
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
/** Generic JSON -> Markdown renderer (bounded depth) for arbitrary API payloads. */
export declare function toMarkdown(value: unknown, indent?: number, depth?: number): string;
export interface Rendered {
    text: string;
    structured: Record<string, unknown>;
}
/**
 * Render a payload honouring CHARACTER_LIMIT. List envelopes are truncated by
 * dropping trailing items; anything else is cut at the limit with a notice.
 */
export declare function render(payload: unknown, format: ResponseFormat): Rendered;
