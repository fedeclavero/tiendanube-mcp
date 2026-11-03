/** Shared MCP result builders for the hand-written (non-declarative) tools. */
export declare const ok: (text: string, structured?: Record<string, unknown>) => {
    content: {
        type: "text";
        text: string;
    }[];
    structuredContent?: Record<string, unknown> | undefined;
};
export declare const fail: (text: string) => {
    isError: true;
    content: {
        type: "text";
        text: string;
    }[];
};
