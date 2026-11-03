const BOOLEAN_FLAGS = new Set([
    "json", "dry-run", "embed-env", "no-verify", "no-open", "token-stdin", "read-only", "read-write", "no-probe", "yes", "purge-credentials", "help", "force",
]);
/** Minimal parser: `--flag`, `--key value`, `--key=value`. Unknown flags are kept so commands can reject them. */
export function parseArgs(argv) {
    const out = { positional: [], flags: {} };
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
        if (BOOLEAN_FLAGS.has(key))
            out.flags[key] = true;
        else if (i + 1 < argv.length && !argv[i + 1].startsWith("--"))
            out.flags[key] = argv[++i];
        else
            out.flags[key] = true;
    }
    return out;
}
export const str = (a, key) => {
    const v = a.flags[key];
    return typeof v === "string" && v !== "" ? v : undefined;
};
export const flag = (a, key) => a.flags[key] === true || a.flags[key] === "true";
export async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin)
        chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8").trim();
}
//# sourceMappingURL=args.js.map