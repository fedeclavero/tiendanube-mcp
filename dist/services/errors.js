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
        switch (error.status) {
            case 400:
                hint =
                    "Bad request. Check the parameters/body format. Tiendanube also answers 400 when the User-Agent header is missing (set TIENDANUBE_USER_AGENT to 'AppName (contact@domain.com)').";
                break;
            case 401:
                hint =
                    "Unauthorized. The access token is invalid, was rotated, or the app was uninstalled. Verify TIENDANUBE_ACCESS_TOKEN and TIENDANUBE_STORE_ID.";
                break;
            case 402:
                hint = "Payment required. The store has an unpaid Tiendanube plan, so API access is suspended.";
                break;
            case 403:
                hint = `Forbidden. The token is missing an OAuth scope${ctx.scope ? ` — this tool requires: ${ctx.scope}` : ""}. Re-authorize the app (or edit the custom app permissions) to include it.`;
                break;
            case 404:
                hint = `Not found. Check that the ID(s) exist in this store${ctx.version === "unstable" ? " and that the resource is available in the 'unstable' API" : ""}. List endpoints also answer 404 when the requested page is past the last page.`;
                break;
            case 409:
                hint = "Conflict. The resource is in a state that does not allow this operation (e.g. duplicate handle/SKU/key).";
                break;
            case 422:
                hint = "Unprocessable entity. One or more fields are invalid; see the field details in the response and fix them.";
                break;
            case 429:
                hint = "Rate limit exceeded even after automatic retries (leaky bucket: 40 burst, 2 req/s). Wait a few seconds and retry; prefer bulk endpoints.";
                break;
            default:
                hint = error.status >= 500 ? "Tiendanube server error. Retry later." : "Request failed.";
        }
        return `Error ${error.status} on ${where}: ${hint}${detail ? `\nAPI response: ${detail}` : ""}`;
    }
    if (error instanceof Error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") {
            return "Error: request to Tiendanube timed out. Retry, or narrow the query with filters/fields.";
        }
        const cause = error.cause;
        if (cause?.code)
            return `Error: network failure (${cause.code}) contacting Tiendanube: ${error.message}`;
        return `Error: ${error.message}`;
    }
    return `Error: ${String(error)}`;
}
//# sourceMappingURL=errors.js.map