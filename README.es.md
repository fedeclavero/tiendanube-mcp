# Servidor MCP de Tiendanube — administrá tu tienda Tiendanube / Nuvemshop con Claude, Codex, OpenCode y cualquier agente de IA

[![CI](https://github.com/fedeclavero/tiendanube-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/fedeclavero/tiendanube-mcp/actions/workflows/ci.yml)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-green.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-server-blue)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](https://nodejs.org)

**🇬🇧 [Read in English](README.md)** · [Sitio web](https://fedeclavero.github.io/tiendanube-mcp/es/) · [Referencia de herramientas](guides/TOOLS.md) · [Recetas de prompts](guides/RECIPES.md)

**`tiendanube-mcp` es un servidor [MCP (Model Context Protocol)](https://modelcontextprotocol.io) gratuito y de código abierto que conecta asistentes de IA con la API de Tiendanube (Nuvemshop en Brasil).** Pedile en lenguaje natural — *"¿qué productos tienen menos de 5 unidades?"*, *"subí un 12 % los precios de la categoría Verano"*, *"¿qué pedidos están pagos y sin enviar?"* — y tu IA lo resuelve con **191 herramientas** que cubren **39 recursos de la API**: productos, variantes, stock, órdenes, clientes, cupones, envíos, pagos, webhooks y más.

Funciona con **Claude Code, Claude Desktop, OpenAI Codex, OpenCode, Gemini CLI, Cursor, VS Code (Copilot), Windsurf** y cualquier cliente compatible con MCP por stdio o HTTP.

> **No está afiliado a Tiendanube ni a Nuvemshop.** Es un proyecto comunitario independiente. Tiendanube y Nuvemshop son marcas de sus respectivos dueños.

---

## Inicio rápido (unos 5 minutos, 3 pasos)

### 1. Conseguí tus credenciales — *2 minutos*

Necesitás el **ID de tu tienda** y un **access token**. La guía paso a paso está en [guides/GETTING_CREDENTIALS.md](guides/GETTING_CREDENTIALS.md#es) (aplicación a medida desde tu panel, u OAuth para apps de partners).

### 2. Dejá que tu agente de IA lo instale — *1 minuto*

Abrí tu agente (Claude Code, Codex, OpenCode, …) y pegá esta línea:

```text
Instalá el servidor MCP de Tiendanube siguiendo https://raw.githubusercontent.com/fedeclavero/tiendanube-mcp/main/guides/AGENT_INSTALL.md — hablame en español.
```

El agente lo instala, configura tu cliente, te pide solo los datos necesarios y verifica la conexión. ¿Preferís hacerlo a mano? Usá la tabla de abajo.

### 3. Pedile algo — *10 segundos*

> "Mostrame los datos de mi tienda y las últimas 10 órdenes."

Empezá en **modo solo lectura** (`TIENDANUBE_READ_ONLY=true`): la IA puede mirar pero no tocar. Cuando le tengas confianza, lo desactivás.

---

## Instalación manual

Requisito: **Node.js 18+**. Cada comando corre el servidor directo desde GitHub; no hace falta instalación global. Reemplazá los valores por los tuyos.

| Cliente | Comando / configuración |
| --- | --- |
| **Claude Code** | `claude mcp add tiendanube --scope user -e TIENDANUBE_STORE_ID=123456 -e TIENDANUBE_ACCESS_TOKEN=xxxx -e TIENDANUBE_USER_AGENT="MiTienda (yo@ejemplo.com)" -e TIENDANUBE_READ_ONLY=true -- npx -y github:fedeclavero/tiendanube-mcp` |
| **OpenAI Codex** | `codex mcp add tiendanube --env TIENDANUBE_STORE_ID=123456 --env TIENDANUBE_ACCESS_TOKEN=xxxx --env TIENDANUBE_USER_AGENT="MiTienda (yo@ejemplo.com)" --env TIENDANUBE_READ_ONLY=true -- npx -y github:fedeclavero/tiendanube-mcp` |
| **OpenCode** | agregalo a `opencode.json` → ver [abajo](#opencode) |
| **Claude Desktop, Cursor, Windsurf, Gemini CLI, VS Code** | fragmentos JSON en [guides/AGENT_INSTALL.md](guides/AGENT_INSTALL.md#client-configs) |

Configuración stdio genérica (sirve en la mayoría de los clientes):

```json
{
  "mcpServers": {
    "tiendanube": {
      "command": "npx",
      "args": ["-y", "github:fedeclavero/tiendanube-mcp"],
      "env": {
        "TIENDANUBE_STORE_ID": "123456",
        "TIENDANUBE_ACCESS_TOKEN": "tu_access_token",
        "TIENDANUBE_USER_AGENT": "MiTienda (yo@ejemplo.com)",
        "TIENDANUBE_READ_ONLY": "true"
      }
    }
  }
}
```

<a id="opencode"></a>**OpenCode** (`opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "tiendanube": {
      "type": "local",
      "command": ["npx", "-y", "github:fedeclavero/tiendanube-mcp"],
      "enabled": true,
      "environment": {
        "TIENDANUBE_STORE_ID": "123456",
        "TIENDANUBE_ACCESS_TOKEN": "tu_access_token",
        "TIENDANUBE_USER_AGENT": "MiTienda (yo@ejemplo.com)",
        "TIENDANUBE_READ_ONLY": "true"
      }
    }
  }
}
```

Verificá la conexión cuando quieras:

```bash
TIENDANUBE_STORE_ID=123456 TIENDANUBE_ACCESS_TOKEN=xxxx npx -y github:fedeclavero/tiendanube-mcp --check
```

> **La primera ejecución tarda más** (npm descarga y compila el proyecto, ~30 s). Corré `npx -y github:fedeclavero/tiendanube-mcp --version` una vez antes de abrir tu cliente MCP para que no se pase de tiempo.

### Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | :---: | --- |
| `TIENDANUBE_STORE_ID` | ✅ | ID numérico de la tienda (el `user_id` que devuelve OAuth) |
| `TIENDANUBE_ACCESS_TOKEN` | ✅ | Access token de la tienda |
| `TIENDANUBE_USER_AGENT` | recomendada | `NombreApp (contacto@dominio.com)` — la API rechaza pedidos sin User-Agent |
| `TIENDANUBE_READ_ONLY` | | `true` → registra solo las 78 herramientas de lectura |
| `TIENDANUBE_API_DOMAIN` | | `https://api.tiendanube.com` (por defecto, Hispanoamérica) o `https://api.nuvemshop.com.br` (Brasil) |
| `TIENDANUBE_API_VERSION` | | Por defecto `2025-03` |
| `TIENDANUBE_CLIENT_ID` / `TIENDANUBE_CLIENT_SECRET` | | Solo para la herramienta auxiliar de OAuth |
| `TRANSPORT`, `PORT`, `HOST` | | `TRANSPORT=http` → HTTP streamable en `127.0.0.1:3000/mcp` (por defecto: stdio) |

---

## ¿Qué podés pedirle?

En vez de recorrer el panel o exportar planillas, decís la tarea y la IA elige las herramientas.

| Vos decís | La IA usa |
| --- | --- |
| "Listá los productos con stock menor a 5, del más barato al más caro" | `tiendanube_products_list` |
| "Poné en 40 el stock del SKU `REM-001-M`" | `tiendanube_products_get_by_sku` → `tiendanube_variants_update_stock` |
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

Lista completa con rutas y scopes requeridos: **[guides/TOOLS.md](guides/TOOLS.md)**. Incluye además una herramienta de OAuth (`tiendanube_oauth_exchange_code`) y dos recursos de documentación (`tiendanube://docs/scopes-and-limits`, `tiendanube://docs/checkout-sdk`).

## Seguro por diseño

- **Modo solo lectura** — `TIENDANUBE_READ_ONLY=true` elimina todas las herramientas de escritura. Empezá acá y habilitá la escritura cuando te sientas cómodo.
- **Anotaciones honestas** — cada herramienta declara `readOnlyHint` / `destructiveHint` / `idempotentHint`, para que los clientes MCP traten con más cuidado los borrados y cancelaciones.
- **Mínimo privilegio** — un `403` le indica a la IA qué scope OAuth falta; otorgá solo los que necesites.
- **Tus datos son tuyos** — las credenciales viven en la configuración de tu propio cliente y solo se envían a la API de Tiendanube. Sin telemetría, sin servidores de terceros.
- **Respeta el rate limit** — sigue las cabeceras del leaky bucket y reintenta los `429` una cantidad acotada de veces.
- **Cuida el contexto** — paginación, filtro `fields`, salida `markdown`/`json` y tope de 25.000 caracteres.
- **Código abierto (MIT)** — leé cada línea antes de confiar.

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

**¿Necesito saber programar?** No. Pegá la línea de instalación en tu agente de IA y respondé sus preguntas. Credenciales: [guides/GETTING_CREDENTIALS.md](guides/GETTING_CREDENTIALS.md#es).

**¿Puede la IA borrar mis productos por error?** No en modo solo lectura. En modo lectura-escritura, las herramientas de borrado/cancelación están marcadas como destructivas para que los clientes bien diseñados pidan confirmación. Hacé un backup del catálogo antes de operaciones masivas.

**¿Cuánto cuesta?** El servidor es gratis (MIT). Solo pagás el servicio de IA que ya uses. El acceso a la API de Tiendanube depende de tu plan.

**¿Qué scopes necesito?** Solo los de lo que le pidas. Para análisis de solo lectura suelen alcanzar `read_products`, `read_orders` y `read_customers`. Matriz completa en [guides/GETTING_CREDENTIALS.md](guides/GETTING_CREDENTIALS.md#scopes).

**¿Hay modo HTTP/remoto?** Sí: `TRANSPORT=http` sirve HTTP streamable sin estado en `127.0.0.1`. Ponele tu propia autenticación antes de exponerlo.

## Desarrollo

```bash
git clone https://github.com/fedeclavero/tiendanube-mcp.git
cd tiendanube-mcp && npm install     # también compila
npm test                              # autotest offline con API simulada
npm run docs                          # regenera guides/TOOLS.md
```

Arquitectura: cada herramienta es un `EndpointDef` declarativo en [`src/tools/`](src/tools), convertido en herramienta MCP (esquema Zod, anotaciones, mapeo de errores) por [`registry.ts`](src/tools/registry.ts). Ver [CONTRIBUTING.md](CONTRIBUTING.md).

## Apoyá el proyecto

Si te ahorra horas de copiar precios o revisar órdenes, **una ⭐ en GitHub** ayuda a que otros comerciantes y desarrolladores de Tiendanube lo encuentren. Los reportes de bugs y las recetas que quieras compartir valen todavía más.

MIT © [fedeclavero](https://github.com/fedeclavero)
