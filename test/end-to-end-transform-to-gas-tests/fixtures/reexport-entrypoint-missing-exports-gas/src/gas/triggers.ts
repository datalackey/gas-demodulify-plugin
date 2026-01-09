import { explodeForDemo } from "./logic";

export function onOpen() {
    SpreadsheetApp.getUi()
        .createMenu("Demo")
        .addItem("click to explode", "explodeForDemo")
        .addToUi();
}
