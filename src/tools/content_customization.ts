import { bool, i18n, id, obj, str } from "../schemas/common.js";
import { DELETE, LIST, ONE, POST, PUT } from "./helpers.js";
import { ToolModule } from "./registry.js";

const CR = "read_content";
const CW = "write_content";

const pageBody = (required: boolean) => ({
  publish: bool("Whether the page is published").optional(),
  i18n: required
    ? obj("Per-language content: {es: {title, content (HTML), seo_handle, seo_title, seo_description}, pt: {...}}")
    : obj("Per-language content: {es: {title, content (HTML), seo_handle, seo_title, seo_description}}").optional(),
});

export const contentModule: ToolModule = {
  name: "content_customization",
  tools: [
    // ---- Pages
    LIST("tiendanube_pages_list", "/pages", CR, "List store pages (about, FAQ, policies...)."),
    ONE("tiendanube_pages_get", "/pages/{pageID}", CR, "Get one page.", { pathParams: { pageID: id("Page ID") } }),
    POST("tiendanube_pages_create", "/pages", CW, "Create a page.", { body: pageBody(true) }),
    PUT("tiendanube_pages_update", "/pages/{pageID}", CW, "Update a page.", { pathParams: { pageID: id("Page ID") }, body: pageBody(false) }),
    DELETE("tiendanube_pages_delete", "/pages/{pageID}", CW, "Delete a page.", { pathParams: { pageID: id("Page ID") } }),

    // ---- Blog
    LIST("tiendanube_blogs_list", "/blogs", CR, "List blogs of the store."),
    LIST("tiendanube_blog_posts_list", "/blogs/{blog_id}/posts", CR, "List posts of a blog.", { pathParams: { blog_id: id("Blog ID") } }),

    // ---- Email templates
    LIST("tiendanube_email_templates_list", "/email-templates", "read_email_templates", "List transactional email templates."),
    ONE("tiendanube_email_templates_get", "/email-templates/{templateID}", "read_email_templates", "Get one email template.", {
      pathParams: { templateID: id("Template ID") },
    }),
    PUT("tiendanube_email_templates_update", "/email-templates/{templateID}", "write_email_templates", "Update an email template's subject and HTML.", {
      pathParams: { templateID: id("Template ID") },
      body: { subject: i18n("Email subject").optional(), template_html: i18n("Email HTML body").optional() },
    }),

    // ---- Scripts (created first in the Partner Portal, then linked to a store here)
    LIST("tiendanube_scripts_list", "/scripts", "none (any valid token)", "List scripts associated with the store."),
    ONE("tiendanube_scripts_get", "/scripts/{id}", "none (any valid token)", "Get a script association.", { pathParams: { id: id("Store script ID") } }),
    POST("tiendanube_scripts_create", "/scripts", "write_scripts", "Associate a Partner Portal script with the store.", {
      body: {
        script_id: id("Script ID from the Partner Portal"),
        query_params: str("Stringified JSON with dynamic parameters for the script").optional(),
      },
    }),
    PUT("tiendanube_scripts_update", "/scripts/{id}", "write_scripts", "Update a store's script association/parameters.", {
      pathParams: { id: id("Store script ID") },
      body: { script_id: id("Script ID from the Partner Portal").optional(), query_params: str("Stringified JSON parameters").optional() },
    }),
    DELETE("tiendanube_scripts_delete", "/scripts/{id}", "write_scripts", "Remove a script from the store.", { pathParams: { id: id("Store script ID") } }),
  ],
};
