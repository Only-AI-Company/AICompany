import type { Config } from 'drizzle-kit';

export default {
  schema: './src/infrastructure/database/drizzle/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.AI_COMPANY_DB_PATH || `${process.env.HOME || '.'}/.ai-company/data.db`,
  },
} satisfies Config;
