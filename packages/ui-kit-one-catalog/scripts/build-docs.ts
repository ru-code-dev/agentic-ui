import { writeFileSync } from "node:fs";
import { renderContractsMarkdown } from "./contracts-markdown.ts";

writeFileSync(new URL("../CONTRACTS.md", import.meta.url), renderContractsMarkdown());
console.log("wrote CONTRACTS.md");
