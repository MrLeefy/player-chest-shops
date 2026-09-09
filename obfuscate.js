import fs from "node:fs";
import JavaScriptObfuscator from "javascript-obfuscator";

const filePath = "LeefyChestShop BEH/scripts/import.js";

if (!fs.existsSync(filePath)) {
  console.error(`Production bundle was not found at ${filePath}.`);
  process.exit(1);
}

try {
  const source = fs.readFileSync(filePath, "utf8");
  const result = JavaScriptObfuscator.obfuscate(source, {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: "hexadecimal",
    log: false,
    numbersToExpressions: false,
    renameGlobals: false,
    selfDefending: false,
    simplify: false,
    splitStrings: false,
    stringArray: false,
    stringArrayCallsTransform: false,
    target: "browser",
    unicodeEscapeSequence: false,
  });

  fs.writeFileSync(filePath, result.getObfuscatedCode(), "utf8");
  console.log("LeefyChestShop production bundle obfuscated.");
} catch (error) {
  console.error("LeefyChestShop production obfuscation failed:", error);
  process.exit(1);
}
