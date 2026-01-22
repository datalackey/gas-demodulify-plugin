// test/targeted-feature-tests/logger-basic-behavior.test.ts

import { Logger } from "../../src/plugin/Logger";

describe("Logger basic behavior (no env override)", () => {
    let logSpy: jest.SpyInstance;
    let infoSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
        infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
        warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
        errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        delete process.env.LOGLEVEL;
    });

    afterEach(() => {
        jest.restoreAllMocks();
        delete process.env.LOGLEVEL;
    });

    test("info logs when level is info", () => {
        Logger.setLevel("info");

        Logger.info("hello");

        expect(logSpy).toHaveBeenCalledWith("[gas-demodulify] hello");
    });

    test("debug logs only when level is debug", () => {
        Logger.setLevel("info");
        Logger.debug("nope");

        expect(logSpy).not.toHaveBeenCalled();

        Logger.setLevel("debug");
        Logger.debug("yep");

        expect(logSpy).toHaveBeenCalledWith("[gas-demodulify][debug] yep");
    });

    test("silent suppresses info and debug logs", () => {
        Logger.setLevel("silent");

        Logger.info("hidden");
        Logger.debug("hidden");

        expect(logSpy).not.toHaveBeenCalled();
        expect(infoSpy).not.toHaveBeenCalled();
    });

    test("warn always logs regardless of level", () => {
        Logger.setLevel("silent");

        Logger.warn("something odd");

        expect(warnSpy).toHaveBeenCalledWith("[gas-demodulify][warn] something odd");
    });

    test("error always logs regardless of level", () => {
        Logger.setLevel("silent");

        Logger.error("boom");

        expect(errorSpy).toHaveBeenCalledWith("[gas-demodulify][error] boom");
    });
});
