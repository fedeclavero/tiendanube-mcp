/** Hand-written tools (not generated from endpoint definitions). Single source of truth for counts and search. */
export interface CustomToolMeta {
    name: string;
    /** Registered only when the server is not read-only. */
    writeOnly: boolean;
    summary: string;
}
export declare const CUSTOM_TOOLS: CustomToolMeta[];
export declare const customToolCount: (readOnly: boolean) => number;
