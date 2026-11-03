# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's *Report a vulnerability* button (Security tab) instead of a public issue. You'll get a response as soon as possible.

## Handling credentials

- Access tokens give access to a real store. Never commit them, paste them in issues, or share screenshots that contain them.
- `configure` / `login` save the credentials once to a user-level file (`~/.config/tiendanube-mcp/credentials.json`, Windows `%APPDATA%\tiendanube-mcp\credentials.json`) created with owner-only permissions (0600 inside a 0700 folder; on Windows the user-profile ACL applies). The file is not encrypted. It is never inside a project folder, and the setup commands never print the token.
- AI agents may handle the keys on the user's behalf **after the user gives explicit permission**; the install guide makes the agent ask for it first.
- Prefer the minimum you are comfortable with. By default the server reads and writes; `configure --read-only` removes every write tool.
- If a token leaks, rotate or revoke it from your Tiendanube admin panel immediately.
- The server sends credentials only to the configured Tiendanube API host and has no telemetry.
- `tiendanube_api_request` can only reach the configured store: the origin and store ID are fixed, and the path is validated (no host, version, `..`, `//`, query or fragment).
- `tiendanube_product_image_add_from_file` only uploads files whose signature is a real JPEG, PNG, GIF or WEBP image (not by extension), so it cannot be used to send arbitrary local files.
- HTTP mode (`TRANSPORT=http`) binds to `127.0.0.1` and **always requires a token** (`MCP_AUTH_TOKEN`; one is generated if unset), as a bearer header or in the URL path. If you expose it through a tunnel, treat the URL as a password and stop the tunnel when you do not need it.
