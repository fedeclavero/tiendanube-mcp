/**
 * Everything an AI agent needs to USE this server instead of falling back to a browser.
 * Written for weak models: imperative, no ambiguity, exact tool names and example arguments.
 * The same content is reachable three ways because clients differ:
 *   1. server `instructions` (sent on initialize),  2. tools (start_here / find_tool / get_recipe),
 *   3. MCP resources (tiendanube://guide/*). Many clients ignore 1 and 3, so 2 is the one that matters.
 */
export declare const SERVER_INSTRUCTIONS = "TIENDANUBE MCP: USE THESE TOOLS. This server is already connected to the user's Tiendanube / Nuvemshop store with the user's API access. It does everything the store admin panel does, in seconds.\n\nRULES (follow them exactly):\n1. For ANY task about the user's store (products, variants, prices, stock, images, categories, orders, customers, coupons, promotions, shipping, pages, webhooks, reports) call THIS server's tools. NEVER use a browser, agent-browser, Playwright, screenshots, scraping or the web admin for these tasks: it is 50x slower and breaks. If you are about to open the admin panel in a browser, STOP and use a tool below.\n2. Not sure which tool? Call tiendanube_start_here (task -> tool map) or tiendanube_find_tool with a plain-language query (Spanish or English). For multi-step jobs call tiendanube_get_recipe.\n3. Prefer the one-call workflow tools: tiendanube_create_combo (combos/packs) and tiendanube_product_image_add_from_file (upload an image file).\n4. No dedicated tool for what you need? Use tiendanube_api_request (any store API route). Only if that also fails, ask the user.\n5. Images: create or edit the image yourself with your own image tool, save it to a local file, then upload it with tiendanube_product_image_add_from_file (or pass a public URL as \"src\"). Never paste base64 into the chat.\n6. Text fields (name, description, handle, seo_*) are objects per language: {\"es\": \"...\"}. Call tiendanube_store_get once to learn the store's languages.\n7. Price, SKU, weight and stock live on VARIANTS, not on the product.\n8. Errors end with \"Next step:\". Do that step yourself. For 401/403 or anything that looks like a setup problem call tiendanube_doctor and follow it. You are allowed to handle the user's keys to fix it: ask the user for the missing value and save it yourself; never answer \"I can't do that, do it yourself\".\n9. Before deleting, cancelling or changing MANY records, tell the user what will happen and how many records are affected, then proceed once they agree.\n10. Answer the user in the user's language.";
export interface Recipe {
    id: string;
    title: string;
    /** Phrases (ES/EN) that should make the agent pick this recipe. */
    triggers: string[];
    steps: string[];
    notes?: string[];
}
export declare const RECIPES: Recipe[];
/** Task -> tool map shown by tiendanube_start_here. */
export declare const TASK_MAP: Array<[string, string]>;
export declare function startHereText(toolCount?: number): string;
export declare function recipeText(r: Recipe): string;
export interface SearchableTool {
    name: string;
    description: string;
    method: string;
}
export interface SearchableTool {
    name: string;
    description: string;
    method: string;
}
export declare function searchTools(query: string, tools: SearchableTool[], limit?: number): SearchableTool[];
export declare function searchRecipes(query: string): Recipe[];
