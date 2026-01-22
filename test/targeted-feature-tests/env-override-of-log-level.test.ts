// test/targeted-feature-tests/env-override-of-log-level.test.ts

import { Logger } from "../../src/plugin/Logger";

describe("Logger LOGLEVEL environment override", () => {
    let logSpy: jest.SpyInstance;
    let infoSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
        infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
        warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
        delete process.env.LOGLEVEL;
    });

    test("LOGLEVEL overrides configured log level", () => {
        process.env.LOGLEVEL = "debug";

        Logger.setLevel("silent");
        Logger.debug("env wins");

        expect(logSpy).toHaveBeenCalledWith("[gas-demodulify][debug] env wins");
    });

    test("LOGLEVEL override emits warning (unless silent)", () => {
        process.env.LOGLEVEL = "info";

        Logger.setLevel("debug");

        expect(infoSpy).toHaveBeenCalledWith(
            "[gas-demodulify][warn] Log level overridden via environment variable LOGLEVEL=info"
        );
    });

    test("LOGLEVEL=silent suppresses override warning", () => {
        process.env.LOGLEVEL = "silent";

        Logger.setLevel("debug");

        expect(infoSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
    });

    test("invalid LOGLEVEL throws immediately", () => {
        process.env.LOGLEVEL = "loud";

        expect(() => {
            Logger.setLevel("info");
        }).toThrow(/Invalid LOGLEVEL value/i);
    });
});
