/** Hand-written tools (not generated from endpoint definitions). Single source of truth for counts and search. */
export interface CustomToolMeta {
  name: string;
  /** Registered only when the server is not read-only. */
  writeOnly: boolean;
  summary: string;
}

export const CUSTOM_TOOLS: CustomToolMeta[] = [
  { name: "tiendanube_start_here", writeOnly: false, summary: "CALL THIS FIRST. Map of tasks to tools, golden rules and recipes for this store." },
  { name: "tiendanube_find_tool", writeOnly: false, summary: "Describe what you want to do in plain language (Spanish or English) and get the matching tools and recipes." },
  { name: "tiendanube_get_recipe", writeOnly: false, summary: "Step-by-step recipe (exact tool names and arguments) for a common job such as combos, price changes or stock." },
  { name: "tiendanube_doctor", writeOnly: false, summary: "Diagnose credentials, connection and missing permissions, with the exact next steps to fix them." },
  { name: "tiendanube_api_request", writeOnly: false, summary: "Call any Tiendanube API route that has no dedicated tool (last resort before asking the user)." },
  { name: "tiendanube_create_combo", writeOnly: true, summary: "Create a combo/pack product from products already in the store, with price, stock and images (generated files supported)." },
  { name: "tiendanube_product_image_add_from_file", writeOnly: true, summary: "Upload an image file from this computer (e.g. one you generated) to a product." },
];

export const customToolCount = (readOnly: boolean): number => CUSTOM_TOOLS.filter((t) => !readOnly || !t.writeOnly).length;
