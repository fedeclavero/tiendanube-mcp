export type Region = "tiendanube" | "nuvemshop";
export declare const authorizeUrl: (appId: string, region: Region, state?: string) => string;
export declare const apiDomainOf: (region: Region) => "https://api.nuvemshop.com.br" | "https://api.tiendanube.com";
/** Accepts a bare code or the full redirect URL the browser landed on (".../callback?code=abc&state=..."). */
export declare function codeFromInput(input: string): {
    code: string;
    state?: string;
};
export interface TokenResult {
    accessToken: string;
    storeId: string;
    scopes: string[];
}
/** Swap the single-use authorization code (valid ~5 minutes) for the permanent access token. */
export declare function exchangeCode(opts: {
    clientId: string;
    clientSecret: string;
    code: string;
    region: Region;
    userAgent?: string;
}): Promise<TokenResult>;
export declare function openBrowser(url: string): void;
export interface CallbackWait {
    redirectUrl: string;
    /** Resolves with the code once the browser comes back; rejects on timeout. */
    result: Promise<{
        code: string;
    }>;
    close: () => void;
}
/** Local one-shot server that receives `?code=` on http://localhost:<port>/callback. */
export declare function waitForCallback(port: number, state: string, timeoutMs: number): Promise<CallbackWait>;
export declare const newState: () => string;
