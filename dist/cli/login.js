import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { BRAZIL_API_DOMAIN, DEFAULT_API_DOMAIN, REQUEST_TIMEOUT_MS, TOKEN_URLS } from "../constants.js";
export const authorizeUrl = (appId, region, state) => `https://www.${region === "nuvemshop" ? "nuvemshop.com.br" : "tiendanube.com"}/apps/${encodeURIComponent(appId)}/authorize${state ? `?state=${state}` : ""}`;
export const apiDomainOf = (region) => (region === "nuvemshop" ? BRAZIL_API_DOMAIN : DEFAULT_API_DOMAIN);
/** Accepts a bare code or the full redirect URL the browser landed on (".../callback?code=abc&state=..."). */
export function codeFromInput(input) {
    const text = input.trim();
    try {
        const url = new URL(text);
        const code = url.searchParams.get("code");
        if (code)
            return { code, state: url.searchParams.get("state") ?? undefined };
    }
    catch {
        /* not a URL: treat as a bare code */
    }
    const match = text.match(/[?&]code=([^&\s]+)/);
    return { code: match ? decodeURIComponent(match[1]) : text };
}
/** Swap the single-use authorization code (valid ~5 minutes) for the permanent access token. */
export async function exchangeCode(opts) {
    const res = await fetch(TOKEN_URLS[opts.region], {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": opts.userAgent || "TiendanubeMCPServer/1.0 (dev@example.com)" },
        body: JSON.stringify({ client_id: opts.clientId, client_secret: opts.clientSecret, grant_type: "authorization_code", code: opts.code }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    let data = {};
    try {
        data = JSON.parse(text);
    }
    catch {
        /* keep empty */
    }
    if (!res.ok || !data.access_token) {
        throw new Error(`Token exchange failed (HTTP ${res.status}): ${text.slice(0, 300)}\nNext step: the code is single-use and expires in about 5 minutes. Run the login again to get a fresh one, and double-check the app id (client_id) and client secret.`);
    }
    const storeId = data.user_id ?? data.store_id;
    if (storeId === undefined)
        throw new Error("The token response has no user_id/store_id.\nNext step: run the login again; if it repeats, copy the Store ID from the app screen and run configure.");
    return {
        accessToken: String(data.access_token),
        storeId: String(storeId),
        scopes: typeof data.scope === "string" ? data.scope.split(/[,\s]+/).filter(Boolean) : [],
    };
}
export function openBrowser(url) {
    try {
        const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]] : ["xdg-open", [url]];
        const child = spawn(cmd, args, { stdio: "ignore", detached: true });
        child.on("error", () => undefined);
        child.unref();
    }
    catch {
        /* the URL is also printed, the user can open it manually */
    }
}
const PAGE = (ok, message) => `<!doctype html><meta charset="utf-8"><title>Tiendanube MCP</title><body style="font-family:system-ui;max-width:32rem;margin:15vh auto;padding:0 1rem;line-height:1.5"><h1>${ok ? "Listo / Done" : "Error"}</h1><p>${message}</p>`;
/** Local one-shot server that receives `?code=` on http://localhost:<port>/callback. */
export function waitForCallback(port, state, timeoutMs) {
    return new Promise((resolveStart, rejectStart) => {
        let finish;
        let fail;
        const result = new Promise((res, rej) => {
            finish = res;
            fail = rej;
        });
        result.catch(() => undefined);
        const server = createServer((req, res) => {
            const url = new URL(req.url ?? "/", `http://localhost:${port}`);
            if (url.pathname !== "/callback") {
                res.writeHead(404).end();
                return;
            }
            const code = url.searchParams.get("code");
            const returnedState = url.searchParams.get("state");
            if (!code) {
                res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" }).end(PAGE(false, "No authorization code in the URL. Start the login again."));
                return;
            }
            if (returnedState && returnedState !== state) {
                res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" }).end(PAGE(false, "The state value does not match. Start the login again."));
                fail(new Error("State mismatch on the OAuth callback (possible forged request). Start the login again."));
                return;
            }
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(PAGE(true, "Tiendanube authorized the app. You can close this window and go back to your AI assistant."));
            finish({ code });
        });
        const timer = setTimeout(() => fail(new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s waiting for the authorization.\nNext step: run the login again, or paste the redirect URL with --redirect-url.`)), timeoutMs);
        server.once("error", (e) => {
            clearTimeout(timer);
            rejectStart(new Error(e.code === "EADDRINUSE" ? `Port ${port} is busy.\nNext step: run again with --port <another port> and register that redirect URL in the app.` : e.message));
        });
        server.listen(port, "127.0.0.1", () => resolveStart({
            redirectUrl: `http://localhost:${port}/callback`,
            result,
            close: () => {
                clearTimeout(timer);
                server.close();
                server.closeAllConnections?.();
            },
        }));
    });
}
export const newState = () => randomBytes(12).toString("hex");
//# sourceMappingURL=login.js.map