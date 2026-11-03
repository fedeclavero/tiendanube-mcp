import { ApiVersion } from "../constants.js";
export interface TiendanubeConfig {
    storeId: string;
    accessToken: string;
    userAgent?: string;
    apiDomain?: string;
    defaultVersion?: string;
}
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type QueryValue = string | number | boolean | undefined | null | Array<string | number>;
export interface RequestOptions {
    method: HttpMethod;
    path: string;
    version?: ApiVersion;
    query?: Record<string, QueryValue>;
    body?: unknown;
}
export interface ApiResponse<T = unknown> {
    data: T;
    status: number;
    headers: Headers;
}
/** Error thrown for any non-2xx response, carrying the parsed payload. */
export declare class TiendanubeApiError extends Error {
    readonly status: number;
    readonly method: string;
    readonly path: string;
    readonly payload: unknown;
    constructor(status: number, method: string, path: string, payload: unknown);
}
/**
 * Central HTTP client. Sends BOTH auth headers (`Authentication: bearer` for classic
 * endpoints, `Authorization: Bearer` for modern microservices), resolves the API
 * version per request and honours the leaky-bucket rate limit headers.
 */
export declare class TiendanubeClient {
    private readonly storeId;
    private readonly accessToken;
    private readonly userAgent;
    private readonly apiDomain;
    private readonly defaultVersion;
    /** Epoch ms until which new requests should wait (bucket nearly empty). */
    private pauseUntil;
    constructor(config: TiendanubeConfig);
    buildUrl(options: RequestOptions): URL;
    request<T = unknown>(options: RequestOptions): Promise<ApiResponse<T>>;
    private resetDelay;
    private trackRateLimit;
}
/** Where the effective credentials came from (never contains the secret itself). */
export interface ResolvedCredentials {
    storeId?: string;
    accessToken?: string;
    userAgent?: string;
    apiDomain?: string;
    apiVersion?: string;
    readOnly: boolean;
    scopes?: string[];
    source: {
        storeId: "env" | "file" | "none";
        accessToken: "env" | "file" | "none";
    };
}
/** Environment variables win; the user-level credentials file (see config/store.ts) fills the gaps. */
export declare function resolveCredentials(env?: NodeJS.ProcessEnv): ResolvedCredentials;
export declare const MISSING_CREDENTIALS_HELP: string;
/** Build a client from env vars / the saved credentials file, or throw with an actionable message. */
export declare function clientFromEnv(env?: NodeJS.ProcessEnv): TiendanubeClient;
