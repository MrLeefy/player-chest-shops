import { readFileSync, writeFileSync } from "node:fs";

const migrations = [
  {
    path: "src/database.ts",
    replacements: [
      [".isValid()", ".isValid"],
    ],
  },
  {
    path: "src/import.ts",
    replacements: [
      [".isValid()", ".isValid"],
    ],
  },
  {
    path: "src/shop.ts",
    replacements: [
      [
        ".textField(textFieldPrompt, textFieldPlaceholder, defaultValue);",
        ".textField(textFieldPrompt, textFieldPlaceholder, { defaultValue });",
      ],
      [
        "buy.textField(formText, 'Type amount here', '1');",
        "buy.textField(formText, 'Type amount here', { defaultValue: '1' });",
      ],
    ],
  },
];

let changedFiles = 0;

for (const migration of migrations) {
  const original = readFileSync(migration.path, "utf8");
  let updated = original;

  for (const [oldText, newText] of migration.replacements) {
    updated = updated.split(oldText).join(newText);
  }

  if (updated !== original) {
    writeFileSync(migration.path, updated, "utf8");
    changedFiles++;
    console.log(`Migrated ${migration.path}`);
  }
}

console.log(
  changedFiles === 0
    ? "ChestShop Script API source is already current."
    : `Migrated ${changedFiles} ChestShop source file(s) to Script API 2.x.`,
);
