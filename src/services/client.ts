import {
  ApiVersion,
  DEFAULT_API_DOMAIN,
  DEFAULT_API_VERSION,
  DEFAULT_USER_AGENT,
  MAX_RATE_LIMIT_RETRIES,
  REQUEST_TIMEOUT_MS,
} from "../constants.js";
import { loadStored } from "../config/store.js";

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
export class TiendanubeApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly method: string,
    public readonly path: string,
    public readonly payload: unknown,
  ) {
    super(`Tiendanube API ${status} on ${method} ${path}`);
    this.name = "TiendanubeApiError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Central HTTP client. Sends BOTH auth headers (`Authentication: bearer` for classic
 * endpoints, `Authorization: Bearer` for modern microservices), resolves the API
 * version per request and honours the leaky-bucket rate limit headers.
 */
export class TiendanubeClient {
  private readonly storeId: string;
  private readonly accessToken: string;
  private readonly userAgent: string;
  private readonly apiDomain: string;
  private readonly defaultVersion: string;
  /** Epoch ms until which new requests should wait (bucket nearly empty). */
  private pauseUntil = 0;

  constructor(config: TiendanubeConfig) {
    this.storeId = config.storeId;
    this.accessToken = config.accessToken;
    this.userAgent = config.userAgent || DEFAULT_USER_AGENT;
    this.apiDomain = (config.apiDomain || DEFAULT_API_DOMAIN).replace(/\/+$/, "");
    this.defaultVersion = config.defaultVersion || DEFAULT_API_VERSION;
  }

  buildUrl(options: RequestOptions): URL {
    const version = options.version || this.defaultVersion;
    const cleanPath = options.path.startsWith("/") ? options.path : `/${options.path}`;
    const url = new URL(`${this.apiDomain}/${version}/${this.storeId}${cleanPath}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.append(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    return url;
  }

  async request<T = unknown>(options: RequestOptions): Promise<ApiResponse<T>> {
    const url = this.buildUrl(options);
    const headers: Record<string, string> = {
      Authentication: `bearer ${this.accessToken}`,
      Authorization: `Bearer ${this.accessToken}`,
      "User-Agent": this.userAgent,
      "Content-Type": "application/json; charset=utf-8",
      Accept: "application/json",
    };

    for (let attempt = 0; ; attempt++) {
      const wait = this.pauseUntil - Date.now();
      if (wait > 0) await sleep(Math.min(wait, 10000));

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
      let data: unknown = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
      }
      if (!response.ok) {
        throw new TiendanubeApiError(response.status, options.method, url.pathname, data);
      }
      if (response.status === 204 || text === "") data = { success: true };
      return { data: data as T, status: response.status, headers: response.headers };
    }
  }

  private resetDelay(headers: Headers, fallback: number): number {
    const reset = Number(headers.get("x-rate-limit-reset"));
    return Number.isFinite(reset) && reset > 0 ? Math.min(reset, 15000) : fallback;
  }

  private trackRateLimit(headers: Headers): void {
    const remaining = headers.get("x-rate-limit-remaining");
    if (remaining !== null && Number(remaining) <= 2) {
      this.pauseUntil = Date.now() + this.resetDelay(headers, 1000);
    }
  }
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
  source: { storeId: "env" | "file" | "none"; accessToken: "env" | "file" | "none" };
}

/** Environment variables win; the user-level credentials file (see config/store.ts) fills the gaps. */
export function resolveCredentials(env: NodeJS.ProcessEnv = process.env): ResolvedCredentials {
  const stored = loadStored(env);
  const pick = (fromEnv?: string, fromFile?: string): [string | undefined, "env" | "file" | "none"] =>
    fromEnv ? [fromEnv, "env"] : fromFile ? [fromFile, "file"] : [undefined, "none"];
  const [storeId, storeSource] = pick(env.TIENDANUBE_STORE_ID, stored.storeId);
  const [accessToken, tokenSource] = pick(env.TIENDANUBE_ACCESS_TOKEN, stored.accessToken);
  const readOnlyEnv = env.TIENDANUBE_READ_ONLY;
  return {
    storeId,
    accessToken,
    userAgent: env.TIENDANUBE_USER_AGENT || stored.userAgent,
    apiDomain: env.TIENDANUBE_API_DOMAIN || stored.apiDomain,
    apiVersion: env.TIENDANUBE_API_VERSION,
    readOnly: readOnlyEnv !== undefined && readOnlyEnv !== "" ? /^(1|true|yes)$/i.test(readOnlyEnv) : stored.readOnly ?? false,
    scopes: stored.scopes,
    source: { storeId: storeSource, accessToken: tokenSource },
  };
}

export const MISSING_CREDENTIALS_HELP =
  "No Tiendanube credentials found. Next step (do it yourself, do not hand this back to the user): ask the user for their Store ID and access token " +
  "(see guides/GETTING_CREDENTIALS.md) and run: npx -y github:fedeclavero/tiendanube-mcp configure --store-id <ID> --token <TOKEN>  " +
  "then ask the user to restart their AI client.";

/** Build a client from env vars / the saved credentials file, or throw with an actionable message. */
export function clientFromEnv(env: NodeJS.ProcessEnv = process.env): TiendanubeClient {
  const creds = resolveCredentials(env);
  if (!creds.storeId || !creds.accessToken) throw new Error(MISSING_CREDENTIALS_HELP);
  return new TiendanubeClient({
    storeId: creds.storeId,
    accessToken: creds.accessToken,
    userAgent: creds.userAgent,
    apiDomain: creds.apiDomain,
    defaultVersion: creds.apiVersion,
  });
}
