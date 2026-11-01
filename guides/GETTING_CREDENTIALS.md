# Getting your Tiendanube credentials / Conseguir tus credenciales

You need two things: the **Store ID** and an **access token**. Jump to: [🇪🇸 Español](#es) · [🇬🇧 English](#en) · [Scopes](#scopes)

---

<a id="es"></a>

## 🇪🇸 Español

### Opción A (la más simple): aplicación a medida desde tu panel

Pensada para conectar **tu propia tienda**. No necesitás programar ni registrarte como partner.

1. Entrá al **panel de administración** de tu tienda.
2. Andá a **Configuraciones → Aplicaciones a medida** y creá una nueva aplicación. Guía oficial: [Cómo crear una aplicación a medida y acceder al token](https://ayuda.tiendanube.com/es_ES/aplicaciones-a-medida/como-crear-una-aplicacion-a-medida-y-acceder-al-token-en-mi-tiendanube).
3. **Elegí los permisos** (scopes). Ver [qué permisos elegir](#scopes). Empezá con pocos y solo de lectura.
4. Copiá el **Access token** y el **ID de la tienda**.
5. Guardá el token en un gestor de contraseñas. **Es una credencial: da acceso a tu tienda.**

> Según la ayuda de Tiendanube, esta opción está disponible en ciertos planes (por ejemplo Escala o Evolución/Next). Si no ves el menú, revisá tu plan o usá la Opción B.

### Opción B: app de partner con OAuth 2.0

Para integraciones que instalan muchas tiendas, o si no tenés "Aplicaciones a medida".

1. Creá una aplicación en el **Portal de Partners** de Tiendanube y definí sus scopes.
2. El comerciante autoriza la app y Tiendanube redirige a tu URL con `?code=...`.
3. Cambiá ese `code` por el token con la herramienta `tiendanube_oauth_exchange_code` (necesita `client_id` y `client_secret` de tu app; el `code` es de un solo uso y vence rápido). La respuesta trae `access_token`, `scope` y `user_id` — **ese `user_id` es el ID de la tienda**.

### Datos que vas a necesitar

| Dato | Variable | Dónde sale |
| --- | --- | --- |
| ID de la tienda | `TIENDANUBE_STORE_ID` | Panel de la app a medida, o `user_id` de OAuth |
| Access token | `TIENDANUBE_ACCESS_TOKEN` | Panel de la app a medida, o respuesta de OAuth |
| Contacto | `TIENDANUBE_USER_AGENT` | Lo definís vos: `MiTienda (yo@ejemplo.com)` |
| Región | `TIENDANUBE_API_DOMAIN` | Brasil/Nuvemshop: `https://api.nuvemshop.com.br`. Resto: no hace falta |

### Cuidá tu token

- No lo pegues en repositorios, capturas ni chats públicos.
- Si sospechás que se filtró, **rotalo o revocalo** desde el panel (hay una ventana de transición de hasta 2 días para rotar sin cortar el servicio).
- Usá el mínimo de permisos y el modo `TIENDANUBE_READ_ONLY=true` hasta que quieras escribir.

Siguiente paso: [instalar el MCP](../README.es.md#inicio-rápido-unos-5-minutos-3-pasos).

---

<a id="en"></a>

## 🇬🇧 English

### Option A (simplest): custom app from your admin panel

Meant for connecting **your own store**. No coding or partner registration needed.

1. Open your store's **admin panel**.
2. Go to **Settings → Custom apps** (*Configuraciones → Aplicaciones a medida*) and create a new app. Official guide (Spanish): [How to create a custom app and get the token](https://ayuda.tiendanube.com/es_ES/aplicaciones-a-medida/como-crear-una-aplicacion-a-medida-y-acceder-al-token-en-mi-tiendanube).
3. **Pick the permissions** (scopes) — see [which scopes to choose](#scopes). Start small and read-only.
4. Copy the **Access token** and the **Store ID**.
5. Keep the token in a password manager. **It's a credential that grants access to your store.**

> Per Tiendanube's help center, this option is available on certain plans (e.g. Escala / Evolución-Next). If you don't see the menu, check your plan or use Option B.

### Option B: partner app with OAuth 2.0

For integrations installed by many stores, or if custom apps aren't available to you.

1. Create an app in Tiendanube's **Partner Portal** and define its scopes.
2. The merchant authorizes the app and Tiendanube redirects to your URL with `?code=...`.
3. Exchange the `code` with the `tiendanube_oauth_exchange_code` tool (needs your app's `client_id` and `client_secret`; the code is single-use and short-lived). The response has `access_token`, `scope` and `user_id` — **`user_id` is the Store ID**.

### What you'll need

| Item | Variable | Where it comes from |
| --- | --- | --- |
| Store ID | `TIENDANUBE_STORE_ID` | Custom app screen, or OAuth `user_id` |
| Access token | `TIENDANUBE_ACCESS_TOKEN` | Custom app screen, or OAuth response |
| Contact | `TIENDANUBE_USER_AGENT` | You choose: `MyStore (me@example.com)` |
| Region | `TIENDANUBE_API_DOMAIN` | Brazil/Nuvemshop: `https://api.nuvemshop.com.br`. Elsewhere: not needed |

### Protect your token

- Never paste it into repositories, screenshots or public chats.
- If you think it leaked, **rotate or revoke it** from the panel (rotation has a transition window of up to 2 days).
- Use the fewest scopes possible and keep `TIENDANUBE_READ_ONLY=true` until you want to write.

Next step: [install the MCP](../README.md#quick-start-about-5-minutes-3-steps).

---

<a id="scopes"></a>

## Scopes / Permisos: what to choose / qué elegir

**Presets / Combinaciones sugeridas**

| Goal / Objetivo | Scopes |
| --- | --- |
| 🔍 Read-only analysis / Análisis solo lectura | `read_products`, `read_orders`, `read_customers`, `read_coupons`, `read_fulfillment_orders` |
| 📦 Stock & price manager / Gestor de stock y precios | `read_products`, `write_products` |
| 🚚 Fulfillment assistant / Asistente de despachos | `read_orders`, `read_fulfillment_orders`, `write_fulfillment_orders` |
| 🎟️ Marketing (coupons, abandoned carts) / Marketing | `read_coupons`, `write_coupons`, `read_orders`, `write_orders` (abandoned checkouts live under orders) |
| 🧩 Full store admin / Administración completa | all `read_*`/`write_*` for the resources you use |

If a tool answers **403**, its message names the missing scope — add it in your app and try again. / Si una herramienta responde **403**, el mensaje indica el scope que falta.

**Full matrix / Matriz completa** (18 families):

| Family | Read | Write | Resources |
| --- | --- | --- | --- |
| Store (implicit) | any token | — | Store, Webhooks, `GET /scripts` |
| Content | `read_content` | `write_content` | Pages, Blog, page metafields |
| Products & catalog | `read_products` | `write_products` | Products, variants, images, categories, kits, price tables, product/category custom fields & metafields, store media, custom objects |
| Customers | `read_customers` | `write_customers` | Customers, customer metafields/custom fields |
| Orders & sales | `read_orders` | `write_orders` | Orders, carts, abandoned checkouts, order custom fields, external invoices |
| Fulfillment orders | `read_fulfillment_orders` | `write_fulfillment_orders` | Fulfillment orders + tracking events |
| Draft orders | `read_draft_orders` | `write_draft_orders` | Draft orders |
| Locations | `read_locations` | `write_locations` | Locations, inventory levels, location business rules |
| Shipping | `read_shipping` | `write_shipping` | Shipping carriers, options, legacy fulfillments, shipping business rules |
| Shipping quotation | `read_shipping_quotation` | `write_shipping_quotation` | Live rate quotation |
| Coupons | `read_coupons` | `write_coupons` | Coupons |
| Discounts | `read_discounts` | `write_discounts` | Promotions, discount callbacks |
| Payments | `read_payments` | `write_payments` | Payment providers, transactions, disputes |
| Payment options | `read_payment_options` | — | Payment options, payments business rules |
| Scripts | — | `write_scripts` | `POST/PUT/DELETE /scripts` |
| Email templates | `read_email_templates` | `write_email_templates` | Email templates |
| App subscriptions | `read_subscriptions` | `write_subscriptions` | Billing subscriptions |
| Charges & plans | — | `write_charges`, `write_plans` | Billing charges / plans |

Source: Tiendanube's [authentication documentation](https://tiendanube.dev/api/authentication). Payment Provider and Shipping Carrier endpoints are for partner apps and may need approval from Tiendanube.
