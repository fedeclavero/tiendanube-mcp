export interface Args {
  positional: string[];
  flags: Record<string, string | boolean>;
}

const BOOLEAN_FLAGS = new Set([
  "json", "dry-run", "embed-env", "no-verify", "no-open", "token-stdin", "read-only", "read-write", "no-probe", "yes", "purge-credentials", "help", "force",
]);

/** Minimal parser: `--flag`, `--key value`, `--key=value`. Unknown flags are kept so commands can reject them. */
export function parseArgs(argv: string[]): Args {
  const out: Args = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out.positional.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    if (eq > 0) {
      out.flags[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const key = a.slice(2);
    if (BOOLEAN_FLAGS.has(key)) out.flags[key] = true;
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) out.flags[key] = argv[++i];
    else out.flags[key] = true;
  }
  return out;
}

export const str = (a: Args, key: string): string | undefined => {
  const v = a.flags[key];
  return typeof v === "string" && v !== "" ? v : undefined;
};
export const flag = (a: Args, key: string): boolean => a.flags[key] === true || a.flags[key] === "true";

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}
