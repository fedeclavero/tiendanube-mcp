# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's *Report a vulnerability* button (Security tab) instead of a public issue.

## Handling credentials

- Access tokens grant full read and write access to a real store. Never commit them, paste them in chat or issues, or share screenshots that contain them.
- `configure` and `login` save credentials once to a private user-level file (`~/.config/tiendanube-mcp/credentials.json` on Linux/macOS with `0600` permissions inside a `0700` directory; `%APPDATA%\tiendanube-mcp\credentials.json` on Windows with user-profile ACLs). The file is not encrypted on disk. Writes are atomic and locked; setup commands never print tokens or secrets.
- OAuth authorization runs strictly in the local terminal (`tiendanube-mcp login`) with CSRF `state` verification and constant-time comparison; `tiendanube_oauth_exchange_code` never returns access tokens to the chat.
- If a token leaks, rotate or revoke it from your Tiendanube admin panel immediately.
- The server sends credentials only to the two official Tiendanube / Nuvemshop HTTPS origins (`https://api.tiendanube.com` and `https://api.nuvemshop.com.br`), disables redirects, and collects no telemetry.
- `tiendanube_api_request` can only reach the configured store: origin and store ID are fixed, and paths reject schemes, versions, `..`, `//`, encoded separators, queries, and fragments.
- Local image uploads (`tiendanube_product_image_add_from_file` and `image_files` in `tiendanube_create_combo`) work only over local `stdio` (blocked over HTTP), verify real JPEG/PNG/GIF/WEBP magic bytes and full decode limits (`<= 10 MB`, `<= 8192 px`, `<= 16 MP`), and block Windows UNC paths.
- Streamable HTTP mode (`tiendanube-mcp serve --transport http` or `TRANSPORT=http`) binds only to loopback (`127.0.0.1`, `localhost`, `::1`), validates `Host` and `Origin` headers, and always requires a secret token (`MCP_AUTH_TOKEN` or the persistent `0600` token managed by `tiendanube-mcp http-token`, revocable live via `--rotate`). If exposed via an HTTPS tunnel, treat the connector URL as a password and stop the tunnel when idle.
