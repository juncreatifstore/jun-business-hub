import "dotenv/config";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Prisma CLI (migrate/introspect/generate) should use a direct/non-pooled URL.
// Runtime Prisma Client is configured separately in lib/prisma.ts and prefers
// the pooled Supabase/Vercel integration URL.
const directUrl =
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL;

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: directUrl ?? env("DIRECT_URL"),
  },
});
