import { z } from "zod";
const titleOf = (name) => name
    .replace(/^tiendanube_/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
const make = (method) => (name, path, scope, description, extra = {}) => ({
    name,
    title: extra.title ?? titleOf(name),
    method,
    path,
    scope,
    description,
    ...extra,
});
export const GET = make("GET");
export const POST = make("POST");
export const PUT = make("PUT");
export const PATCH = make("PATCH");
export const DELETE = make("DELETE");
/** GET returning a paginated collection. */
export const LIST = (name, path, scope, description, extra = {}) => GET(name, path, scope, description, { list: true, ...extra });
/** GET returning a single resource (supports `fields`). */
export const ONE = (name, path, scope, description, extra = {}) => GET(name, path, scope, description, { fields: true, ...extra });
/** Free-form JSON body (object or array) for endpoints whose payload is documented only in the API reference. */
export const payload = (description, required = true) => {
    const schema = z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]).describe(description);
    return required ? schema : schema.optional();
};
//# sourceMappingURL=helpers.js.map