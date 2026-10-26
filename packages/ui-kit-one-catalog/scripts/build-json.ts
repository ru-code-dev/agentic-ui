import { mkdirSync, writeFileSync } from "node:fs";
import { buildCatalogJson } from "../src/index.ts";

const outDir = new URL("../dist/", import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL("catalog.json", outDir), `${JSON.stringify(buildCatalogJson(), null, 2)}\n`);
console.log("wrote dist/catalog.json");
