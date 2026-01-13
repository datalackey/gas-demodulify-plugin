// Re-export alone is insufficient for GAS.
// Side-effect import forces Webpack to emit runtime code.
export { onOpen } from "./triggers";
import "./triggers";
