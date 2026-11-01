# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's *Report a vulnerability* button (Security tab) instead of a public issue. You'll get a response as soon as possible.

## Handling credentials

- Access tokens give access to a real store. Never commit them, paste them in issues, or share screenshots that contain them.
- Prefer user-level MCP client configs and the minimum OAuth scopes. Use `TIENDANUBE_READ_ONLY=true` unless you need writes.
- If a token leaks, rotate or revoke it from your Tiendanube admin panel immediately.
- The server sends credentials only to the configured Tiendanube API host and has no telemetry. In HTTP mode it binds to `127.0.0.1` by default and has no built-in authentication: add your own before exposing it.
