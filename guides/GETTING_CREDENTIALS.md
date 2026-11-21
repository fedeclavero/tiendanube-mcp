# Getting your Tiendanube credentials / Conseguir tus credenciales

You need a **Store ID** and an **access token** (or, for Route B, an **App ID** and an **App secret**). An AI agent can guide you through all of this and place the keys for you: see [AGENT_INSTALL.md](AGENT_INSTALL.md). Jump to: [🇪🇸 Español](#es) · [🇬🇧 English](#en) · [Scopes](#scopes)

> **Always tick ALL the permissions.** Permissions (scopes) only apply to tokens issued *after* you set them; to add one later you need a new token. Ticking everything now means you never have to repeat this.

---

<a id="es"></a>

## 🇪🇸 Español

### Opción A (la más simple): aplicación a medida desde tu panel

Pensada para conectar **tu propia tienda**. No hace falta programar ni ser partner.

1. Entrá al **panel de administración** de tu tienda.
2. Andá a **Configuraciones → Aplicaciones a medida** y creá una aplicación nueva. Guía oficial: [Cómo crear una aplicación a medida y acceder al token](https://ayuda.tiendanube.com/es_ES/aplicaciones-a-medida/como-crear-una-aplicacion-a-medida-y-acceder-al-token-en-mi-tiendanube).
3. **Tildá TODOS los permisos** de la lista (lectura y escritura de todo, sin excepción).
   - *Nota para agentes de IA con navegador:* Si el usuario no comprende o no puede realizar estos pasos, usá tu herramienta de navegador para abrir el panel, crear la app y tildar activamente todos y cada uno de los permisos de lectura y escritura por él (Plug & Play total).
4. Copiá el **ID de la tienda** y el **Access token** y pasáselos a tu asistente de IA: él los guarda localmente por vos sin que tengas que abrir ninguna terminal (si instalás a mano en Windows, ingresalos en `Instalar.cmd`).

> Según la ayuda de Tiendanube, esta opción está disponible en ciertos planes. Si no ves el menú, revisá tu plan o usá la Opción B.

### Opción B: aplicación de partner con OAuth 2.0

Sirve en cualquier plan y para varias tiendas.

1. Creá una aplicación en el **Portal de Partners** de Tiendanube (`partners.tiendanube.com`). En **Datos básicos** (*Basic Data*) tildá **todos los scopes**.
2. En la configuración de URLs de la app, poné como **URL de redirección** exactamente `http://localhost:8765/callback`. (La documentación de Tiendanube no aclara si el portal acepta `localhost`; si no lo acepta, usá el plan B de abajo.) No dejes la URL por defecto: lleva a un login de partners.
3. Copiá el **App ID** y el **App secret** de la app (aparecen en los datos de la app en el portal; el App ID también es el número que va en el link de autorización).
4. Pasale el **App ID** y el **App secret** a tu asistente de IA: él corre `tiendanube-mcp login` por vos, te abre el enlace, vos aceptás todos los permisos y el token + ID de tienda se guardan solos.
5. **Plan B** (si el portal no acepta `localhost`): tu asistente te da el enlace con `login --start`, vos aceptás los permisos y le copiás la dirección completa en la que terminó el navegador para que él complete la conexión con `login --finish`.

Si después cambiás los scopes de la app, hay que **reinstalarla** en la tienda para recibir un token nuevo; tu asistente repite `login`.

### Datos que se guardan

| Dato | Variable (opcional, pisa al archivo) | Dónde sale |
| --- | --- | --- |
| ID de la tienda | `TIENDANUBE_STORE_ID` | Panel de la app a medida, o `user_id` de OAuth |
| Access token | `TIENDANUBE_ACCESS_TOKEN` | Panel de la app a medida, o respuesta de OAuth |
| Contacto | `TIENDANUBE_USER_AGENT` | Opcional: `MiTienda (yo@ejemplo.com)` |
| Región | `TIENDANUBE_API_DOMAIN` | Brasil/Nuvemshop: `https://api.nuvemshop.com.br`. Resto: no hace falta |

Se guardan una sola vez en `~/.config/tiendanube-mcp/credentials.json` (Windows: `%APPDATA%\tiendanube-mcp\credentials.json`), con permisos privados, y todas tus apps de IA comparten ese archivo.

### Cuidá tu token

- No lo subas a repositorios ni lo pegues en lugares públicos.
- Si sospechás que se filtró, **rotalo o revocalo** desde el panel (la rotación tiene una ventana de transición de hasta 2 días).

Siguiente paso: [instalar el MCP](../README.es.md).

---

<a id="en"></a>

## 🇬🇧 English

### Route A (simplest): custom app from your admin panel

Meant for connecting **your own store**. No coding or partner registration needed.

1. Open your store's **admin panel**.
2. Go to **Settings → Custom apps** (*Configuraciones → Aplicaciones a medida*) and create a new app. Official guide (Spanish): [How to create a custom app and get the token](https://ayuda.tiendanube.com/es_ES/aplicaciones-a-medida/como-crear-una-aplicacion-a-medida-y-acceder-al-token-en-mi-tiendanube).
3. **Tick ALL the permissions** in the list (read and write for everything).
4. Copy the **Store ID** and **Access token** and share them with your AI assistant: it saves them locally for you without you ever opening a terminal (if installing manually on Windows, enter them in `Instalar.cmd`).

> Per Tiendanube's help center this option is available on certain plans. If you don't see the menu, check your plan or use Route B.

### Route B: partner app with OAuth 2.0

Works on any plan and for several stores.

1. Create an app in Tiendanube's **Partner Portal** (`partners.tiendanube.com`). Under **Basic Data** tick **every scope**.
2. In the app's URL settings set the **Redirect URL** to exactly `http://localhost:8765/callback`. (Tiendanube's documentation does not say whether the portal accepts `localhost`; if it does not, use Plan B below.) Do not leave the default URL: it leads to a partner-only login.
3. Copy the app's **App ID** and **App secret** (shown in the app's details in the portal; the App ID is also the number in the authorization link).
4. Share the **App ID** and **App secret** with your AI assistant: it runs `tiendanube-mcp login` for you, opens the link, you accept all permissions, and the token + Store ID are saved automatically.
5. **Plan B** (if the portal rejects `localhost`): your assistant gives you the link via `login --start`, you accept the permissions, and paste the full address the browser ended on so your assistant finishes the setup via `login --finish`.

If you change the app's scopes later, **reinstall** the app in the store to receive a new token; your assistant repeats `login`.

### What gets saved

| Item | Variable (optional, overrides the file) | Where it comes from |
| --- | --- | --- |
| Store ID | `TIENDANUBE_STORE_ID` | Custom app screen, or OAuth `user_id` |
| Access token | `TIENDANUBE_ACCESS_TOKEN` | Custom app screen, or OAuth response |
| Contact | `TIENDANUBE_USER_AGENT` | Optional: `MyStore (me@example.com)` |
| Region | `TIENDANUBE_API_DOMAIN` | Brazil/Nuvemshop: `https://api.nuvemshop.com.br`. Elsewhere: not needed |

They are saved once in `~/.config/tiendanube-mcp/credentials.json` (Windows: `%APPDATA%\tiendanube-mcp\credentials.json`) with private permissions, and every AI app on your machine shares that file.

### Protect your token

- Never commit it or paste it in public places.
- If you think it leaked, **rotate or revoke it** from the panel (rotation has a transition window of up to 2 days).

Next step: [install the MCP](../README.md).

---

<a id="scopes"></a>

## Scopes / Permisos

**Tick all of them.** A write scope includes its read scope. Source: Tiendanube's [authentication documentation](https://tiendanube.dev/api/authentication).

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

If a tool answers **403**, its message names the missing scope and what to do. `doctor` lists every missing read permission in one pass. Payment Provider and Shipping Carrier endpoints are for partner apps and may need approval from Tiendanube.
