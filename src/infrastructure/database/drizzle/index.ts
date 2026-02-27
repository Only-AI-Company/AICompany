/**
 * AI Company - Drizzle ORM Client
 *
 * Drizzle ORM wrapper for the existing AIDatabase
 */

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';

let drizzleClient: ReturnType<typeof drizzle> | null = null;

/**
 * Get or create the Drizzle ORM client
 */
export function getDrizzleClient(db: Database.Database) {
  if (!drizzleClient) {
    drizzleClient = drizzle(db, { schema });
  }
  return drizzleClient;
}

/**
 * Export the schema for use in queries
 */
export * from './schema.js';
export { drizzle };
