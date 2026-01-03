// Namespace initialization
(function init(ns) {
  let o = globalThis;
  for (const p of ns.split(".")) {
    o[p] = o[p] || {};
    o = o[p];
  }
})("MYADDON.GAS");

// User-defined symbols
function hello() {
  return "hello from gas";
}

function goodbye() {
  return "goodbye from gas";
}

// Export surface
globalThis.MYADDON.GAS.hello = hello;
globalThis.MYADDON.GAS.goodbye = goodbye;