import { ONE } from "./helpers.js";
export const storeModule = {
    name: "store",
    tools: [
        ONE("tiendanube_store_get", "/store", "any valid token", "Get store metadata: name, description, domains, active languages, main_currency, country, plan_name, address and social links. Use it first to learn which languages (i18n keys) the store uses."),
        ONE("tiendanube_store_media_quotas_get", "/store/media/quotas", "read_products", "Get current usage and limit of the store's media storage (unstable API).", { version: "unstable" }),
    ],
};
//# sourceMappingURL=store.js.map