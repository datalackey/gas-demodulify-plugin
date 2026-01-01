export type LogLevel = "silent" | "info" | "debug";


let currentLevel: LogLevel = "info";


export const Logger = {
    /**
     * Resolves effective log level.
     *
     * Precedence:
     *   1. LOGLEVEL environment variable (if set)
     *   2. Configured level
     *   3. Default: "info"
     *
     * Throws if LOGLEVEL is invalid.
     */
    setLevel(configured?: LogLevel) {
        const envLevel = parseEnvLogLevel();

        if (envLevel) {
            currentLevel = envLevel;
            console.warn(
                `[gas-demodulify][warn] Log level overridden via environment variable LOGLEVEL=${process.env.LOGLEVEL}`
            );
            return;
        }

        currentLevel = configured ?? "info";
    },

    info(msg: string) {
        if (currentLevel === "info" || currentLevel === "debug") {
            console.log(`[gas-demodulify] ${msg}`);
        }
    },

    debug(msg: string) {
        if (currentLevel === "debug") {
            console.log(`[gas-demodulify][debug] ${msg}`);
        }
    },

    warn(msg: string) {
        console.warn(`[gas-demodulify][warn] ${msg}`);
    },

    error(msg: string) {
        console.error(`[gas-demodulify][error] ${msg}`);
    }
};

function parseEnvLogLevel(): LogLevel | undefined {
    const raw = process.env.LOGLEVEL;
    if (!raw) return undefined;

    const v = raw.toLowerCase();
    if (v === "silent" || v === "info" || v === "debug") {
        return v;
    }

    throw new Error(
        `[gas-demodulify] Invalid LOGLEVEL value '${raw}'. ` +
        `Expected one of: silent, info, debug.`
    );
}




