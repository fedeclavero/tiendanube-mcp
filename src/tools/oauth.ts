import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { REQUEST_TIMEOUT_MS, TOKEN_URLS } from "../constants.js";

/** tiendanube_oauth_exchange_code — swaps an OAuth `code` for the permanent access token. */
export function registerOAuthTool(server: McpServer): void {
  server.registerTool(
    "tiendanube_oauth_exchange_code",
    {
      title: "Exchange OAuth Code For Access Token",
      description: `Exchange the temporary OAuth 'code' (received on the app's redirect URL as ?code=...) for the permanent access_token.
The response includes access_token, token_type, scope (granted scopes) and user_id — which is the store_id to use as TIENDANUBE_STORE_ID.
Tokens do not expire unless the app is uninstalled or the token is rotated. The code is single-use and short-lived.
Requires client credentials: pass client_id/client_secret or set TIENDANUBE_CLIENT_ID / TIENDANUBE_CLIENT_SECRET.
Does not need a store access token. HTTP: POST https://www.tiendanube.com/apps/authorize/token (or nuvemshop.com.br).`,
      inputSchema: {
        code: z.string().min(1).describe("Authorization code from the redirect URL"),
        client_id: z.string().optional().describe("App client_id (default: env TIENDANUBE_CLIENT_ID)"),
        client_secret: z.string().optional().describe("App client_secret (default: env TIENDANUBE_CLIENT_SECRET)"),
        region: z
          .enum(["tiendanube", "nuvemshop"])
          .default("tiendanube")
          .describe("'tiendanube' (Hispanoamérica) or 'nuvemshop' (Brasil)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ code, client_id, client_secret, region }) => {
      const id = client_id ?? process.env.TIENDANUBE_CLIENT_ID;
      const secret = client_secret ?? process.env.TIENDANUBE_CLIENT_SECRET;
      if (!id || !secret) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: "Error: client_id and client_secret are required (arguments or TIENDANUBE_CLIENT_ID / TIENDANUBE_CLIENT_SECRET)." }],
        };
      }
      try {
        const res = await fetch(TOKEN_URLS[region], {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": process.env.TIENDANUBE_USER_AGENT || "TiendanubeMCPServer/1.0 (dev@example.com)",
          },
          body: JSON.stringify({ client_id: id, client_secret: secret, grant_type: "authorization_code", code }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const text = await res.text();
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
        if (!res.ok) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Error ${res.status} exchanging the code: ${JSON.stringify(data)}\nHint: codes are single-use and expire quickly; restart the authorization flow and check client_id/client_secret.`,
              },
            ],
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    },
  );
}
