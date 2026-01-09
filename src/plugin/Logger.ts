export type LogLevel = "silent" | "info" | "debug";


let currentLevel: LogLevel = "info";


export const Logger = {
    /**
     * Set the effective log level for the demodulification run.
     *
     * Behavior and precedence:
     *  1) If an environment variable LOGLEVEL is present and valid ("silent", "info", "debug"),
     *     it takes precedence and overrides any configured value.
     *  2) Otherwise, the provided configured value is used when present.
     *  3) If neither is provided, the default is "info".
     *
     * Notes:
     *  - Invalid values provided either via LOGLEVEL or the configured argument will cause
     *    an exception to be thrown to surface the misconfiguration early.
     */
    setLevel(configured?: LogLevel) {
        const overrideLevel = process.env.LOGLEVEL;
        if (overrideLevel) {
            currentLevel = validateLogLevel(overrideLevel);
            if (currentLevel !== "silent")  {
                console.info(
                    `[gas-demodulify][warn] Log level overridden via environment variable LOGLEVEL=${process.env.LOGLEVEL}`
                );
            }
            return;
        }

        // If no env override, validate the explicit configured value using the same validator
        if (configured === undefined) {
            currentLevel = "info";
            return;
        }

        // assign directly to avoid redundant local variable
        currentLevel = validateLogLevel(String(configured));
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
    },

    // Query helpers
    isDebug(): boolean {
        return currentLevel === "debug";
    }
};


function validateLogLevel(value: string): LogLevel {
    const v = value.toLowerCase();
    if (v === "silent" || v === "info" || v === "debug") {
        return v as LogLevel;
    }
    throw new Error(`Invalid LOGLEVEL value '${value}'. Expected one of: silent, info, debug.`);
}
