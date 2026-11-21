# Servidor MCP de Tiendanube

**¿Querés que tu IA lo instale?** Pegá este mensaje en **Claude Code** o **Codex** en tu computadora (no necesitás saber programar ni abrir una terminal):

> Instalá el MCP de Tiendanube en el cliente que estoy usando con acceso completo y verificá la conexión. https://github.com/fedeclavero/tiendanube-mcp

**Para el agente.** El usuario final normalmente no es técnico y no quiere abrir terminales ni editar archivos. Leé y ejecutá de punta a punta la [guía de instalación para agentes](guides/AGENT_INSTALL.md): pedí permiso una sola vez para pedirle y guardar sus claves, descargá el binario de GitHub Releases, guialo para activar **todos los permisos de lectura y escritura** (acceso completo, no existe modo solo lectura), ejecutá vos todos los comandos y verificá la conexión. Si GitHub muestra una versión en caché, usá la [guía en texto plano](https://raw.githubusercontent.com/fedeclavero/tiendanube-mcp/main/guides/AGENT_INSTALL.md).

[![CI](https://github.com/fedeclavero/tiendanube-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/fedeclavero/tiendanube-mcp/actions/workflows/ci.yml)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-green.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-server-blue)](https://modelcontextprotocol.io)
[![M8ven Score](https://m8ven.ai/badge/mcp/fedeclavero-tiendanube-mcp-15lqtn?v=28d7c213d8e8d5a5cf31a0c542a1a3b3)](https://m8ven.ai/mcp/fedeclavero-tiendanube-mcp-15lqtn?s=readme)

**🇬🇧 [Read in English](README.md)** · [Sitio web](https://fedeclavero.github.io/tiendanube-mcp/es/) · [Guía para agentes](guides/AGENT_INSTALL.md) · [Referencia de herramientas](guides/TOOLS.md) · [Recetas de prompts](guides/RECIPES.md)

**`tiendanube-mcp` es un servidor [MCP (Model Context Protocol)](https://modelcontextprotocol.io) gratuito y de código abierto escrito en Rust para vendedores de Tiendanube y Nuvemshop.** Conectá **Claude Code** o **Codex en la app de escritorio de ChatGPT** con tu tienda y pedile en lenguaje natural — *"¿qué productos tienen menos de 5 unidades?"*, *"subí un 12 % los precios de la categoría Verano"*, *"¿qué pedidos están pagos y sin enviar?"* — mediante **198 herramientas** que cubren **39 recursos oficiales de la API**, más flujos guiados como armar combos con imágenes locales.

> **No está afiliado a Tiendanube ni a Nuvemshop.** Es un proyecto comunitario independiente. Tiendanube y Nuvemshop son marcas de sus respectivos dueños.

---

## Instalación

No necesitás instalar Node.js, Python, Git, Rust ni el redistribuible de Visual C++. Tampoco hacen falta permisos de administrador para el MCP.

- **Windows 11:** Instalá y abrí una vez **Claude Code** o **la app de ChatGPT con Codex**. Descargá `tiendanube-mcp-windows-x86_64.zip` desde [GitHub Releases](https://github.com/fedeclavero/tiendanube-mcp/releases/latest), tocá **Extraer todo** y abrí **`Instalar.cmd`**. El asistente te guía para crear la aplicación con **todos los permisos**, guardar las credenciales en privado y conectar el cliente elegido.
- **Linux y macOS:** Descargá y extraé el binario para tu equipo desde [GitHub Releases](https://github.com/fedeclavero/tiendanube-mcp/releases/latest) en una carpeta estable (como `~/.local/bin`) y ejecutá `tiendanube-mcp onboard` (o pegá el mensaje de arriba en tu agente para que haga todo).
- **Si ya lo usabas:** Cerrá por completo tu cliente y repetí `Instalar.cmd` (Windows) o `tiendanube-mcp install --client all` (Linux/macOS). El servidor reutiliza tus credenciales existentes en `~/.config/tiendanube-mcp/credentials.json` (`%APPDATA%\tiendanube-mcp\credentials.json` en Windows) sin rotar claves y migra automáticamente instalaciones viejas de `npx`.

### Comandos manuales

```bash
# 1. Guardá tus credenciales en privado (pide el token sin mostrarlo; Brasil/Nuvemshop: agregá --region nuvemshop)
tiendanube-mcp configure --store-id 123456
# O autorizá una app del Portal de Partners con OAuth:
tiendanube-mcp login --client-id APP_ID

# 2. Registralo en Claude Code y/o Codex (conserva otros servidores, hace backup y verifica arranque MCP)
tiendanube-mcp install --client claude-code --client codex

# 3. Verificá la conexión y los permisos
tiendanube-mcp doctor
```

Después cerrá del todo y volvé a abrir tu cliente de IA y pedile que llame `tiendanube_start_here` y `tiendanube_store_get`.

### Variables de entorno (opcionales)

Con el archivo `~/.config/tiendanube-mcp/credentials.json` (`%APPDATA%\tiendanube-mcp\credentials.json` en Windows) alcanza y lo comparten ambos clientes. Las variables de entorno lo pisan si están definidas.

| Variable | Descripción |
| --- | --- |
| `TIENDANUBE_STORE_ID` | ID numérico de la tienda (`user_id` que devuelve OAuth) |
| `TIENDANUBE_ACCESS_TOKEN` | Access token de la tienda |
| `TIENDANUBE_USER_AGENT` | `NombreApp (contacto@dominio.com)`; tiene un valor por defecto razonable |
| `TIENDANUBE_API_DOMAIN` | `https://api.tiendanube.com` (por defecto, Hispanoamérica) o `https://api.nuvemshop.com.br` (Brasil) |
| `TIENDANUBE_API_VERSION` | Por defecto `2025-03` |
| `TIENDANUBE_CLIENT_ID` / `TIENDANUBE_CLIENT_SECRET` | Credenciales de app de Partner para `tiendanube-mcp login` |
| `TIENDANUBE_MCP_HOME` | Carpeta privada alternativa para credenciales y token HTTP |
| `TRANSPORT`, `HOST`, `PORT`, `ALLOWED_HOSTS`, `MCP_AUTH_TOKEN` | Modo HTTP streamable (`TRANSPORT=http` o `tiendanube-mcp serve --transport http`, solo loopback, token obligatorio) |

---

## ¿Qué podés pedirle?

| Vos decís | La IA usa |
| --- | --- |
| "Listá los productos con stock menor a 5, del más barato al más caro" | `tiendanube_products_list` |
| "Poné en 40 el stock del SKU `REM-001-M`" | `tiendanube_products_get_by_sku` → `tiendanube_variants_update_stock` |
| "Armame dos combos con productos que ya vendo, con una imagen linda para cada uno" | `tiendanube_create_combo` (+ tu herramienta de imágenes → `image_files`) |
| "Aplicá 10 % de descuento a toda la categoría 'Verano'" | `tiendanube_products_list` → `tiendanube_products_batch_stock_price` |
| "¿Qué órdenes pagas de esta semana todavía no se enviaron?" | `tiendanube_orders_list` |
| "Marcá la orden #1042 como despachada con el código de seguimiento XYZ" | `tiendanube_fulfillment_orders_update` |
| "Creá un cupón de 15 % `BIENVENIDA15` válido hasta el 31/12" | `tiendanube_coupons_create` |
| "¿Quién abandonó el carrito en los últimos 3 días? Mandales un cupón" | `tiendanube_abandoned_checkouts_list` → `tiendanube_abandoned_checkouts_apply_coupon` |
| "Suscribí mi backend a los eventos `order/paid`" | `tiendanube_webhooks_create` |

Más de 20 prompts para copiar y pegar en [guides/RECIPES.md](guides/RECIPES.md).

## Qué cubre

| Dominio | Herramientas | Incluye |
| --- | ---: | --- |
| Tienda y multimedia | 2 | Datos de la tienda, idiomas, plan, cuota multimedia |
| Catálogo | 43 | Productos, variantes, stock, imágenes, categorías, kits, listas de precios B2B |
| Órdenes y fulfillment | 31 | Órdenes, borradores, fulfillment orders + seguimiento, carritos, checkouts abandonados |
| Clientes | 5 | CRUD completo |
| Cupones y promociones | 11 | Cupones, promociones automáticas, callbacks de descuento |
| Logística | 23 | Sucursales y niveles de inventario, transportistas/opciones, reglas de negocio |
| Pagos y billing | 25 | Proveedores/opciones de pago, transacciones, disputas, facturas externas, billing de apps |
| Contenido | 15 | Páginas, blog, plantillas de email, scripts |
| Extensibilidad | 35 | Metafields, custom fields, custom objects, webhooks (36 eventos) |
| Guía y flujos | 8 | `tiendanube_start_here`, `tiendanube_find_tool`, `tiendanube_get_recipe`, `tiendanube_doctor`, `tiendanube_api_request`, `tiendanube_create_combo`, `tiendanube_product_image_add_from_file`, guía OAuth local |

Lista completa con rutas y scopes requeridos: **[guides/TOOLS.md](guides/TOOLS.md)**. También expone recursos MCP de documentación (`tiendanube://docs/*`, `tiendanube://guide/*`).

## Acceso completo y seguridad

- **Todos los permisos desde el primer momento** — Las **198 herramientas** están habilitadas con lectura y escritura completas (no existe modo solo lectura). La instalación guía para activar **todos los permisos disponibles** desde el inicio y evitar errores 403.
- **Claves siempre locales** — Las credenciales viven en un archivo privado de tu equipo (`0600` en Linux/macOS, ACL del usuario en Windows), se ingresan en privado en la terminal y nunca vuelven al chat. OAuth corre localmente mediante `tiendanube-mcp login`.
- **Transportes endurecidos** — El modo HTTP escucha solo en loopback, valida `Host` y `Origin`, exige token (`tiendanube-mcp http-token` o `MCP_AUTH_TOKEN`) y bloquea la lectura de archivos locales (`image_files` / `file_path` solo funcionan en `stdio` local).
- **Respeta rate limits y usa aritmética decimal exacta** — Sigue las cabeceras del leaky bucket, reintenta 429 solo en `GET` para no duplicar escrituras y calcula precios y pesos de combos sin errores de punto flotante.
- **Anotaciones honestas y autodiagnóstico** — Cada herramienta destructiva lo declara para que los clientes pidan confirmación, y `tiendanube-mcp doctor` muestra los permisos faltantes y el próximo paso exacto.

## Limitaciones (con honestidad)

- Algunos cuerpos complejos (promociones, transacciones, disputas, billing, custom objects, reglas de negocio) se envían como JSON libre según la referencia oficial.
- Los endpoints de proveedores de pago y transportistas están pensados para apps de partners y pueden requerir aprobación de Tiendanube.
- Los tokens de aplicaciones a medida no informan sus permisos de escritura; `doctor` prueba los de lectura e informa los de escritura faltantes cuando OAuth los reporta.

## Preguntas frecuentes

**¿Qué necesito en Windows 11?** Solo **Claude Code** o **la app de ChatGPT con Codex**, un navegador y tu cuenta de Tiendanube/Nuvemshop. El ZIP de Windows es autónomo y no requiere runtimes ni permisos de administrador.

**¿Funciona con Nuvemshop (Brasil)?** Sí. Pasá `--region nuvemshop` en `configure`/`login`, o definí `TIENDANUBE_API_DOMAIN=https://api.nuvemshop.com.br`.

**¿Qué permisos debo habilitar?** Tildá **todos** los permisos de lectura y escritura disponibles al crear la app. En Tiendanube los permisos solo aplican a tokens nuevos. Matriz en [guides/GETTING_CREDENTIALS.md](guides/GETTING_CREDENTIALS.md#scopes).

**¿Hay modo HTTP/remoto?** Sí: `tiendanube-mcp serve --transport http` (o `TRANSPORT=http`) sirve Streamable HTTP en `127.0.0.1` con token obligatorio (`tiendanube-mcp http-token` o `MCP_AUTH_TOKEN`). La subida de archivos locales queda deshabilitada por HTTP.

## Desarrollo

```bash
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked --all-targets
cargo build --locked --release
```

Las pruebas corren sin conexión contra servidores simulados y carpetas temporales, sin tocar credenciales reales. Ejecutá `tiendanube-mcp tools-doc > guides/TOOLS.md` para regenerar la referencia de herramientas. Ver [CONTRIBUTING.md](CONTRIBUTING.md) y [AGENTS.md](AGENTS.md).

## Apoyá el proyecto

Si te ahorra horas administrando precios, stock o pedidos, una ⭐ en GitHub ayuda a que otros vendedores de Tiendanube lo encuentren.

MIT © [fedeclavero](https://github.com/fedeclavero)
