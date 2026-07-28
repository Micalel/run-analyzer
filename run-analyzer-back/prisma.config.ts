/**
 * Prisma ORM v7 configuration — replaces what used to be the `datasource
 * { url = ... }` line directly in schema.prisma. This file is read by the
 * Prisma CLI (migrate, studio, validate, etc.), not by the running app
 * itself (the app's own PrismaClient gets its connection info from the
 * driver adapter set up in db.ts).
 *
 * Must live at the project root (next to package.json) for the CLI to
 * find it automatically.
 */
 
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});