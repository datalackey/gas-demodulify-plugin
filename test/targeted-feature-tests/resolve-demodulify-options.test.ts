import { validateAndNormalizePluginOptions } from "../../src/plugin/validateAndNormalizePluginOptions";

describe("resolveDemodulifyOptions", () => {
    test("returns schema defaults when input is undefined", () => {
        const opts = validateAndNormalizePluginOptions(undefined);

        expect(opts).toEqual({
            namespaceRoot: "DEFAULT",
            subsystem: "DEFAULT",
            buildMode: "gas",
            logLevel: "info",
        });
    });

    test("accepts valid overrides", () => {
        const opts = validateAndNormalizePluginOptions({
            namespaceRoot: "MYADDON",
            subsystem: "GAS",
            buildMode: "ui",
            logLevel: "debug",
        });

        expect(opts).toEqual({
            namespaceRoot: "MYADDON",
            subsystem: "GAS",
            buildMode: "ui",
            logLevel: "debug",
        });
    });

    test("applies defaults for omitted optional fields", () => {
        const opts = validateAndNormalizePluginOptions({
            namespaceRoot: "MYADDON",
            subsystem: "UI",
            buildMode: "common",
            // logLevel omitted
        });

        expect(opts).toEqual({
            namespaceRoot: "MYADDON",
            subsystem: "UI",
            buildMode: "common",
            logLevel: "info",
        });
    });

    test("rejects empty namespaceRoot", () => {
        expect(() =>
            validateAndNormalizePluginOptions({
                namespaceRoot: "",
                subsystem: "GAS",
                buildMode: "gas",
            })
        ).toThrow(/namespaceRoot/i);
    });

    test("rejects empty subsystem", () => {
        expect(() =>
            validateAndNormalizePluginOptions({
                namespaceRoot: "MYADDON",
                subsystem: "",
                buildMode: "gas",
            })
        ).toThrow(/subsystem/i);
    });

    test("rejects invalid buildMode", () => {
        expect(() =>
            validateAndNormalizePluginOptions({
                namespaceRoot: "MYADDON",
                subsystem: "GAS",
                buildMode: "wat",
            })
        ).toThrow(/buildMode/i);
    });

    test("rejects invalid logLevel", () => {
        expect(() =>
            validateAndNormalizePluginOptions({
                namespaceRoot: "MYADDON",
                subsystem: "GAS",
                buildMode: "gas",
                logLevel: "loud",
            })
        ).toThrow(/logLevel/i);
    });
});
