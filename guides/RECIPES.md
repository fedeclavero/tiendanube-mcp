# Prompt recipes / Recetas de prompts

Copy, paste, adapt. Each recipe says which tools the AI will reach for. **Writes** are marked ✍️ — for big changes ask the AI to *show you the plan and wait for your OK* before it changes anything. The AI can also read these step by step with the `tiendanube_get_recipe` tool.

Copiá, pegá y adaptá. Cada receta indica qué herramientas va a usar la IA. Las **escrituras** están marcadas con ✍️: para cambios grandes pedile a la IA que *te muestre el plan y espere tu OK* antes de cambiar nada. La IA también puede leer estas recetas paso a paso con la herramienta `tiendanube_get_recipe`.

## Know your store / Conocé tu tienda

1. **"Show me my store's name, plan, languages and currency."** / *"Mostrame nombre, plan, idiomas y moneda de mi tienda."* → `tiendanube_store_get`
2. **"Give me a catalog health check: products without images, without SKU, without weight, or unpublished."** / *"Hacé un chequeo de salud del catálogo: productos sin imágenes, sin SKU, sin peso o sin publicar."* → `tiendanube_products_list` (`has_skus`, `has_weight`, `published`)
3. **"How many images and how much media storage am I using?"** → `tiendanube_store_media_quotas_get`

## Stock & catalog / Stock y catálogo

4. **"List products with stock below 5, sorted by lowest stock."** / *"Listá productos con stock menor a 5, ordenados de menor a mayor."* → `tiendanube_products_list` (`max_stock`)
5. ✍️ **"Set the stock of SKU `REM-001-M` to 40."** / *"Poné en 40 el stock del SKU `REM-001-M`."* → `tiendanube_products_get_by_sku`, `tiendanube_variants_update_stock`
6. ✍️ **"Add 20 units to every variant of product 123."** → `tiendanube_variants_update_stock` (`action: variation`)
7. ✍️ **"Raise prices 12% in category 'Verano'. Show me a before/after table first."** / *"Subí 12 % los precios de la categoría 'Verano'. Mostrame antes una tabla antes/después."* → `tiendanube_categories_list`, `tiendanube_products_list`, `tiendanube_products_batch_stock_price`
8. ✍️ **"Create the product 'Remera Básica' in sizes S, M, L with price 15000 and stock 10 each."** → `tiendanube_products_create`
9. ✍️ **"Create the category tree Ropa › Remeras and move these 5 products into it."** → `tiendanube_categories_create`, `tiendanube_products_update`
10. **"Export all products and their variants as a CSV-style table."** → `tiendanube_products_list` (paginate with `page`)

## Orders & fulfillment / Órdenes y despachos

11. **"Which orders are paid but not shipped? Oldest first."** / *"¿Qué órdenes están pagas y sin enviar? Las más viejas primero."* → `tiendanube_orders_list` (`financial_status: paid`, `shipping_status: unpacked`)
12. **"Summarize last week's sales: orders, revenue, average ticket, top 5 products."** → `tiendanube_orders_list` (`created_at_min/max`)
13. ✍️ **"Mark order 1042's fulfillment as DISPATCHED with tracking code ABC123 and notify the customer."** → `tiendanube_fulfillment_orders_list`, `tiendanube_fulfillment_orders_update`
14. ✍️ **"Cancel order 1050 because of inventory, restock the items, notify the buyer."** → `tiendanube_orders_cancel`
15. **"Show me the edit history of order 1042."** → `tiendanube_orders_history_editions_get`, `tiendanube_orders_history_values_get`
16. ✍️ **"Create a draft order for ana@example.com with 2 units of variant 987 and give me the checkout link."** → `tiendanube_draft_orders_create`

## Customers & marketing / Clientes y marketing

17. **"Who are my top 10 customers by total spent?"** → `tiendanube_customers_list`
18. ✍️ **"Create coupon `BIENVENIDA15`: 15% off, one use per customer, valid until Dec 31."** → `tiendanube_coupons_create`
19. **"List abandoned checkouts from the last 3 days with the cart contents."** → `tiendanube_abandoned_checkouts_list`
20. ✍️ **"Attach coupon 77 to the abandoned checkouts from the last 3 days."** → `tiendanube_abandoned_checkouts_apply_coupon`
21. **"Which coupons expire this month?"** → `tiendanube_coupons_list` (`min_end_date`, `max_end_date`)

## Content & integrations / Contenido e integraciones

22. ✍️ **"Create an 'About us' page in Spanish and English with this text: …"** → `tiendanube_pages_create`
23. ✍️ **"Register a webhook for `order/paid` pointing to https://my-api.example.com/hooks."** → `tiendanube_webhooks_create`
24. **"List all my webhooks and tell me which ones point to a domain I don't recognize."** → `tiendanube_webhooks_list`
25. ✍️ **"Add the metafield `erp.id` = ABC on product 123."** → `tiendanube_metafields_create`

## Combos & images / Combos e imágenes

26. ✍️ **"Make two combos with products I already sell, with a nice image for each."** / *"Armame dos combos con productos que ya vendo, con una imagen linda para cada uno."* → `tiendanube_products_list`, your AI's own image tool, `tiendanube_create_combo` (`image_files`). Combos are created as **drafts**; the AI asks before publishing.
27. ✍️ **"Create a 'Verano' combo with product 111 and two units of product 222, 10% off."** → `tiendanube_create_combo` (`discount_percent: 10`)
28. ✍️ **"Upload this picture as the main image of product 123: /path/to/photo.png."** → `tiendanube_product_image_add_from_file`

> The Tiendanube API can only *read* native Kits, and a regular combo product does not deduct the components' stock when it sells. The tool sets the combo stock to the scarcest component and warns about this; create a native Kit in the admin panel if you need automatic deduction.

## Pro tips / Consejos

- *"Do a **dry run**: list what you would change and wait for my confirmation."* → *"Hacé una **simulación**: listá qué cambiarías y esperá mi confirmación."*
- Ask for **small batches** first (e.g. 5 products), check the result, then run the rest.
- Mention the **language** you want for names/descriptions; the AI will use the store's language keys.
- Large histories: ask the AI to **slice by date ranges** (orders are capped at 10 000 per query).
