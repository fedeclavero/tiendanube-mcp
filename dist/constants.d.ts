export declare const DEFAULT_API_DOMAIN = "https://api.tiendanube.com";
export declare const BRAZIL_API_DOMAIN = "https://api.nuvemshop.com.br";
export declare const DEFAULT_API_VERSION = "2025-03";
export declare const DEFAULT_USER_AGENT = "TiendanubeMCPServer/1.0 (dev@example.com)";
export declare const CHARACTER_LIMIT = 25000;
export declare const REQUEST_TIMEOUT_MS = 30000;
export declare const MAX_RATE_LIMIT_RETRIES = 3;
export declare const DEFAULT_PER_PAGE = 30;
export declare const MAX_PER_PAGE = 200;
export declare const TOKEN_URLS: {
    readonly tiendanube: "https://www.tiendanube.com/apps/authorize/token";
    readonly nuvemshop: "https://www.nuvemshop.com.br/apps/authorize/token";
};
export type ApiVersion = "2025-03" | "v1" | "unstable";
