import { credentialsPath } from "./config/store.js";
import { MISSING_CREDENTIALS_HELP, ResolvedCredentials, TiendanubeApiError, TiendanubeClient } from "./services/client.js";
import { formatError } from "./services/errors.js";
import { EndpointDef, ToolModule, buildRequest } from "./tools/registry.js";

export type ScopeState = "ok" | "missing" | "unknown";

export interface DoctorReport {
  ok: boolean;
  credentials: {
    storeId?: string;
    tokenSet: boolean;
    from: { storeId: string; accessToken: string };
    file: string;
    userAgent?: string;
    apiDomain?: string;
  };
  mode: "read-write" | "read-only";
  store?: { id?: unknown; name?: string; plan?: string; country?: string; currency?: string; languages?: string[] };
  /** Read scopes verified with a cheap GET each. Write scopes cannot be probed without writing. */
  readScopes: Record<string, ScopeState>;
  missingReadScopes: string[];
  grantedScopes?: string[];
  problems: string[];
  nextSteps: string[];
}

const textOf = (v: unknown): string | undefined => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") return Object.values(v as object).find((x) => typeof x === "string") as string | undefined;
  return undefined;
};

/** One argument-free GET per distinct read_* scope, taken from the real tool definitions. */
export function probeDefs(modules: ToolModule[]): Map<string, EndpointDef> {
  const probes = new Map<string, EndpointDef>();
  for (const def of modules.flatMap((m) => m.tools)) {
    if (def.method !== "GET" || !def.scope.startsWith("read_") || /\{/.test(def.path) || probes.has(def.scope)) continue;
    probes.set(def.scope, def);
  }
  return probes;
}

export async function diagnose(
  creds: ResolvedCredentials,
  client: TiendanubeClient | undefined,
  modules: ToolModule[],
  options: { probeScopes?: boolean } = {},
): Promise<DoctorReport> {
  const report: DoctorReport = {
    ok: false,
    credentials: {
      storeId: creds.storeId,
      tokenSet: Boolean(creds.accessToken),
      from: { storeId: creds.source.storeId, accessToken: creds.source.accessToken },
      file: credentialsPath(),
      userAgent: creds.userAgent,
      apiDomain: creds.apiDomain,
    },
    mode: creds.readOnly ? "read-only" : "read-write",
    readScopes: {},
    missingReadScopes: [],
    grantedScopes: creds.scopes,
    problems: [],
    nextSteps: [],
  };

  if (!client || !creds.storeId || !creds.accessToken) {
    report.problems.push("Store ID and/or access token are not configured.");
    report.nextSteps.push(MISSING_CREDENTIALS_HELP);
    return report;
  }

  try {
    const { data } = await client.request<Record<string, any>>({ method: "GET", path: "/store" });
    report.store = {
      id: data.id,
      name: textOf(data.name),
      plan: data.plan_name,
      country: data.country,
      currency: data.main_currency,
      languages: Array.isArray(data.languages) ? data.languages : undefined,
    };
  } catch (error) {
    report.problems.push(formatError(error, { scope: "any valid token", toolName: "doctor" }));
    if (error instanceof TiendanubeApiError && error.status === 401) {
      report.nextSteps.push(
        "Ask the user for a valid access token and Store ID (guides/GETTING_CREDENTIALS.md) and save them yourself: npx -y github:fedeclavero/tiendanube-mcp configure --store-id <ID> --token <TOKEN>, then restart the AI client.",
      );
    } else {
      report.nextSteps.push("Follow the 'Next step' in the error above.");
    }
    return report;
  }

  if (options.probeScopes !== false) {
    for (const [scope, def] of probeDefs(modules)) {
      try {
        const req = buildRequest(def, { page: 1, per_page: 1 });
        await client.request({ method: "GET", path: req.path, version: req.version, query: req.query as Record<string, string | number | boolean> });
        report.readScopes[scope] = "ok";
      } catch (error) {
        if (error instanceof TiendanubeApiError && error.status === 403) report.readScopes[scope] = "missing";
        else if (error instanceof TiendanubeApiError && error.status === 404 && /last page/i.test(JSON.stringify(error.payload))) report.readScopes[scope] = "ok";
        else report.readScopes[scope] = "unknown";
      }
    }
    report.missingReadScopes = Object.entries(report.readScopes)
      .filter(([, state]) => state === "missing")
      .map(([scope]) => scope);
  }

  if (report.missingReadScopes.length) {
    report.problems.push(
      `The token cannot read: ${report.missingReadScopes.join(", ")} (scope missing, or the endpoint is restricted to partner apps).`,
    );
    report.nextSteps.push(
      "Open the app settings and tick ALL permissions (Partner Portal > the app > Basic Data; custom app: Settings > Custom apps). Then re-authorize so a NEW token is issued (scopes only apply to new tokens): npx -y github:fedeclavero/tiendanube-mcp login --client-id <APP_ID> --client-secret <SECRET>  (custom app: copy the new token and run configure --token). Restart the AI client afterwards.",
    );
  }
  report.ok = report.problems.length === 0;
  if (report.ok) report.nextSteps.push("Everything works. Use the tools (call tiendanube_start_here if unsure which).");
  return report;
}

export function renderReport(r: DoctorReport): string {
  const lines: string[] = [];
  lines.push(r.ok ? "OK: the Tiendanube connection works." : "PROBLEMS FOUND.");
  lines.push(`credentials: store ${r.credentials.storeId ?? "(missing)"} from ${r.credentials.from.storeId}; token ${r.credentials.tokenSet ? "set" : "MISSING"} from ${r.credentials.from.accessToken} (file: ${r.credentials.file})`);
  lines.push(`mode: ${r.mode}`);
  if (r.store) {
    lines.push(`store: ${r.store.name ?? "?"} (id ${String(r.store.id)}), plan ${r.store.plan ?? "n/a"}, ${r.store.country ?? "n/a"} / ${r.store.currency ?? "n/a"}, languages ${r.store.languages?.join(", ") ?? "n/a"}`);
  }
  const probed = Object.entries(r.readScopes);
  if (probed.length) {
    lines.push(`read scopes: ${probed.map(([s, st]) => `${s}=${st}`).join(", ")}`);
    lines.push("note: write scopes cannot be tested without writing; a write tool that answers 403 names the scope it needs.");
  }
  if (r.grantedScopes?.length) lines.push(`scopes granted at login: ${r.grantedScopes.join(", ")}`);
  for (const p of r.problems) lines.push(`PROBLEM: ${p}`);
  for (const n of r.nextSteps) lines.push(`NEXT STEP: ${n}`);
  return lines.join("\n");
}
