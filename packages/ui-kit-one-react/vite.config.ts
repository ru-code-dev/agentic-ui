import { defineConfig } from "vite-plus";

export default defineConfig({
  // One React instance, or hooks in the components and `act` in the tests are different copies.
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
  },
});
