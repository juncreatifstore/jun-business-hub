import path from "node:path";
import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma config: routes CLI commands (db push / migrate) through the pg driver
// adapter + JS/WASM schema engine — no native engine download (CI/offline friendly).
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  experimental: { adapter: true },
  engine: "js",
  adapter: async () => new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
} as never);
