/**
 * Database Initialization
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { AIDatabase } from './database/index.js';
import { getDatabase } from './database/index.js';
import { seedHumans } from './database/seeds/index.js';
import { getConfigService, resetConfigService } from './config/ConfigService.js';
import { getPaths, resetPaths } from './config/Paths.js';
import { getEnvVarService, resetEnvVarService } from './env/index.js';

let initialized = false;
type InitOptions = { workDir?: string };

function getSchemaPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const possiblePaths = [
    join(currentDir, 'database', 'schema.sql'),
  ];
  for (const path of possiblePaths) {
    if (existsSync(path)) return path;
  }
  return possiblePaths[0];
}

function getMigrationsDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return join(currentDir, 'database', 'migrations');
}

function ensureMigrationsTable(db: AIDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);
}

function applyMigrations(db: AIDatabase): void {
  ensureMigrationsTable(db);
  const migrationsDir = getMigrationsDir();
  if (!existsSync(migrationsDir)) return;

  const appliedRows = db.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: string }>;
  const applied = new Set(appliedRows.map(row => row.id));
  const files = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  files.forEach((file) => {
    if (applied.has(file)) return;
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(file, Date.now());
  });
}

export function initializeDatabase(options?: InitOptions): void {
  if (isDatabaseInitialized()) {
    if (options?.workDir) {
      const db = getDatabase();
      applyWorkDir(db, options.workDir);
      initializeSystem(db, { force: true });
    }
    return;
  }
  const db = getDatabase();
  const schema = readFileSync(getSchemaPath(), 'utf-8');
  db.initialize(schema);
  applyMigrations(db);

  applyWorkDir(db, options?.workDir);
  initializeSystem(db);
  seedHumans(db);
}

export function isDatabaseInitialized(): boolean {
  try {
    const db = getDatabase() as any;
    const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employees'");
    return !!stmt.get();
  } catch {
    return false;
  }
}

export function ensureDatabaseInitialized(options?: InitOptions): void {
  if (!isDatabaseInitialized()) {
    const db = getDatabase();
    const schema = readFileSync(getSchemaPath(), 'utf-8');
    db.initialize(schema);
    applyMigrations(db);

    applyWorkDir(db, options?.workDir);
    initializeSystem(db);
    seedHumans(db);
    return;
  }
  const db = getDatabase();
  applyMigrations(db);
  if (options?.workDir) {
    applyWorkDir(db, options.workDir);
    initializeSystem(db, { force: true });
  }
}

export function initializeSystem(db: AIDatabase, options?: { force?: boolean }): void {
  if (initialized && !options?.force) return;

  getConfigService(db);
  getPaths(db);
  getEnvVarService(db).applyToProcessEnv();

  initialized = true;
}

export function resetInitialization(): void {
  initialized = false;
  resetConfigService();
  resetPaths();
  resetEnvVarService();
}

function normalizeWorkDir(workDir?: string): string | undefined {
  if (!workDir) return undefined;
  const trimmed = workDir.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function applyWorkDir(db: AIDatabase, workDir?: string): string | undefined {
  const normalized = normalizeWorkDir(workDir);
  if (!normalized) return undefined;

  process.env.AI_COMPANY_WORKDIR = normalized;
  const config = getConfigService(db);
  config.set('paths.base_dir', {
    value: normalized,
    description: '基础目录（空表示使用默认 ~/.ai-company）',
    category: 'paths',
  });
  resetPaths();
  return normalized;
}
