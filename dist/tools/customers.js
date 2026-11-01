import { bool, id, num, obj, objArray, str, timeFilters } from "../schemas/common.js";
import { DELETE, LIST, ONE, POST, PUT } from "./helpers.js";
const R = "read_customers";
const W = "write_customers";
const customerBody = (requireName) => ({
    name: requireName ? str("Full name") : str("Full name").optional(),
    email: requireName ? str("Email") : str("Email").optional(),
    phone: str("Phone").optional(),
    identification: str("Tax/ID document (DNI/CUIT/CPF)").optional(),
    note: str("Private note").optional(),
    addresses: objArray("Addresses: [{address, number, floor, locality, zipcode, city, province, country, default}]").optional(),
    send_email_invite: bool("Send an account invitation email").optional(),
    password: str("Initial password").optional(),
    extra: obj("Additional customer data").optional(),
});
export const customersModule = {
    name: "customers",
    tools: [
        LIST("tiendanube_customers_list", "/customers", R, "List customers.", {
            query: {
                ...timeFilters,
                q: str("Search by name, email or document").optional(),
                email: str("Exact email").optional(),
                total_spent_min: num("Minimum total spent").optional(),
                accepts_marketing: bool("Filter by marketing consent").optional(),
            },
        }),
        ONE("tiendanube_customers_get", "/customers/{id}", R, "Get one customer.", { pathParams: { id: id("Customer ID") } }),
        POST("tiendanube_customers_create", "/customers", W, "Create a customer.", { body: customerBody(true) }),
        PUT("tiendanube_customers_update", "/customers/{id}", W, "Update a customer.", {
            pathParams: { id: id("Customer ID") },
            body: customerBody(false),
        }),
        DELETE("tiendanube_customers_delete", "/customers/{id}", W, "Delete a customer. Only possible if the customer has no orders.", {
            pathParams: { id: id("Customer ID") },
        }),
    ],
};
//# sourceMappingURL=customers.js.map