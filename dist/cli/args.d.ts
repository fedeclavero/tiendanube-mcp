export interface Args {
    positional: string[];
    flags: Record<string, string | boolean>;
}
/** Minimal parser: `--flag`, `--key value`, `--key=value`. Unknown flags are kept so commands can reject them. */
export declare function parseArgs(argv: string[]): Args;
export declare const str: (a: Args, key: string) => string | undefined;
export declare const flag: (a: Args, key: string) => boolean;
export declare function readStdin(): Promise<string>;
