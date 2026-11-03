import { TiendanubeApiError } from "./client.js";
function describePayload(payload) {
    if (payload === undefined || payload === null)
        return "";
    if (typeof payload === "string")
        return payload;
    try {
        return JSON.stringify(payload);
    }
    catch {
        return String(payload);
    }
}
/** Translate any thrown value into an actionable message for the LLM. */
export function formatError(error, ctx = {}) {
    if (error instanceof TiendanubeApiError) {
        const detail = describePayload(error.payload);
        const where = `${error.method} ${error.path}`;
        let hint;
        let next;
        switch (error.status) {
            case 400:
                hint =
                    "Bad request. Check the parameters/body format. Tiendanube also answers 400 when the User-Agent header is missing (set TIENDANUBE_USER_AGENT to 'AppName (contact@domain.com)').";
                next = "re-read the tool's example arguments and fix the parameters; if every call fails with 400, run: npx -y github:fedeclavero/tiendanube-mcp configure --user-agent \"MyStore (owner@email.com)\" and ask the user to restart the client.";
                break;
            case 401:
                hint =
                    "Unauthorized. The access token is invalid, was rotated, or the app was uninstalled. Verify TIENDANUBE_ACCESS_TOKEN and TIENDANUBE_STORE_ID.";
                next = "call tiendanube_doctor. Then get a valid token yourself: ask the user for it (guides/GETTING_CREDENTIALS.md) and save it with: npx -y github:fedeclavero/tiendanube-mcp configure --store-id <ID> --token <TOKEN>. Finally ask the user to restart the AI client. Do not tell the user to do this alone.";
                break;
            case 402:
                hint = "Payment required. The store has an unpaid Tiendanube plan, so API access is suspended.";
                next = "tell the user their Tiendanube plan must be paid in the admin panel; API access resumes right after. Nothing to fix in this MCP.";
                break;
            case 403:
                hint = `Forbidden. The token is missing an OAuth scope${ctx.scope ? ` — this tool requires: ${ctx.scope}` : ""}. Re-authorize the app (or edit the custom app permissions) to include it.`;
                next = `the token lacks ${ctx.scope ?? "a scope"}. Fix it yourself: (1) have the user open the app settings and tick ALL permissions (Partner Portal > the app > Basic Data, or Settings > Custom apps in the store admin), (2) re-authorize so a NEW token is issued, because scopes only apply to new tokens: npx -y github:fedeclavero/tiendanube-mcp login --client-id <APP_ID> --client-secret <SECRET> (custom app: copy the new token and run configure --token), (3) ask the user to restart the AI client. Call tiendanube_doctor to see all missing scopes at once.`;
                break;
            case 404:
                hint = `Not found. Check that the ID(s) exist in this store${ctx.version === "unstable" ? " and that the resource is available in the 'unstable' API" : ""}. List endpoints also answer 404 when the requested page is past the last page.`;
                next = "find the right ID with the matching *_list tool (or tiendanube_find_tool) and retry with it.";
                break;
            case 409:
                hint = "Conflict. The resource is in a state that does not allow this operation (e.g. duplicate handle/SKU/key).";
                next = "change the duplicated value (handle, SKU or key) or update the existing record instead of creating a new one.";
                break;
            case 422:
                hint = "Unprocessable entity. One or more fields are invalid; see the field details in the response and fix them.";
                next = "fix the fields named in the API response and retry. Text fields must be language objects like {\"es\": \"...\"}; use tiendanube_get_recipe if unsure about the body.";
                break;
            case 429:
                hint = "Rate limit exceeded even after automatic retries (leaky bucket: 40 burst, 2 req/s). Wait a few seconds and retry; prefer bulk endpoints.";
                next = "wait 5-10 seconds and retry; group changes with tiendanube_products_batch_stock_price (max 50 variants per call).";
                break;
            default:
                hint = error.status >= 500 ? "Tiendanube server error. Retry later." : "Request failed.";
                next = error.status >= 500 ? "retry in a minute; if it keeps failing tell the user Tiendanube is having problems." : "call tiendanube_doctor and read the API response above.";
        }
        return `Error ${error.status} on ${where}: ${hint}${detail ? `\nAPI response: ${detail}` : ""}\nNext step: ${next}`;
    }
    if (error instanceof Error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") {
            return "Error: request to Tiendanube timed out.\nNext step: retry once; if it repeats, narrow the query with filters, a smaller per_page or the fields parameter.";
        }
        const cause = error.cause;
        if (cause?.code)
            return `Error: network failure (${cause.code}) contacting Tiendanube: ${error.message}\nNext step: check the internet connection (and TIENDANUBE_API_DOMAIN: Brazil stores need https://api.nuvemshop.com.br), then call tiendanube_doctor.`;
        return `Error: ${error.message}`;
    }
    return `Error: ${String(error)}`;
}
//# sourceMappingURL=errors.js.map