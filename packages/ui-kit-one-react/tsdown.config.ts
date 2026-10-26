import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { index: "src/index.ts" },
  unbundle: true,
  format: "esm",
  dts: { tsgo: true },
  sourcemap: false,
  clean: true,
  outDir: "dist",
});
