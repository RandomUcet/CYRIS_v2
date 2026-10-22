import { defineConfig } from 'drizzle-kit';
import { loadConfig } from '@cyris/config';

const config = loadConfig();

export default defineConfig({
  schema: './dist/schema/index.js',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: config.DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
