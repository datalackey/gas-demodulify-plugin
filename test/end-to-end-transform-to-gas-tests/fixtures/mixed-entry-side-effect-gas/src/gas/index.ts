import { Logger } from "./logger";

// Side-effect that MUST survive
Logger.configure();

// Re-export GAS trigger
export { onOpen } from "./triggers";
