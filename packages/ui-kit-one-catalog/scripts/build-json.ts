import { mkdirSync, writeFileSync } from "node:fs";
import { catalogJsonText } from "./artifacts.ts";

const outDir = new URL("../dist/", import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL("catalog.json", outDir), catalogJsonText());
console.log("wrote dist/catalog.json");
