// Intentionally exports ONLY types.
// This must be rejected by gas-demodulify.

export type Foo = {
    x: number;
    y: number;
};

export interface Bar {
    name: string;
}
