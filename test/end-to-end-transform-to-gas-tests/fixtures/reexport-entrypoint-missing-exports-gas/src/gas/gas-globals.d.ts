/* Minimal GAS globals for tests */

declare const SpreadsheetApp: {
  getUi(): {
    createMenu(name: string): {
      addItem(caption: string, functionName: string): any;
      addToUi(): void;
    };
  };
};
