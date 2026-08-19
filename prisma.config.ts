import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma CLI should use the direct/non-pooled connection injected by the
// Supabase/Vercel integration. DIRECT_URL remains a fallback for local/other hosts.
const directUrl =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL;

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: directUrl || "postgresql://localhost:5432/postgres",
  },
});
