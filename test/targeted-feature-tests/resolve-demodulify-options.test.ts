import { validateAndNormalizeOptions } from "../../src/plugin/validateAndNormalizeOptions";

describe("resolveDemodulifyOptions", () => {
    test("returns schema defaults when input is undefined", () => {
        const opts = validateAndNormalizeOptions(undefined);

        expect(opts).toEqual({
            namespaceRoot: "DEFAULT",
            subsystem: "DEFAULT",
            buildMode: "gas",
            logLevel: "info",
        });
    });

    test("accepts valid overrides", () => {
        const opts = validateAndNormalizeOptions({
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
        const opts = validateAndNormalizeOptions({
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
            validateAndNormalizeOptions({
                namespaceRoot: "",
                subsystem: "GAS",
                buildMode: "gas",
            })
        ).toThrow(/namespaceRoot/i);
    });

    test("rejects empty subsystem", () => {
        expect(() =>
            validateAndNormalizeOptions({
                namespaceRoot: "MYADDON",
                subsystem: "",
                buildMode: "gas",
            })
        ).toThrow(/subsystem/i);
    });

    test("rejects invalid buildMode", () => {
        expect(() =>
            validateAndNormalizeOptions({
                namespaceRoot: "MYADDON",
                subsystem: "GAS",
                buildMode: "wat",
            })
        ).toThrow(/buildMode/i);
    });

    test("rejects invalid logLevel", () => {
        expect(() =>
            validateAndNormalizeOptions({
                namespaceRoot: "MYADDON",
                subsystem: "GAS",
                buildMode: "gas",
                logLevel: "loud",
            })
        ).toThrow(/logLevel/i);
    });
});
