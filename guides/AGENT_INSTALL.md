# Instalación para agentes de IA (ejecutala de punta a punta)

Cuando el usuario comparta el enlace del repositorio y pida instalarlo, ejecutá esta guía en la computadora donde corre su cliente (**Claude Code** o **Codex en la app de ChatGPT**). `TN` representa la ruta absoluta de `tiendanube-mcp` en los ejemplos. En PowerShell podés guardar esa ruta en `$TN` e invocarla con `& $TN`. Hablá en el idioma del usuario.

No hace falta instalar Node.js, Python, Git, Rust ni el redistribuible de Visual C++. El servidor se distribuye como un ejecutable nativo autónomo.

## 1. Elegí el cliente y descargá el binario

1. Detectá si estás en **Claude Code** o **Codex**. Registrá ese cliente. Si el usuario eligió ambos, registrá ambos. Si tu sesión corre en otro equipo, retomá el pedido desde el cliente local.
2. Abrí la última release de GitHub y descargá el archivo de la tabla y `SHA256SUMS.txt` del mismo tag. Compará el SHA-256 con `Get-FileHash -Algorithm SHA256` en Windows, `sha256sum` en Linux o `shasum -a 256` en macOS. [GitHub Releases](https://github.com/fedeclavero/tiendanube-mcp/releases/latest)

| Equipo | Archivo de la release |
| --- | --- |
| Windows 11 x64 o ARM64 con emulación x64 | `tiendanube-mcp-windows-x86_64.zip` |
| macOS Apple Silicon | `tiendanube-mcp-macos-arm64.tar.gz` |
| macOS Intel | `tiendanube-mcp-macos-x86_64.tar.gz` |
| Linux x86-64 | `tiendanube-mcp-linux-x86_64.tar.gz` |

3. Extraé el archivo. En Windows usá `Expand-Archive` y guardá `tiendanube-mcp.exe` en `%LOCALAPPDATA%\Programs\tiendanube-mcp`. En macOS o Linux usá `tar -xzf` y guardá el binario en `~/.local/bin` (con permiso de ejecución). Conservá esa ubicación estable para que el cliente pueda iniciarlo y verificá con `TN --version`. El ZIP de Windows también incluye `Instalar.cmd` para instalación interactiva con doble clic.
4. Si ya existe una instalación autorizada, **reutilizá sus credenciales sin rotarlas ni volver a pedirlas**. Ejecutá `TN doctor --offline --json` para revisar el estado local. Si las credenciales ya están guardadas y no faltan permisos de escritura, pasá directo al paso 4.

## 2. Conseguí las credenciales con TODOS los permisos

El servidor opera siempre con **acceso completo de lectura y escritura** (no existe modo solo lectura). Desde el primer momento debés guiar al vendedor para habilitar **todos los permisos disponibles** (lectura y escritura en todos los recursos), porque los permisos de Tiendanube solo aplican a tokens nuevos. Detalles en [GETTING_CREDENTIALS.md](GETTING_CREDENTIALS.md).

Elegí la ruta según el plan de la tienda (preguntá también si la tienda es de Brasil / Nuvemshop para pasar `--region nuvemshop`):

### Ruta A (más simple): aplicación a medida desde el panel de la tienda
1. Abrí el panel de administración de Tiendanube/Nuvemshop → **Configuraciones → Aplicaciones a medida** y creá una aplicación para Tiendanube MCP.
2. En **Perfiles de acceso**, elegí **Acceso total** (o tildá **todos los permisos de lectura y escritura sin excepción**). Guardá la aplicación y tocá **Revelar** para ver el token (Tiendanube lo muestra completo una sola vez).
3. El usuario completa su inicio de sesión y doble factor. Si acompañás la creación desde el navegador, revisá con el usuario que todos los permisos estén marcados antes de guardar.
4. Pedile el **ID de la tienda** y guardá las credenciales en el paso 3A.

### Ruta B: aplicación del Portal de Partners con OAuth 2.0
1. Abrí `https://partners.tiendanube.com/` (o `https://partners.nuvemshop.com.br/` en Brasil) y creá o editá tu aplicación.
2. En **Datos básicos**, habilitá **todos los permisos disponibles con lectura y escritura**. Si la app ya estaba instalada en la tienda, habrá que reinstalarla para emitir un token con los permisos nuevos.
3. Registrá como **URL de redirección** exactamente `http://localhost:8765/callback` (o una URL HTTPS bajo tu control si el portal no admite retorno local).
4. Copiá el **App ID** y el **App Secret** y seguí en el paso 3B.

## 3. Guardá las credenciales (en privado, nunca en el chat ni argumentos)

Las credenciales se guardan una sola vez en `~/.config/tiendanube-mcp/credentials.json` (Windows: `%APPDATA%\tiendanube-mcp\credentials.json`) con permisos privados y las comparten ambos clientes. Mantené tokens, secretos y URLs de retorno fuera del chat, argumentos de comandos, registros y commits.

### 3A. Con ID de tienda y Access token (Ruta A)

Con terminal interactiva, ejecutá:

```bash
TN configure --store-id STORE_ID
```

(Agregá `--region nuvemshop` para Brasil.) El programa pide el token sin mostrarlo, lo guarda y verifica la conexión con la tienda. Si el agente cuenta con entrada privada por stdin, usá `--token-stdin --json`:
- Linux/macOS: `printf '%s' "$TOKEN" | TN configure --store-id STORE_ID --token-stdin --json`
- Windows PowerShell: `"$TOKEN" | & $TN configure --store-id STORE_ID --token-stdin --json`

### 3B. Con App ID y App Secret (Ruta B, OAuth)

En terminal interactiva, ejecutá:

```bash
TN login --client-id APP_ID
```

(Agregá `--region nuvemshop` para Brasil o `--redirect-uri URL` si usaste una URL propia.) El programa pide el App Secret sin mostrarlo, abre el navegador para autorizar la tienda, captura el retorno en localhost, canjea el código y guarda el token y los permisos.

Si la URI no apunta a localhost o el puerto está ocupado:
1. Ejecutá `TN login --client-id APP_ID --start --json` y guiá al vendedor para abrir `authorize_url` y aceptar todos los permisos.
2. Ejecutá `TN login --finish` en una terminal interactiva para que ingrese la URL completa de retorno sin mostrarla (o usá `--redirect-stdin` desde un canal privado).

## 4. Registrá el MCP en el cliente (nunca edites JSON/TOML a mano)

- Claude Code: `TN install --client claude-code --json`
- Codex: `TN install --client codex --json`
- Ambos: `TN install --client claude-code --client codex --json`

El instalador conserva tus demás servidores y variables, migra instalaciones viejas de `npx` automáticamente, crea una copia de respaldo con fecha y verifica el arranque real por MCP (`stdio`) antes de escribir. Para registrar solo en un proyecto, agregá `--scope project`.

- Claude Code usa `~/.claude.json` o `$CLAUDE_CONFIG_DIR/.claude.json`.
- Codex usa `~/.codex/config.toml` o `$CODEX_HOME/config.toml`.

## 5. Verificá y reiniciá

1. En el JSON de `install`, verificá `ok: true`, `launch_check.ok: true` y `launch_check.tools: 198`.
2. Ejecutá `TN doctor --json` y seguí cada `nextSteps` si algo falla (para verificar solo el estado local sin llamar a la API, usá `TN doctor --offline --json`).
3. Pedile al usuario que **cierre por completo y vuelva a abrir** su cliente (Claude Code o la app de ChatGPT con Codex). En la nueva sesión llamá `tiendanube_start_here` y `tiendanube_store_get`. Si la sesión actual necesita reiniciarse para cargar las herramientas, dejá claro que el registro técnico quedó listo y la comprobación dentro del cliente sigue pendiente.

## Modo HTTP (opcional, para conectores remotos HTTPS)

Para clientes que solo admiten MCP remoto por HTTPS a través de un túnel:
1. Generá o consultá el token con `TN http-token --public-url https://<tu-tunel>` (o definí `MCP_AUTH_TOKEN`).
2. Iniciá el servidor en loopback: `TN serve --transport http --port 3000 --allowed-host <tu-tunel>`.
3. Conectá con cabecera `Authorization: Bearer <token>` en `/mcp` o la URL `/mcp/<token>`. El transporte HTTP bloquea la lectura de archivos locales por seguridad.

## Después de instalar: cómo usar el MCP

1. Para cualquier tarea sobre la tienda usá las herramientas `tiendanube_*`, **nunca el navegador ni el panel de administración**.
2. Empezá por `tiendanube_start_here`; si no sabés qué herramienta usar, `tiendanube_find_tool`; para tareas de varios pasos, `tiendanube_get_recipe`; último recurso, `tiendanube_api_request`.
3. Combos desde productos existentes: `tiendanube_create_combo` (podés generar una imagen con tu propia herramienta y pasar la ruta en `image_files`).
4. Antes de borrar o modificar muchos registros, informá qué vas a cambiar y cuántos elementos afecta, y esperá confirmación del dueño de la tienda.

## Si algo falla

| Síntoma | Qué hacer |
| --- | --- |
| 401 | Token inválido o revocado: repetí `TN login` o `TN configure` |
| 403 o falta permiso | El error indica el scope; activá todos los permisos en la app, reinstalá/reautorizá y repetí `TN login` o `TN configure` |
| `tiendanube-mcp` no encontrado | Paso 1 |
| El cliente no ve el MCP | Cerrá y abrí el cliente por completo; ejecutá `TN doctor` |
| Puerto 8765 ocupado | Usá `--port OTRO_PUERTO` o `TN login --start` + `TN login --finish` |

Más detalles en [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
