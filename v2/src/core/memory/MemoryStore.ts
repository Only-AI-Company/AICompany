/**
 * 记忆存储系统 - 管理所有记忆的存储和检索
 *
 * 四层记忆系统：
 * - L1: Working Memory (短期工作记忆) - 任务上下文，临时
 * - L2: Episodic Memory (情景记忆) - 完整任务历史
 * - L3: Semantic Memory (语义记忆) - 模式/规则/技能
 * - L4: Procedural Memory (程序记忆) - Agent Prompt 进化
 */

import { getDatabase } from '../../db/Database.js';

/**
 * L2: 情景记忆 - 完整任务记录
 */
export interface EpisodicMemory {
  id: string;
  taskId: string;
  taskType: 'query' | 'task' | 'goal' | 'script';
  taskDescription: string;
  user_input: string;
  assignedCXO?: string;
  agentId?: string;
  toolsUsed?: string[];
  status: 'success' | 'failure' | 'partial';
  output?: string;
  artifacts?: any;
  reflection?: {
    successFactors?: string[];
    failureFactors?: string[];
    keyDecisions?: string[];
    alternativeApproaches?: string[];
    learnings?: string[];
  };
  createdAt: number;
}

/**
 * L3: 语义记忆 - 模式/规则/技能
 */
export interface SemanticMemory {
  id: string;
  memoryType: 'pattern' | 'rule' | 'skill' | 'concept';
  title: string;
  description: string;
  content: any;
  derivedFrom?: string; // episodic_memory_id
  tags?: string[];
  confidence: number;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * L4: 程序记忆 - Agent Prompt 版本
 */
export interface ProceduralMemory {
  id: string;
  employeeId: string;
  taskType: string;
  version: number;
  isActive: boolean;
  systemPrompt: string;
  fewShotExamples?: any[];
  changeSummary?: string;
  performanceDelta?: number;
  createdAt: number;
}

export class MemoryStore {
  private db = getDatabase();

  /**
   * 存储情景记忆（任务完成后自动调用）
   */
  async storeEpisodicMemory(memory: Omit<EpisodicMemory, 'id' | 'createdAt'>): Promise<string> {
    const id = `mem_episodic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.db.prepare(`
      INSERT INTO episodic_memories (
        id, task_id, task_type, task_description, user_input,
        assigned_cxo, agent_id, tools_used, status, output,
        artifacts, reflection_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      memory.taskId,
      memory.taskType,
      memory.taskDescription,
      memory.user_input,
      memory.assignedCXO || null,
      memory.agentId || null,
      JSON.stringify(memory.toolsUsed || []),
      memory.status,
      memory.output || null,
      JSON.stringify(memory.artifacts || {}),
      JSON.stringify(memory.reflection || {}),
      Date.now()
    );

    console.log(`[MemoryStore] 存储情景记忆：${id}`);
    return id;
  }

  /**
   * 检索相似历史任务（用于 CEO 意图分析时的上下文）
   *
   * @param taskDescription 任务描述
   * @param taskType 任务类型（可选）
   * @param limit 最大返回数量
   */
  findSimilarTasks(taskDescription: string, taskType?: string, limit = 5): EpisodicMemory[] {
    // 简单实现：关键词匹配
    // TODO: 使用 Embedding 相似度搜索
    const keywords = taskDescription.split(/[\s,，]+/).filter(w => w.length > 1);

    // 构建 OR 条件
    const conditions = keywords.map(() => 'task_description LIKE ?').join(' OR ');
    const params = keywords.map(k => `%${k}%`);

    let sql = `
      SELECT * FROM episodic_memories
      WHERE status = 'success' AND (${conditions})
      ORDER BY created_at DESC
      LIMIT ?
    `;

    if (taskType) {
      sql = `
        SELECT * FROM episodic_memories
        WHERE status = 'success' AND task_type = ? AND (${conditions})
        ORDER BY created_at DESC
        LIMIT ?
      `;
      params.unshift(taskType);
    }

    params.push(limit.toString());

    try {
      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => this.mapToEpisodicMemory(row));
    } catch (error: any) {
      console.warn('[MemoryStore] 检索相似任务失败:', error.message);
      return [];
    }
  }

  /**
   * 检索相关语义记忆（用于指导决策）
   *
   * @param query 检索条件
   * @param limit 最大返回数量
   */
  findRelevantMemories(query: {
    memoryType?: string;
    tags?: string[];
    taskType?: string;
    minConfidence?: number;
  }, limit = 10): SemanticMemory[] {
    let sql = 'SELECT * FROM semantic_memories WHERE 1=1';
    const params: any[] = [];

    if (query.memoryType) {
      sql += ' AND memory_type = ?';
      params.push(query.memoryType);
    }

    if (query.minConfidence) {
      sql += ' AND confidence >= ?';
      params.push(query.minConfidence);
    }

    if (query.tags && query.tags.length > 0) {
      // 简单实现：tags 字段包含任一关键词
      const tagConditions = query.tags.map(() => 'tags LIKE ?').join(' OR ');
      sql += ` AND (${tagConditions})`;
      query.tags.forEach(tag => params.push(`%${tag}%`));
    }

    sql += ' ORDER BY confidence DESC, usage_count DESC LIMIT ?';
    params.push(limit.toString());

    try {
      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => this.mapToSemanticMemory(row));
    } catch (error: any) {
      console.warn('[MemoryStore] 检索语义记忆失败:', error.message);
      return [];
    }
  }

  /**
   * 存储语义记忆（从任务反思中提取）
   */
  async storeSemanticMemory(memory: Omit<SemanticMemory, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = `mem_semantic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO semantic_memories (
        id, memory_type, title, description, content_json,
        derived_from, tags, confidence, usage_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      memory.memoryType,
      memory.title,
      memory.description,
      JSON.stringify(memory.content),
      memory.derivedFrom || null,
      JSON.stringify(memory.tags || []),
      memory.confidence,
      memory.usageCount || 0,
      now,
      now
    );

    console.log(`[MemoryStore] 存储语义记忆：${id}`);
    return id;
  }

  /**
   * 获取 Agent 的活跃 Prompt（程序记忆）
   */
  getActivePrompt(employeeId: string, taskType: string): ProceduralMemory | null {
    const row = this.db.prepare(`
      SELECT * FROM procedural_memories
      WHERE employee_id = ? AND task_type = ? AND is_active = 1
      ORDER BY version DESC
      LIMIT 1
    `).get(employeeId, taskType) as any;

    if (!row) return null;
    return this.mapToProceduralMemory(row);
  }

  /**
   * 存储程序记忆（Prompt 版本）
   */
  async storeProceduralMemory(memory: Omit<ProceduralMemory, 'id' | 'createdAt'>): Promise<string> {
    const id = `mem_procedural_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.db.prepare(`
      INSERT INTO procedural_memories (
        id, employee_id, task_type, version, is_active,
        system_prompt, few_shot_examples, change_summary, performance_delta, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      memory.employeeId,
      memory.taskType,
      memory.version,
      memory.isActive ? 1 : 0,
      memory.systemPrompt,
      JSON.stringify(memory.fewShotExamples || []),
      memory.changeSummary || null,
      memory.performanceDelta || null,
      Date.now()
    );

    console.log(`[MemoryStore] 存储程序记忆：${id}`);
    return id;
  }

  /**
   * 更新 Agent Prompt 为活跃版本
   */
  activatePrompt(employeeId: string, taskType: string, version: number): void {
    this.db.prepare(`
      UPDATE procedural_memories
      SET is_active = 0
      WHERE employee_id = ? AND task_type = ?
    `).run(employeeId, taskType);

    this.db.prepare(`
      UPDATE procedural_memories
      SET is_active = 1
      WHERE employee_id = ? AND task_type = ? AND version = ?
    `).run(employeeId, taskType, version);
  }

  /**
   * 记录记忆使用情况（用于更新置信度）
   */
  recordUsage(memoryId: string, success: boolean): void {
    const delta = success ? 1 : -1;
    this.db.prepare(`
      UPDATE semantic_memories
      SET usage_count = usage_count + 1,
          confidence = MIN(1.0, MAX(0.0, confidence + ? * 0.01)),
          updated_at = ?
      WHERE id = ?
    `).run(delta, Date.now(), memoryId);
  }

  // ===========================================================================
  // Helper 方法
  // ===========================================================================

  private mapToEpisodicMemory(row: any): EpisodicMemory {
    return {
      id: row.id,
      taskId: row.task_id,
      taskType: row.task_type as EpisodicMemory['taskType'],
      taskDescription: row.task_description,
      user_input: row.user_input,
      assignedCXO: row.assigned_cxo,
      agentId: row.agent_id,
      toolsUsed: JSON.parse(row.tools_used || '[]'),
      status: row.status as EpisodicMemory['status'],
      output: row.output,
      artifacts: JSON.parse(row.artifacts || '{}'),
      reflection: JSON.parse(row.reflection_json || '{}'),
      createdAt: row.created_at,
    };
  }

  private mapToSemanticMemory(row: any): SemanticMemory {
    return {
      id: row.id,
      memoryType: row.memory_type as SemanticMemory['memoryType'],
      title: row.title,
      description: row.description,
      content: JSON.parse(row.content_json),
      derivedFrom: row.derived_from,
      tags: JSON.parse(row.tags || '[]'),
      confidence: row.confidence,
      usageCount: row.usage_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapToProceduralMemory(row: any): ProceduralMemory {
    return {
      id: row.id,
      employeeId: row.employee_id,
      taskType: row.task_type,
      version: row.version,
      isActive: row.is_active === 1,
      systemPrompt: row.system_prompt,
      fewShotExamples: JSON.parse(row.few_shot_examples || '[]'),
      changeSummary: row.change_summary,
      performanceDelta: row.performance_delta,
      createdAt: row.created_at,
    };
  }
}

// ===========================================================================
// 单例
// ===========================================================================

let memoryStoreInstance: MemoryStore | null = null;

export function getMemoryStore(): MemoryStore {
  if (!memoryStoreInstance) {
    memoryStoreInstance = new MemoryStore();
  }
  return memoryStoreInstance;
}

export function resetMemoryStore(): void {
  memoryStoreInstance = null;
}
