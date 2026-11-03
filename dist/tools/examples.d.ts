/**
 * Exact example arguments for the tools small models struggle with. They are appended to the tool
 * description ("Example arguments: {...}") and every one of them is executed against the real input
 * schema in the self-test, so an example can never drift out of sync with its tool.
 */
export declare const EXAMPLES: Record<string, Record<string, unknown>>;
