import { ResolvedCredentials, TiendanubeClient } from "./services/client.js";
import { EndpointDef, ToolModule } from "./tools/registry.js";
export type ScopeState = "ok" | "missing" | "unknown";
export interface DoctorReport {
    ok: boolean;
    credentials: {
        storeId?: string;
        tokenSet: boolean;
        from: {
            storeId: string;
            accessToken: string;
        };
        file: string;
        userAgent?: string;
        apiDomain?: string;
    };
    mode: "read-write" | "read-only";
    store?: {
        id?: unknown;
        name?: string;
        plan?: string;
        country?: string;
        currency?: string;
        languages?: string[];
    };
    /** Read scopes verified with a cheap GET each. Write scopes cannot be probed without writing. */
    readScopes: Record<string, ScopeState>;
    missingReadScopes: string[];
    grantedScopes?: string[];
    problems: string[];
    nextSteps: string[];
}
/** One argument-free GET per distinct read_* scope, taken from the real tool definitions. */
export declare function probeDefs(modules: ToolModule[]): Map<string, EndpointDef>;
export declare function diagnose(creds: ResolvedCredentials, client: TiendanubeClient | undefined, modules: ToolModule[], options?: {
    probeScopes?: boolean;
}): Promise<DoctorReport>;
export declare function renderReport(r: DoctorReport): string;
