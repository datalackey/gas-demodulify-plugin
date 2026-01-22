export const Logger = {
    configure() {
        // detectable side-effect
        (globalThis as any).__LOGGER_CONFIGURED__ = true;
    },
};
