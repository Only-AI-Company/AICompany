/**
 * 内容存储仓库
 *
 * 职责：
 * 1. 数据库初始化
 * 2. 内容的增删改查
 * 3. 状态管理
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * 内容状态
 */
export type PostStatus = 'draft' | 'pending' | 'published' | 'failed';

/**
 * 内容数据结构
 */
export interface Post {
  id: string;
  topic: string;
  content: string;
  platform: string;
  status: PostStatus;
  tokens?: number;
  model?: string;
  publishedAt?: number;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 创建内容参数
 */
export interface CreatePostParams {
  topic: string;
  content: string;
  platform: string;
  tokens?: number;
  model?: string;
}

export class PostRepository {
  private db: Database.Database;
  private dbPath: string;

  constructor() {
    // 确保 storage 目录存在
    const storageDir = join(process.cwd(), 'storage');
    if (!existsSync(storageDir)) {
      mkdirSync(storageDir, { recursive: true });
    }

    this.dbPath = join(storageDir, 'database.db');
    this.db = new Database(this.dbPath);

    // 启用外键约束
    this.db.pragma('foreign_keys = ON');

    // 初始化表
    this.initTables();
  }

  /**
   * 初始化数据库表
   */
  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        content TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'xiaohongshu',
        status TEXT NOT NULL DEFAULT 'draft',
        tokens INTEGER,
        model TEXT,
        published_at INTEGER,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
      CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
      CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform);
    `);
  }

  /**
   * 创建内容
   */
  create(params: CreatePostParams): Post {
    const id = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO posts (id, topic, content, platform, tokens, model, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      params.topic,
      params.content,
      params.platform,
      params.tokens || null,
      params.model || null,
      now,
      now
    );

    return this.findById(id)!;
  }

  /**
   * 根据 ID 查找
   */
  findById(id: string): Post | null {
    const stmt = this.db.prepare('SELECT * FROM posts WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRowToPost(row) : null;
  }

  /**
   * 查找所有内容
   */
  findAll(options?: { status?: PostStatus; limit?: number }): Post[] {
    let sql = 'SELECT * FROM posts WHERE 1=1';
    const params: any[] = [];

    if (options?.status) {
      sql += ' AND status = ?';
      params.push(options.status);
    }

    sql += ' ORDER BY created_at DESC';

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    return rows.map((row) => this.mapRowToPost(row));
  }

  /**
   * 更新状态
   */
  updateStatus(id: string, status: PostStatus, errorMessage?: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE posts
      SET status = ?, error_message = ?, updated_at = ?
      WHERE id = ?
    `);

    const result = stmt.run(status, errorMessage || null, Date.now(), id);
    return result.changes > 0;
  }

  /**
   * 标记为已发布
   */
  markAsPublished(id: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE posts
      SET status = 'published', published_at = ?, updated_at = ?
      WHERE id = ?
    `);

    const now = Date.now();
    const result = stmt.run(now, now, id);
    return result.changes > 0;
  }

  /**
   * 删除内容
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM posts WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    draft: number;
    pending: number;
    published: number;
    failed: number;
  } {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM posts
    `);

    return stmt.get() as any;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
  }

  /**
   * 映射数据库行到 Post 对象
   */
  private mapRowToPost(row: any): Post {
    return {
      id: row.id,
      topic: row.topic,
      content: row.content,
      platform: row.platform,
      status: row.status,
      tokens: row.tokens,
      model: row.model,
      publishedAt: row.published_at,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
