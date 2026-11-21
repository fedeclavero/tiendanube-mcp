# Instalación para agentes de IA (ejecutala completa por el usuario)

> **Regla principal: el usuario final no es técnico y probablemente le da miedo abrir una terminal o tocar archivos.** Vos, como agente de IA, hacés **todo el proceso de punta a punta** en su computadora (**Claude Code** o **Codex**). Nunca le devuelvas comandos para correr a mano ni le pidas que abra una terminal o edite configuraciones. Hablá en lenguaje simple y en el idioma del usuario.

`TN` representa la ruta absoluta de `tiendanube-mcp` en los ejemplos. En Windows PowerShell guardala en `$TN` e invocala con `& $TN`. No hace falta instalar Node.js, Python, Git, Rust ni el redistribuible de Visual C++.

## 0. Pedí permiso una sola vez y explicá cómo vas a trabajar

Antes de empezar, decile algo como esto en lenguaje claro y esperá su confirmación:

> *"Para conectar tu tienda de Tiendanube / Nuvemshop con **acceso completo** (lectura y escritura, así puedo ver y editar tus productos, precios, stock, pedidos, cupones y combos desde el primer momento), voy a guiarte paso a paso para obtener tus claves, te las voy a pedir, las voy a guardar en tu computadora y voy a configurar todo en tu app de IA. Yo me encargo de toda la parte técnica: no tenés que abrir ninguna terminal ni editar archivos. ¿Me das permiso para hacerlo?"*

En cuanto el usuario diga que sí:
- **Hacés todo vos** (descargar, verificar, guardar las claves, autorizar, registrar el MCP y verificar) sin volver a pedir permiso para cada paso técnico.
- **Acceso completo desde el momento uno (NO existe modo solo lectura):** el vendedor quiere que puedas editar y administrar su tienda sin trabas. Asegurate de habilitar **todos los permisos disponibles (lectura y escritura en todo)** desde el principio, porque en Tiendanube los permisos solo aplican a tokens nuevos.
- **Higiene básica:** nunca subas claves a Git, nunca las pegues en sitios públicos y no repitas tokens, secretos ni URLs de retorno en tu resumen final.

## 1. Elegí el cliente y descargá el binario (lo hacés vos)

1. Detectá si estás en **Claude Code** o **Codex**. Registrá ese cliente (o ambos si el usuario lo pide). Si tu sesión corre en otro equipo, indicá retomar el pedido desde el cliente local.
2. Abrí la última release de GitHub y descargá el archivo que corresponda al sistema operativo del usuario junto con `SHA256SUMS.txt` del mismo tag. Verificá el SHA-256 (`Get-FileHash -Algorithm SHA256` en Windows, `sha256sum` en Linux, `shasum -a 256` en macOS). [GitHub Releases](https://github.com/fedeclavero/tiendanube-mcp/releases/latest)

| Equipo | Archivo de la release |
| --- | --- |
| Windows 11 x64 o ARM64 con emulación x64 | `tiendanube-mcp-windows-x86_64.zip` |
| macOS Apple Silicon | `tiendanube-mcp-macos-arm64.tar.gz` |
| macOS Intel | `tiendanube-mcp-macos-x86_64.tar.gz` |
| Linux x86-64 | `tiendanube-mcp-linux-x86_64.tar.gz` |

3. Extraé el archivo y guardá el ejecutable en una ubicación fija:
   - Windows: `%LOCALAPPDATA%\Programs\tiendanube-mcp\tiendanube-mcp.exe` (usá `Expand-Archive`; el ZIP también trae `Instalar.cmd` para instalación con doble clic).
   - macOS / Linux: `~/.local/bin/tiendanube-mcp` (usá `tar -xzf` y `chmod +x`).
   Verificá con `TN --version`.
4. **Si ya existe una instalación autorizada, no rotes ni cambies sus claves:** ejecutá `TN doctor --offline --json`. Si las credenciales ya están guardadas y no faltan permisos de escritura, pasá directo al paso 4.

## 2. Guiá paso a paso para obtener las credenciales (con TODOS los permisos)

Preguntale si la tienda es de Brasil / Nuvemshop (en ese caso agregá `--region nuvemshop` en el paso 3). Guialo clic por clic en palabras simples — y si tenés herramienta de navegador y al usuario le cuesta, podés acompañarlo en el navegador (el usuario completa su inicio de sesión y doble factor, y revisan juntos que todos los permisos queden marcados antes de guardar). Más detalle en [GETTING_CREDENTIALS.md](GETTING_CREDENTIALS.md).

### Ruta A (la más simple): aplicación a medida desde el panel de la tienda
1. Entrar al panel de administración de Tiendanube / Nuvemshop → **Configuraciones → Aplicaciones a medida** y crear una aplicación para Tiendanube MCP.
2. En **Perfiles de acceso**, elegir **Acceso total** (o tildar **TODOS los permisos de lectura y escritura sin excepción**).
3. Guardar la aplicación y tocar **Revelar** para copiar el **Access token** (Tiendanube lo muestra completo una sola vez).
4. Pedile al usuario que te copie y pegue acá el **ID de la tienda** y el **Access token**, aclarándole que vos los vas a guardar en su computadora ahora mismo.

### Ruta B (cualquier plan): aplicación del Portal de Partners con OAuth 2.0
1. Abrir `https://partners.tiendanube.com/` (o `https://partners.nuvemshop.com.br/` en Brasil) y crear o editar la aplicación.
2. En **Datos básicos**, activar **todos los permisos disponibles de lectura y escritura** sin dejar ninguno sin marcar (si la app ya estaba instalada en la tienda, habrá que reinstalarla para emitir un token con los permisos nuevos).
3. En **URL de redirección**, escribir exactamente `http://localhost:8765/callback` (o una URL HTTPS propia si el portal no admite retorno local).
4. Pedile al usuario el **App ID** y el **App Secret**, aclarándole que vos vas a encargarte de completar la conexión.

## 3. Guardá las credenciales vos mismo (sin que el usuario abra ninguna terminal)

Las credenciales se guardan una sola vez en `~/.config/tiendanube-mcp/credentials.json` (Windows: `%APPDATA%\tiendanube-mcp\credentials.json`) con permisos privados y las comparten ambos clientes.

### 3A. Con ID de tienda y Access token (Ruta A)

Guardalos vos ejecutando `TN configure` pasando el token por stdin desde una variable temporal (y limpiala enseguida; agregá `--region nuvemshop` para Brasil):

- **Linux / macOS:**
  ```bash
  TOKEN='<ACCESS_TOKEN>'
  printf '%s' "$TOKEN" | TN configure --store-id STORE_ID --token-stdin --json
  unset TOKEN
  ```
- **Windows PowerShell:**
  ```powershell
  $TOKEN = '<ACCESS_TOKEN>'
  $TOKEN | & $TN configure --store-id STORE_ID --token-stdin --json
  Remove-Variable TOKEN
  ```

Comprobá `"ok": true`. Nunca repitas el token en tu respuesta al usuario ni lo guardes en archivos del proyecto.

### 3B. Con App ID y App Secret (Ruta B, OAuth)

- **Con retorno local (`http://localhost:8765/callback`):** ejecutá `TN login` en segundo plano o con tiempo de espera de 5 minutos pasando el App Secret por stdin (agregá `--region nuvemshop` para Brasil):
  - Linux / macOS:
    ```bash
    SECRET='<APP_SECRET>'
    printf '%s' "$SECRET" | TN login --client-id APP_ID --client-secret-stdin --json
    unset SECRET
    ```
  - Windows PowerShell:
    ```powershell
    $SECRET = '<APP_SECRET>'
    $SECRET | & $TN login --client-id APP_ID --client-secret-stdin --json
    Remove-Variable SECRET
    ```
  Avisale al usuario: *"Se abrió la página oficial de Tiendanube para autorizar tu tienda. Iniciá sesión y tocá Aceptar."* El programa recibe la respuesta, canjea el código y guarda el token solo.

- **Plan B (si la URI no apunta a localhost o el puerto 8765 está ocupado):**
  1. Ejecutá `TN login --client-id APP_ID --redirect-uri URI_EXACTA --start --json` y pasale al usuario el enlace `authorize_url` para que acepte todos los permisos.
  2. Pedile que te copie la **dirección completa (URL)** que quedó en la barra del navegador (aunque la página diga que no carga) y completalo vos pasando el App Secret por variable de entorno temporal y la URL por stdin (limpiando ambas al terminar):
     - Linux / macOS:
       ```bash
       RET='<URL_COMPLETA>'
       TIENDANUBE_CLIENT_SECRET='<APP_SECRET>' printf '%s' "$RET" | TIENDANUBE_CLIENT_SECRET='<APP_SECRET>' TN login --finish --redirect-stdin --json
       unset RET
       ```
     - Windows PowerShell:
       ```powershell
       $env:TIENDANUBE_CLIENT_SECRET = '<APP_SECRET>'
       $RET = '<URL_COMPLETA>'
       $RET | & $TN login --finish --redirect-stdin --json
       Remove-Item Env:TIENDANUBE_CLIENT_SECRET
       Remove-Variable RET
       ```

## 4. Registrá el MCP en el cliente (nunca edites JSON/TOML a mano)

- Claude Code: `TN install --client claude-code --json`
- Codex: `TN install --client codex --json`
- Ambos: `TN install --client claude-code --client codex --json`

El instalador conserva tus otros servidores, migra instalaciones viejas de `npx` automáticamente, guarda una copia de respaldo con fecha y verifica el arranque real por MCP (`stdio`) antes de escribir. Para un solo proyecto, agregá `--scope project`.
- Claude Code usa `~/.claude.json` o `$CLAUDE_CONFIG_DIR/.claude.json`.
- Codex usa `~/.codex/config.toml` o `$CODEX_HOME/config.toml`.

## 5. Verificá y avisale al usuario qué hacer ahora

1. En el JSON de `install`, verificá `ok: true`, `launch_check.ok: true` y `launch_check.tools: 198`.
2. Ejecutá `TN doctor --json` y resolvé vos mismo cada `nextSteps` si algo falla (para verificar solo el estado local sin llamar a la API, usá `TN doctor --offline --json`).
3. Avisale al usuario en lenguaje claro que **cierre por completo y vuelva a abrir** su app de IA (Claude Code o la app de ChatGPT con Codex). En la nueva sesión llamá `tiendanube_start_here` y `tiendanube_store_get`. Si la sesión actual necesita reiniciarse para cargar las herramientas, dejá claro que la instalación y verificación técnica quedaron listas y solo falta reiniciar para probarlo desde el chat.

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

| Síntoma | Qué hacer (lo resolvés vos) |
| --- | --- |
| 401 | Token inválido o revocado: pedir uno nuevo y repetir `TN configure` o `TN login` |
| 403 o falta permiso | El error indica el scope; guiar al usuario para activar todos los permisos en la app, reinstalar/reautorizar y repetir `TN login` o `TN configure` |
| `tiendanube-mcp` no encontrado | Paso 1 |
| El cliente no ve el MCP | Reinicio completo del cliente; correr `TN doctor --json` |
| Puerto 8765 ocupado | Usar `--port OTRO_PUERTO` o Plan B (`TN login --start --json` + `--finish --redirect-stdin`) |

Más detalles en [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
