import { DEFAULT_API_DOMAIN, DEFAULT_API_VERSION, DEFAULT_USER_AGENT, MAX_RATE_LIMIT_RETRIES, REQUEST_TIMEOUT_MS, } from "../constants.js";
/** Error thrown for any non-2xx response, carrying the parsed payload. */
export class TiendanubeApiError extends Error {
    status;
    method;
    path;
    payload;
    constructor(status, method, path, payload) {
        super(`Tiendanube API ${status} on ${method} ${path}`);
        this.status = status;
        this.method = method;
        this.path = path;
        this.payload = payload;
        this.name = "TiendanubeApiError";
    }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * Central HTTP client. Sends BOTH auth headers (`Authentication: bearer` for classic
 * endpoints, `Authorization: Bearer` for modern microservices), resolves the API
 * version per request and honours the leaky-bucket rate limit headers.
 */
export class TiendanubeClient {
    storeId;
    accessToken;
    userAgent;
    apiDomain;
    defaultVersion;
    /** Epoch ms until which new requests should wait (bucket nearly empty). */
    pauseUntil = 0;
    constructor(config) {
        this.storeId = config.storeId;
        this.accessToken = config.accessToken;
        this.userAgent = config.userAgent || DEFAULT_USER_AGENT;
        this.apiDomain = (config.apiDomain || DEFAULT_API_DOMAIN).replace(/\/+$/, "");
        this.defaultVersion = config.defaultVersion || DEFAULT_API_VERSION;
    }
    buildUrl(options) {
        const version = options.version || this.defaultVersion;
        const cleanPath = options.path.startsWith("/") ? options.path : `/${options.path}`;
        const url = new URL(`${this.apiDomain}/${version}/${this.storeId}${cleanPath}`);
        for (const [key, value] of Object.entries(options.query ?? {})) {
            if (value === undefined || value === null || value === "")
                continue;
            url.searchParams.append(key, Array.isArray(value) ? value.join(",") : String(value));
        }
        return url;
    }
    async request(options) {
        const url = this.buildUrl(options);
        const headers = {
            Authentication: `bearer ${this.accessToken}`,
            Authorization: `Bearer ${this.accessToken}`,
            "User-Agent": this.userAgent,
            "Content-Type": "application/json; charset=utf-8",
            Accept: "application/json",
        };
        for (let attempt = 0;; attempt++) {
            const wait = this.pauseUntil - Date.now();
            if (wait > 0)
                await sleep(Math.min(wait, 10000));
            const response = await fetch(url, {
                method: options.method,
                headers,
                body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            this.trackRateLimit(response.headers);
            if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
                await sleep(this.resetDelay(response.headers, 2000));
                continue;
            }
            const text = await response.text();
            let data = {};
            if (text) {
                try {
                    data = JSON.parse(text);
                }
                catch {
                    data = { raw: text };
                }
            }
            if (!response.ok) {
                throw new TiendanubeApiError(response.status, options.method, url.pathname, data);
            }
            if (response.status === 204 || text === "")
                data = { success: true };
            return { data: data, status: response.status, headers: response.headers };
        }
    }
    resetDelay(headers, fallback) {
        const reset = Number(headers.get("x-rate-limit-reset"));
        return Number.isFinite(reset) && reset > 0 ? Math.min(reset, 15000) : fallback;
    }
    trackRateLimit(headers) {
        const remaining = headers.get("x-rate-limit-remaining");
        if (remaining !== null && Number(remaining) <= 2) {
            this.pauseUntil = Date.now() + this.resetDelay(headers, 1000);
        }
    }
}
/** Build a client from environment variables, or throw with a helpful message. */
export function clientFromEnv(env = process.env) {
    const storeId = env.TIENDANUBE_STORE_ID;
    const accessToken = env.TIENDANUBE_ACCESS_TOKEN;
    if (!storeId || !accessToken) {
        throw new Error("TIENDANUBE_STORE_ID and TIENDANUBE_ACCESS_TOKEN environment variables are required.");
    }
    return new TiendanubeClient({
        storeId,
        accessToken,
        userAgent: env.TIENDANUBE_USER_AGENT,
        apiDomain: env.TIENDANUBE_API_DOMAIN,
        defaultVersion: env.TIENDANUBE_API_VERSION,
    });
}
//# sourceMappingURL=client.js.map