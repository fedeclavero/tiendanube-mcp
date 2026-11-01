export interface ErrorContext {
    toolName?: string;
    /** Human readable OAuth scope(s) required by the tool, used for 403 hints. */
    scope?: string;
    /** Version the request was sent against. */
    version?: string;
}
/** Translate any thrown value into an actionable message for the LLM. */
export declare function formatError(error: unknown, ctx?: ErrorContext): string;
