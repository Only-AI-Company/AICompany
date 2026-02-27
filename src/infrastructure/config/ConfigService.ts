/**
 * AI Company - Configuration Service
 *
 * 统一的配置管理服务（数据库存储）
 */

import type { AIDatabase } from '../database/index.js';

/**
 * 配置值类型
 */
export type ConfigValue = string | number | boolean | object | null;

/**
 * 配置项
 */
export interface ConfigItem {
  key: string;
  value: ConfigValue;
  type: 'string' | 'number' | 'boolean' | 'json' | 'text' | 'file';
  category: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 配置更新选项
 */
export interface ConfigUpdateOptions {
  value: ConfigValue;
  type?: 'string' | 'number' | 'boolean' | 'json' | 'text' | 'file';
  description?: string;
  category?: string;
}

export class ConfigService {
  constructor(private db: AIDatabase) {}

  /**
   * 初始化配置表
   */
  static initialize(db: AIDatabase): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'string',
        category TEXT NOT NULL DEFAULT 'general',
        description TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_config_category ON config(category);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_config_key_category ON config(key, category);
    `);
  }

  /**
   * 解析点号语法的 key
   * @param key "telegram.bot_token" -> { key: "bot_token", category: "telegram" }
   */
  private parseKey(key: string): { key: string; category?: string } {
    if (key.includes('.')) {
      const parts = key.split('.');
      return {
        key: parts.slice(1).join('.'),
        category: parts[0],
      };
    }
    return { key, category: 'general' };
  }

  /**
   * 获取配置值
   */
  get(key: string, defaultValue?: ConfigValue): ConfigValue {
    const { key: actualKey, category } = this.parseKey(key);

    let query = 'SELECT value, type FROM config WHERE key = ?';
    const params: any[] = [actualKey];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    const row = this.db.getDatabase().prepare(query).get(...params);

    if (!row) {
      return defaultValue ?? null;
    }

    return this.parseValue((row as any).value, (row as any).type);
  }

  /**
   * 获取配置项（完整信息）
   */
  getItem(key: string): ConfigItem | null {
    const { key: actualKey, category } = this.parseKey(key);

    let query = 'SELECT key, value, type, category, description, created_at, updated_at FROM config WHERE key = ?';
    const params: any[] = [actualKey];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    const row = this.db.getDatabase().prepare(query).get(...params);

    if (!row) return null;

    const r = row as any;
    return {
      key: r.key,
      value: this.parseValue(r.value, r.type),
      type: r.type,
      category: r.category,
      description: r.description,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  /**
   * 设置配置值
   */
  set(key: string, options: ConfigUpdateOptions | ConfigValue): void {
    const { key: actualKey, category: parsedCategory } = this.parseKey(key);

    let value: ConfigValue;
    let type: 'string' | 'number' | 'boolean' | 'json' | 'text' | 'file';
    let description: string | undefined;
    let category: string | undefined;

    if (typeof options === 'object' && options !== null && 'value' in options) {
      value = (options as ConfigUpdateOptions).value;
      type = (options as ConfigUpdateOptions).type ?? this.inferType(value);
      description = (options as ConfigUpdateOptions).description;
      category = (options as ConfigUpdateOptions).category ?? parsedCategory;
    } else {
      value = options;
      type = this.inferType(value);
      category = parsedCategory;
    }

    const serialized = this.serializeValue(value);

    const existing = this.getItem(key);
    if (existing) {
      // 更新
      let updateQuery = 'UPDATE config SET value = ?, type = ?, updated_at = strftime(\'%s\', \'now\')';
      const params: any[] = [serialized, type];

      if (description) {
        updateQuery += ', description = ?';
        params.push(description);
      }
      if (category) {
        updateQuery += ', category = ?';
        params.push(category);
      }

      updateQuery += ' WHERE key = ?';
      params.push(actualKey);

      if (existing.category) {
        updateQuery += ' AND category = ?';
        params.push(existing.category);
      }

      this.db.getDatabase().prepare(updateQuery).run(...params);
    } else {
      // 插入
      const now = Math.floor(Date.now() / 1000);
      this.db.getDatabase().prepare(`
        INSERT INTO config (key, value, type, category, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(actualKey, serialized, type, category ?? 'general', description ?? null, now, now);
    }
  }

  /**
   * 删除配置
   */
  delete(key: string): boolean {
    const { key: actualKey, category } = this.parseKey(key);

    let query = 'DELETE FROM config WHERE key = ?';
    const params: any[] = [actualKey];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    const result = this.db.getDatabase().prepare(query).run(...params);
    return result.changes > 0;
  }

  /**
   * 按类别获取配置
   */
  getByCategory(category: string): ConfigItem[] {
    const rows = this.db.getDatabase().prepare(`
      SELECT key, value, type, category, description, created_at, updated_at
      FROM config WHERE category = ? ORDER BY key
    `).all(category);

    return (rows as any[]).map(r => ({
      key: r.key,
      value: this.parseValue(r.value, r.type),
      type: r.type,
      category: r.category,
      description: r.description,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  /**
   * 获取所有配置
   */
  getAll(): ConfigItem[] {
    const rows = this.db.getDatabase().prepare(`
      SELECT key, value, type, category, description, created_at, updated_at
      FROM config ORDER BY category, key
    `).all();

    return (rows as any[]).map(r => ({
      key: r.key,
      value: this.parseValue(r.value, r.type),
      type: r.type,
      category: r.category,
      description: r.description,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  /**
   * 批量设置配置
   */
  setMany(configs: Record<string, ConfigValue>): void {
    const db = this.db.getDatabase();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO config (key, value, type, category, updated_at)
      VALUES (?, ?, ?, ?, strftime('%s', 'now'))
    `);

    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(configs)) {
        const parsed = this.parseKey(key);
        stmt.run(
          parsed.key,
          this.serializeValue(value),
          this.inferType(value),
          parsed.category ?? 'general'
        );
      }
    });

    transaction();
  }

  /**
   * 导出配置为 JSON
   */
  export(): Record<string, ConfigValue> {
    const configs = this.getAll();
    const result: Record<string, ConfigValue> = {};
    for (const config of configs) {
      const key = config.category && config.category !== 'general'
        ? `${config.category}.${config.key}`
        : config.key;
      result[key] = config.value;
    }
    return result;
  }

  /**
   * 从 JSON 导入配置
   */
  import(configs: Record<string, ConfigValue>): void {
    this.setMany(configs);
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  /**
   * 推断值的类型
   */
  private inferType(value: ConfigValue): 'string' | 'number' | 'boolean' | 'json' {
    if (value === null) return 'string';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'object') return 'json';
    return 'string';
  }

  /**
   * 序列化值
   */
  private serializeValue(value: ConfigValue): string {
    if (value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  /**
   * 解析值
   */
  private parseValue(value: string, type: string): ConfigValue {
    switch (type) {
      case 'boolean':
        return value === 'true';
      case 'number':
        return Number(value);
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      default:
        return value;
    }
  }
}

// 单例
let configServiceInstance: ConfigService | null = null;

export function getConfigService(db?: AIDatabase): ConfigService {
  if (!configServiceInstance) {
    if (!db) {
      throw new Error('ConfigService requires database on first call');
    }
    ConfigService.initialize(db);
    configServiceInstance = new ConfigService(db);
  }
  return configServiceInstance;
}

export function resetConfigService(): void {
  configServiceInstance = null;
}
