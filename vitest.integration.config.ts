import { defineConfig } from "vitest/config";
import path from "path";

// Integration tests need a real PostgreSQL with migrations applied and the seed loaded.
// CI provisions it (see .github/workflows/ci.yml "integration" job). Locally:
//   DATABASE_URL=postgresql://... npx prisma migrate deploy && npm run db:seed && npm run test:integration
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
      "@": path.resolve(__dirname, "."),
    },
  },
});
