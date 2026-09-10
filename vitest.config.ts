import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**", "node_modules/**"],
    environment: "node",
  },
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
      "@": path.resolve(__dirname, "."),
    },
  },
});
