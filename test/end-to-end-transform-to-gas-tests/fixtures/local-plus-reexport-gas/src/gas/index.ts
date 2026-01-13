/**
 * Entry module defines a local GAS export AND re-exports
 * a GAS trigger from another module.
 */
export function foo() {
    return "foo executed";
}

export { onOpen } from "./triggers";
