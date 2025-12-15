// -----------------------------
// Logging support
// -----------------------------

export interface Logger {
    info(message: string): void;
    debug(message: string): void;
}

type LogLevel = "silent" | "info" | "debug";

export function createLogger(level: LogLevel | undefined): Logger {
    const enabled = level === "info" || level === "debug";
    const debugEnabled = level === "debug";

    return {
        info(message: string) {
            if (enabled) {
                console.log(`[gas-demodulify] ${message}`);
            }
        },

        debug(message: string) {
            if (debugEnabled) {
                console.log(`[gas-demodulify][debug] ${message}`);
            }
        }
    };
}
