import { validatePayload } from "@a2ui/agent";
import { buildCatalogJson, uiKitOneContract } from "../src/index.ts";
import { compileMessageValidator } from "./catalog-validator.ts";
import { readExamples, readMockRules } from "./examples.ts";

const validateMessage = compileMessageValidator(buildCatalogJson());
const examples = [
  ...readExamples("components"),
  ...readExamples("compositions"),
  ...readMockRules(),
];
const failures: string[] = [];

for (const example of examples) {
  example.messages.forEach((message, index) => {
    if (!validateMessage(message)) {
      failures.push(
        `${example.file} messages[${index}]: ${JSON.stringify(validateMessage.errors)}`,
      );
    }
  });
  try {
    validatePayload([uiKitOneContract], example.messages);
  } catch (error) {
    failures.push(`${example.file}: ${(error as Error).message}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `${examples.length} examples valid against catalog.json and @a2ui/agent validatePayload`,
);
