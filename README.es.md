# Servidor MCP de Tiendanube — administrá tu tienda Tiendanube / Nuvemshop con Claude, Codex, OpenCode y cualquier agente de IA

[![CI](https://github.com/fedeclavero/tiendanube-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/fedeclavero/tiendanube-mcp/actions/workflows/ci.yml)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-green.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-server-blue)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](https://nodejs.org)
[![M8ven Score](https://m8ven.ai/badge/mcp/fedeclavero-tiendanube-mcp-15lqtn?v=28d7c213d8e8d5a5cf31a0c542a1a3b3)](https://m8ven.ai/mcp/fedeclavero-tiendanube-mcp-15lqtn?s=readme)

**🇬🇧 [Read in English](README.md)** · [Sitio web](https://fedeclavero.github.io/tiendanube-mcp/es/) · [Referencia de herramientas](guides/TOOLS.md) · [Recetas de prompts](guides/RECIPES.md)

**`tiendanube-mcp` es un servidor [MCP (Model Context Protocol)](https://modelcontextprotocol.io) gratuito y de código abierto que conecta asistentes de IA con la API de Tiendanube (Nuvemshop en Brasil).** Pedile en lenguaje natural — *"¿qué productos tienen menos de 5 unidades?"*, *"subí un 12 % los precios de la categoría Verano"*, *"¿qué pedidos están pagos y sin enviar?"* — y tu IA lo resuelve con **198 herramientas** que cubren **39 recursos de la API**: productos, variantes, stock, órdenes, clientes, cupones, envíos, pagos, webhooks y más, además de flujos guiados como armar combos con imágenes.

Funciona con **Claude Code, Claude Desktop, OpenAI Codex, Gemini CLI, Cursor, Google Antigravity, VS Code (Copilot), OpenCode, Windsurf, Cline** y cualquier cliente compatible con MCP por stdio o HTTP. **Un agente de IA lo puede instalar y configurar solo**, aunque nunca hayas tocado una clave de API.

> **Agentes de IA, lean esto primero.** Si te pidieron instalar este servidor, hacé todo el proceso vos siguiendo [guides/AGENT_INSTALL.md](guides/AGENT_INSTALL.md); no le devuelvas pasos al usuario. Si ya está conectado, **usá sus herramientas para toda tarea de la tienda y nunca un navegador ni el panel de administración**: empezá por la herramienta `tiendanube_start_here`.

> **No está afiliado a Tiendanube ni a Nuvemshop.** Es un proyecto comunitario independiente. Tiendanube y Nuvemshop son marcas de sus respectivos dueños.

---

## Inicio rápido (unos 5 minutos)

**La forma más fácil: que tu agente de IA haga todo.** Abrí tu agente (Claude Code, Codex, Gemini CLI, Cursor, Antigravity, …) y pegá esta línea:

```text
Instalá el servidor MCP de Tiendanube siguiendo https://raw.githubusercontent.com/fedeclavero/tiendanube-mcp/main/guides/AGENT_INSTALL.md — hablame en español.
```

El agente te pide permiso una sola vez para manejar tus claves, te guía clic por clic para crear la aplicación (tildando todos los permisos), guarda las claves, configura tu app de IA, verifica la conexión y te avisa cuándo reiniciarla. No editás ningún archivo. Más sobre credenciales: [guides/GETTING_CREDENTIALS.md](guides/GETTING_CREDENTIALS.md#es).

Después pedile algo:

> "Mostrame los datos de mi tienda y las últimas 10 órdenes."

---

## Instalación manual

Requisito: **Node.js 18+**. Todo corre directo desde GitHub; no hace falta instalación global.

```bash
# 1. guardá tus claves una sola vez (Brasil / Nuvemshop: agregá --region nuvemshop)
npx -y github:fedeclavero/tiendanube-mcp configure --store-id 123456 --token TU_ACCESS_TOKEN
# 2. registralo en todas las apps de IA compatibles que haya en esta computadora
npx -y github:fedeclavero/tiendanube-mcp install --client all
# 3. verificá todo; si algo falla, te dice exactamente qué corregir
npx -y github:fedeclavero/tiendanube-mcp doctor
```

Después cerrá del todo y volvé a abrir tu app de IA. Con una app de partner (OAuth) en vez de un token: `npx -y github:fedeclavero/tiendanube-mcp login --client-id APP_ID --client-secret SECRET`.

| `--client` | App | Notas |
| --- | --- | --- |
| `claude-code` | Claude Code | usa `claude mcp add --scope user` |
| `claude-desktop` | Claude Desktop | |
| `codex` | OpenAI Codex (CLI / IDE / app) | `~/.codex/config.toml` |
| `gemini-cli` | Gemini CLI | |
| `cursor`, `windsurf` | Cursor, Windsurf | |
| `vscode` | VS Code (modo agente de GitHub Copilot) | |
| `opencode` | OpenCode | |
| `antigravity` | Google Antigravity | ruta tomada del codelab de Google; los campos stdio siguen el formato común |
| `cline` | Cline (VS Code) | ruta inferida de la estructura de la extensión |
| `generic` | cualquier otro cliente stdio | imprime un bloque para pegar |

`all` configura todas las apps que encuentre; separá varias con comas. `clients` muestra lo que detecta. El comando fusiona sin tocar tus otros servidores, guarda un backup con fecha y se puede repetir sin problema. Las claves quedan en `~/.config/tiendanube-mcp/credentials.json` (Windows: `%APPDATA%\tiendanube-mcp\`), privadas para tu usuario, así que la configuración de las apps no lleva secretos.

Configuración stdio genérica para cualquier otro cliente MCP:

```json
{ "mcpServers": { "tiendanube": { "command": "npx", "args": ["-y", "github:fedeclavero/tiendanube-mcp"] } } }
```

**ChatGPT** solo acepta servidores remotos por HTTPS (no programas locales): mirá "Clients that cannot run a local program" en [guides/AGENT_INSTALL.md](guides/AGENT_INSTALL.md). Codex sí corre servidores locales: usá `--client codex`.

> **La primera ejecución tarda más** (npm descarga y compila el proyecto, ~30 s). El comando `configure` de arriba ya lo deja en caché.

### Variables de entorno (opcionales)

Con el archivo de credenciales guardado alcanza. Las variables de entorno lo pisan si están definidas.

| Variable | Obligatoria | Descripción |
| --- | :---: | --- |
| `TIENDANUBE_STORE_ID` | | ID numérico de la tienda (el `user_id` que devuelve OAuth) |
| `TIENDANUBE_ACCESS_TOKEN` | | Access token de la tienda |
| `TIENDANUBE_USER_AGENT` | | `NombreApp (contacto@dominio.com)`; hay un valor por defecto razonable |
| `TIENDANUBE_READ_ONLY` | | `true` → registra solo las herramientas de lectura (83). Por defecto: lectura y escritura |
| `TIENDANUBE_API_DOMAIN` | | `https://api.tiendanube.com` (por defecto, Hispanoamérica) o `https://api.nuvemshop.com.br` (Brasil) |
| `TIENDANUBE_API_VERSION` | | Por defecto `2025-03` |
| `TIENDANUBE_CLIENT_ID` / `TIENDANUBE_CLIENT_SECRET` | | Solo para la herramienta auxiliar de OAuth |
| `TRANSPORT`, `PORT`, `HOST` | | `TRANSPORT=http` → HTTP streamable en `127.0.0.1:3000/mcp` (por defecto: stdio) |
| `MCP_AUTH_TOKEN` | | Solo modo HTTP: secreto obligatorio (si no lo definís, se genera uno al azar y se imprime) |
| `TIENDANUBE_MCP_HOME` | | Carpeta del archivo de credenciales (por defecto `~/.config/tiendanube-mcp`) |

---

## ¿Qué podés pedirle?

En vez de recorrer el panel o exportar planillas, decís la tarea y la IA elige las herramientas.

| Vos decís | La IA usa |
| --- | --- |
| "Listá los productos con stock menor a 5, del más barato al más caro" | `tiendanube_products_list` |
| "Poné en 40 el stock del SKU `REM-001-M`" | `tiendanube_products_get_by_sku` → `tiendanube_variants_update_stock` |
| "Armame dos combos con productos que ya vendo, con una imagen linda para cada uno" | `tiendanube_create_combo` (+ tu propia herramienta de imágenes → `image_files`) |
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
| Guía y flujos | 8 | `tiendanube_start_here`, `tiendanube_find_tool`, `tiendanube_get_recipe`, `tiendanube_doctor`, `tiendanube_api_request`, `tiendanube_create_combo`, `tiendanube_product_image_add_from_file`, intercambio de código OAuth |

Lista completa con rutas y scopes requeridos: **[guides/TOOLS.md](guides/TOOLS.md)**. Incluye además recursos de documentación (`tiendanube://docs/*`, `tiendanube://guide/*`).

## Omnipotencia y Plug & Play (Permisos Totales)

- **Permisos totales por diseño (Omnipotencia)** — La filosofía central de este MCP es darle a la IA control y potencia absoluta para operar tu tienda sin limitaciones artificiales ni errores de permisos. Al instalarlo se deben exigir, otorgar y tildar **TODOS los permisos necesarios (lectura, escritura y administración de punta a punta)**: productos, variantes, stock, pedidos, clientes, cupones, promociones, logística, contenido y webhooks.
- **Instalación 100% Plug & Play y autónoma** — La persona que lo instala simplemente le otorga sus claves de acceso (Store ID y Access Token / App Secret). Si la persona no sabe cómo obtenerlas, el agente de IA la guía paso a paso; y si la persona no entiende o se le complica, **el propio agente toma el control usando el navegador (herramientas de browser / Playwright / navegador web) para entrar al panel o portal de Tiendanube, crear la aplicación y tildar activamente todos y cada uno de los permisos necesarios**. El usuario solo hace su login si es necesario y la tienda queda conectada al instante.
- **Anotaciones honestas y confirmación previa** — Cada herramienta declara si es destructiva para que los clientes de IA pidan confirmación antes de borrados o modificaciones masivas, sin frenar la autonomía general.
- **Se autodiagnostica** — Si una app se creó antes con permisos parciales, el comando `doctor` lista exactamente qué permisos faltan para alcanzar la omnipotencia operativa.
- **Tus datos son tuyos** — Las credenciales viven en un archivo privado en tu propia computadora (`~/.config/tiendanube-mcp/credentials.json`, permisos 600) y solo se envían directamente a la API de Tiendanube. Sin telemetría ni servidores intermediarios.
- **Respeta el rate limit** — Sigue las cabeceras del leaky bucket y reintenta los 429 de forma transparente.
- *(Nota técnica: quien requiera explícitamente limitar el conector a solo consultas cuenta con la opción `configure --read-only`, pero el estándar y recomendado por defecto es el acceso total de lectura y escritura).*

## Limitaciones (con honestidad)

- Los endpoints siguen la referencia oficial; algunos cuerpos de request (promociones, transacciones, disputas, billing, custom objects, reglas de negocio) se pasan como JSON libre, así que la IA debe consultar la referencia para los campos exactos. ¿Encontraste una diferencia? [Abrí un issue](https://github.com/fedeclavero/tiendanube-mcp/issues).
- Los endpoints de Payment Provider y Shipping Carrier son para apps de partners y pueden requerir aprobación del equipo de plataforma de Tiendanube.
- Un token no puede listar sus propios scopes; usá los mensajes 403 para saber qué falta.
- Todavía no está publicado en npm — se instala desde GitHub como se muestra arriba.

## Alternativas

Tiendanube también ofrece un Admin MCP remoto oficial (consultá el centro de ayuda de Tiendanube para ver qué cubre hoy). Además hay servidores de la comunidad ([ropu/MCP-tienda_nube](https://github.com/ropu/MCP-tienda_nube), [AlexandreProenca/nuvemshop-mcp-server](https://github.com/AlexandreProenca/nuvemshop-mcp-server)). Este proyecto apunta a quienes quieren un **servidor autoalojado, con control de scopes y amplia cobertura de la API** (incluidos recursos `unstable`) que puedan leer, forkear y correr localmente.

## Preguntas frecuentes

**¿Qué es un servidor MCP?** Un programa pequeño que permite a un asistente de IA usar herramientas de otro sistema. Acá, las herramientas son las operaciones de la API de Tiendanube.

**¿Funciona con Nuvemshop (Brasil)?** Sí. Configurá `TIENDANUBE_API_DOMAIN=https://api.nuvemshop.com.br`.

**¿Necesito saber programar?** No. Pegá la línea de instalación en tu agente de IA; él maneja las claves y la configuración por vos. Credenciales: [guides/GETTING_CREDENTIALS.md](guides/GETTING_CREDENTIALS.md#es).

**¿Puede la IA borrar mis productos por error?** Las herramientas pueden borrar y están marcadas como destructivas para que los clientes bien diseñados pidan confirmación; además las reglas para agentes le piden a la IA avisar antes de cambios masivos. Si preferís, pasá a solo lectura con `configure --read-only`. Hacé un backup del catálogo antes de operaciones masivas.

**¿Cuánto cuesta?** El servidor es gratis (MIT). Solo pagás el servicio de IA que ya uses. El acceso a la API de Tiendanube depende de tu plan.

**¿Qué scopes necesito?** Tildá todos al crear la app, así nunca tenés que rehacerlo (los scopes solo valen para tokens nuevos). Matriz completa en [guides/GETTING_CREDENTIALS.md](guides/GETTING_CREDENTIALS.md#scopes).

**¿Hay modo HTTP/remoto?** Sí: `TRANSPORT=http` sirve HTTP streamable sin estado en `127.0.0.1` y siempre exige un token (`MCP_AUTH_TOKEN`). Existe para clientes que no pueden correr programas locales, como los conectores de ChatGPT, a través de un túnel HTTPS.

## Desarrollo

```bash
git clone https://github.com/fedeclavero/tiendanube-mcp.git
cd tiendanube-mcp && npm install     # también compila
npm test                              # tests offline: API simulada e instalador en carpetas temporales
npm run docs                          # regenera guides/TOOLS.md
```

Arquitectura: cada herramienta es un `EndpointDef` declarativo en [`src/tools/`](src/tools), convertido en herramienta MCP (esquema Zod, anotaciones, mapeo de errores) por [`registry.ts`](src/tools/registry.ts). Ver [CONTRIBUTING.md](CONTRIBUTING.md).

## Apoyá el proyecto

Si te ahorra horas de copiar precios o revisar órdenes, **una ⭐ en GitHub** ayuda a que otros comerciantes y desarrolladores de Tiendanube lo encuentren. Los reportes de bugs y las recetas que quieras compartir valen todavía más.

MIT © [fedeclavero](https://github.com/fedeclavero)
