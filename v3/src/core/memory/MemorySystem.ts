/**
 * AI Company v3 - Memory System (Simplified)
 *
 * 简化的记忆系统 - 使用 SQLite 持久化 + 简单相似度检索
 */

import type {
  MemorySystem,
  EpisodicMemory,
  SemanticMemory,
  WorkingMemory,
  MemoryQuery,
  MemorySearchResult,
  MemoryStats,
  MemoryCategory,
} from './types.js';
import { getDatabaseSync } from '../database/index.js';
import { generateId } from '../utils.js';

// ============================================================================
// Memory System Implementation (Simplified)
// ============================================================================

export class MemorySystemImpl implements MemorySystem {
  // 工作记忆（临时）
  private workingMemory: Map<string, WorkingMemory> = new Map();
  private cleanupTimer?: NodeJS.Timeout;
  private dbInstance?: ReturnType<typeof getDatabaseSync>;

  constructor() {
    this.tryInitialize();
    this.startCleanupTimer();
  }

  private tryInitialize(): void {
    try {
      this.dbInstance = getDatabaseSync();
    } catch {
      console.log('[MemorySystem] Database not initialized, running in memory-only mode');
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredWorking();
    }, 60000);
  }

  private get db() {
    if (!this.dbInstance) {
      try {
        this.dbInstance = getDatabaseSync();
      } catch {
        throw new Error('Database not initialized');
      }
    }
    return this.dbInstance;
  }

  // ============================================================================
  // Episodic Memory
  // ============================================================================

  async addEpisodic(
    data: Omit<EpisodicMemory, 'id' | 'createdAt' | 'retrievedCount'>
  ): Promise<string> {
    const id = generateId('mem_ep');
    const now = Date.now();

    this.db.insertEpisodicMemory({
      id,
      task_id: data.taskId,
      task_description: data.taskDescription,
      employee_id: data.employeeId,
      outcome: data.outcome,
      input: data.input,
      output: data.output,
      error: data.error,
      duration: data.duration,
      tools_used: data.toolsUsed ? JSON.stringify(data.toolsUsed) : null,
      learnings: JSON.stringify(data.learnings),
      improvements: JSON.stringify(data.improvements),
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      created_at: now,
    });

    console.log(`[Memory] Added episodic: ${data.taskDescription.substring(0, 50)}...`);
    return id;
  }

  async getEpisodic(memoryId: string): Promise<EpisodicMemory | null> {
    const row = this.db.getEpisodicMemory(memoryId);
    if (!row) return null;
    return this.mapEpisodicRow(row);
  }

  async retrieveEpisodic(
    query: MemoryQuery
  ): Promise<MemorySearchResult<EpisodicMemory>> {
    let rows: any[];

    if (query.timeRange) {
      const sql = `
        SELECT * FROM episodic_memories
        WHERE created_at >= ? AND created_at <= ?
        ORDER BY created_at DESC
        LIMIT ?
      `;
      rows = this.db.prepare(sql).all(
        query.timeRange.from,
        query.timeRange.to,
        query.limit || 100
      );
    } else {
      rows = this.db.prepare(`
        SELECT * FROM episodic_memories
        ORDER BY created_at DESC
        LIMIT ?
      `).all(query.limit || 100);
    }

    const memories = rows.map(r => this.mapEpisodicRow(r));

    // 简单文本匹配评分
    const scores = query.query
      ? this.calculateSimilarity(memories, query.query, ['task_description', 'input', 'output'])
      : memories.map(() => 1.0);

    return { memories, scores, total: memories.length };
  }

  async getEpisodicByTask(taskId: string): Promise<EpisodicMemory[]> {
    const rows = this.db.prepare(`
      SELECT * FROM episodic_memories WHERE task_id = ? ORDER BY created_at DESC
    `).all(taskId);
    return rows.map(r => this.mapEpisodicRow(r));
  }

  async getEpisodicByEmployee(
    employeeId: string,
    limit: number = 50
  ): Promise<EpisodicMemory[]> {
    const rows = this.db.getEpisodicMemoriesByEmployee(employeeId, limit);
    return rows.map(r => this.mapEpisodicRow(r));
  }

  private mapEpisodicRow(row: any): EpisodicMemory {
    return {
      id: row.id,
      taskId: row.task_id,
      taskDescription: row.task_description,
      employeeId: row.employee_id,
      outcome: row.outcome,
      input: row.input,
      output: row.output,
      error: row.error,
      duration: row.duration,
      toolsUsed: row.tools_used ? JSON.parse(row.tools_used) : undefined,
      learnings: JSON.parse(row.learnings) || [],
      improvements: JSON.parse(row.improvements) || [],
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      retrievedCount: 0,
    };
  }

  // ============================================================================
  // Semantic Memory
  // ============================================================================

  async addSemantic(
    data: Omit<SemanticMemory, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>
  ): Promise<string> {
    const id = generateId('mem_sem');
    const now = Date.now();

    this.db.insertSemanticMemory({
      id,
      title: data.title,
      description: data.description,
      category: data.category,
      tags: JSON.stringify(data.tags),
      confidence: data.confidence,
      source: data.source,
      source_memory_id: data.sourceMemoryId || null,
      related_knowledge_ids: data.relatedKnowledgeIds ? JSON.stringify(data.relatedKnowledgeIds) : null,
      created_at: now,
      updated_at: now,
    });

    console.log(`[Memory] Added semantic: ${data.title}`);
    return id;
  }

  async getSemantic(memoryId: string): Promise<SemanticMemory | null> {
    const row = this.db.getSemanticMemory(memoryId);
    if (!row) return null;
    return this.mapSemanticRow(row);
  }

  async retrieveSemantic(
    query: MemoryQuery
  ): Promise<MemorySearchResult<SemanticMemory>> {
    let rows: any[];

    if (query.categories && query.categories.length > 0) {
      const placeholders = query.categories.map(() => '?').join(',');
      const sql = `
        SELECT * FROM semantic_memories
        WHERE category IN (${placeholders})
        ORDER BY usage_count DESC
        LIMIT ?
      `;
      rows = this.db.prepare(sql).all(...query.categories, query.limit || 100);
    } else {
      rows = this.db.prepare(`
        SELECT * FROM semantic_memories
        ORDER BY usage_count DESC
        LIMIT ?
      `).all(query.limit || 100);
    }

    const memories = rows.map(r => this.mapSemanticRow(r));

    // 简单文本匹配评分
    const scores = query.query
      ? this.calculateSimilarity(memories, query.query, ['title', 'description'])
      : memories.map(() => 1.0);

    return { memories, scores, total: memories.length };
  }

  async updateSemanticConfidence(memoryId: string, delta: number): Promise<void> {
    this.db.prepare(`
      UPDATE semantic_memories
      SET confidence = MAX(0, MIN(1, confidence + ?)), updated_at = ?
      WHERE id = ?
    `).run(delta, Date.now(), memoryId);
  }

  async incrementUsage(memoryId: string): Promise<void> {
    this.db.prepare(`
      UPDATE semantic_memories
      SET usage_count = usage_count + 1, last_used_at = ?, updated_at = ?
      WHERE id = ?
    `).run(Date.now(), Date.now(), memoryId);
  }

  private mapSemanticRow(row: any): SemanticMemory {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      tags: JSON.parse(row.tags) || [],
      confidence: row.confidence,
      source: row.source,
      sourceMemoryId: row.source_memory_id,
      relatedKnowledgeIds: row.related_knowledge_ids ? JSON.parse(row.related_knowledge_ids) : undefined,
      usageCount: row.usage_count,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ============================================================================
  // Working Memory
  // ============================================================================

  setWorking(taskId: string, context: Record<string, any>, ttlMs: number = 3600000): void {
    this.workingMemory.set(taskId, {
      taskId,
      context,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    });
  }

  getWorking(taskId: string): WorkingMemory | null {
    const memory = this.workingMemory.get(taskId);
    if (!memory) return null;
    if (memory.expiresAt && Date.now() > memory.expiresAt) {
      this.clearWorking(taskId);
      return null;
    }
    return memory;
  }

  clearWorking(taskId: string): void {
    this.workingMemory.delete(taskId);
  }

  cleanupExpiredWorking(): void {
    const now = Date.now();
    for (const [taskId, memory] of this.workingMemory.entries()) {
      if (memory.expiresAt && now > memory.expiresAt) {
        this.workingMemory.delete(taskId);
      }
    }
  }

  // ============================================================================
  // Memory Extraction
  // ============================================================================

  async extractSemanticFromEpisodic(episodicId: string): Promise<string[]> {
    const episodic = await this.getEpisodic(episodicId);
    if (!episodic) return [];

    const ids: string[] = [];

    for (const learning of episodic.learnings) {
      const id = await this.addSemantic({
        title: `经验：${episodic.taskDescription.substring(0, 30)}`,
        description: learning,
        category: 'best_practice',
        tags: ['experience', episodic.outcome],
        confidence: episodic.outcome === 'success' ? 0.8 : 0.5,
        source: 'extracted',
        sourceMemoryId: episodicId,
      });
      ids.push(id);
    }

    for (const improvement of episodic.improvements) {
      const id = await this.addSemantic({
        title: `注意：${episodic.taskDescription.substring(0, 30)}`,
        description: improvement,
        category: 'warning',
        tags: ['improvement', episodic.outcome],
        confidence: 0.6,
        source: 'extracted',
        sourceMemoryId: episodicId,
      });
      ids.push(id);
    }

    console.log(`[Memory] Extracted ${ids.length} semantics from episodic ${episodicId}`);
    return ids;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  getStats(): MemoryStats {
    const now = Date.now();
    const today = now - 86400000;

    const episodicStats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failure,
        SUM(CASE WHEN outcome = 'partial' THEN 1 ELSE 0 END) as partial,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as today
      FROM episodic_memories
    `).get(today) as any;

    const semanticStats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN category = 'skill' THEN 1 ELSE 0 END) as skill,
        SUM(CASE WHEN category = 'tool' THEN 1 ELSE 0 END) as tool,
        SUM(CASE WHEN category = 'domain' THEN 1 ELSE 0 END) as domain,
        SUM(CASE WHEN category = 'process' THEN 1 ELSE 0 END) as process,
        SUM(CASE WHEN category = 'best_practice' THEN 1 ELSE 0 END) as best_practice,
        SUM(CASE WHEN category = 'warning' THEN 1 ELSE 0 END) as warning,
        SUM(CASE WHEN category = 'tip' THEN 1 ELSE 0 END) as tip
      FROM semantic_memories
    `).get() as any;

    return {
      episodic: {
        total: episodicStats?.total || 0,
        byOutcome: {
          success: episodicStats?.success || 0,
          failure: episodicStats?.failure || 0,
          partial: episodicStats?.partial || 0,
        },
        today: episodicStats?.today || 0,
      },
      semantic: {
        total: semanticStats?.total || 0,
        byCategory: {
          skill: semanticStats?.skill || 0,
          tool: semanticStats?.tool || 0,
          domain: semanticStats?.domain || 0,
          process: semanticStats?.process || 0,
          best_practice: semanticStats?.best_practice || 0,
          warning: semanticStats?.warning || 0,
          tip: semanticStats?.tip || 0,
        },
      },
      working: {
        active: this.workingMemory.size,
      },
    };
  }

  // ============================================================================
  // Helper
  // ============================================================================

  private calculateSimilarity(
    memories: Array<{ [key: string]: any }>,
    query: string,
    fields: string[]
  ): number[] {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);

    return memories.map(memory => {
      let score = 0;
      for (const field of fields) {
        const value = memory[field];
        if (typeof value === 'string') {
          const fieldTerms = value.toLowerCase().split(/\s+/).filter(t => t.length > 1);
          const overlap = queryTerms.filter(t => fieldTerms.includes(t));
          score += overlap.length / Math.max(queryTerms.length, 1);
        }
      }
      return score;
    });
  }
}

// ============================================================================
// Singleton
// ============================================================================

let memorySystemInstance: MemorySystemImpl | null = null;

export function getMemorySystem(): MemorySystem {
  if (!memorySystemInstance) {
    memorySystemInstance = new MemorySystemImpl();
  }
  return memorySystemInstance;
}

export function resetMemorySystem(): void {
  if (memorySystemInstance) {
    clearInterval(memorySystemInstance['cleanupTimer']);
    memorySystemInstance = null;
  }
}
