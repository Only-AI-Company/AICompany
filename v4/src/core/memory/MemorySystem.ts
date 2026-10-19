/**
 * Memory System - 记忆系统
 *
 * 基于 LangChain Memory 和 ChromaDB
 * 参考：
 * - https://js.langchain.com/docs/modules/memory/
 * - https://docs.trychroma.com/
 */

import pino from 'pino';
import type { MemoryType } from '../../types';

// LangChain 类型
import { BaseRetriever } from '@langchain/core/retrievers';
import { Document } from '@langchain/core/documents';
import type { CallbackManagerForRetrieverRun } from '@langchain/core/callbacks/manager';
import { OpenAIEmbeddings } from '@langchain/openai';

// 使用简单的内存存储，不依赖 langchain/vectorstores

export interface MemoryConfig {
  type: MemoryType;
  embeddingModel?: string;
  maxRetries?: number;
}

export interface MemoryRecord {
  id: string;
  type: MemoryType;
  content: string;
  metadata?: Record<string, any>;
  embedding?: number[];
  createdAt: number;
  importance: number;
  accessCount: number;
  lastAccessed: number;
}

export interface SkillStep {
  id: string;
  description: string;
  tool?: string;
  parameters?: Record<string, any>;
}

// ============================================================================
// 情景记忆 - 简化实现，不依赖向量存储
// ============================================================================

export class EpisodicMemory extends BaseRetriever {
  lc_namespace = ['memory', 'episodic'];

  private memories = new Map<string, MemoryRecord>();
  private logger: pino.Logger;
  private embeddings?: OpenAIEmbeddings;

  constructor(config?: { embeddings?: OpenAIEmbeddings }) {
    super();
    this.logger = pino({ name: 'episodic-memory' });
    this.embeddings = config?.embeddings;
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (!this.embeddings) {
      this.embeddings = new OpenAIEmbeddings({
        modelName: 'text-embedding-3-small'
      });
    }
    this.logger.info('Episodic memory initialized');
  }

  /**
   * 存储记忆
   */
  async add(record: Omit<MemoryRecord, 'id' | 'createdAt' | 'accessCount' | 'lastAccessed'>): Promise<string> {
    const id = `ep-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const fullRecord: MemoryRecord = {
      ...record,
      id,
      createdAt: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now()
    };

    this.memories.set(id, fullRecord);
    this.logger.info({ id, type: record.type }, 'Episodic memory added');
    return id;
  }

  /**
   * 检索记忆（简单文本匹配）
   */
  async _getRelevantDocuments(_query: string, _callbacks?: CallbackManagerForRetrieverRun): Promise<Document[]> {
    // 简单返回所有文档，实际可以改进为更好的检索
    const results: Document[] = [];
    for (const record of this.memories.values()) {
      results.push(new Document({
        pageContent: record.content,
        metadata: {
          id: record.id,
          type: record.type,
          importance: record.importance,
          createdAt: record.createdAt,
          ...record.metadata
        }
      }));
    }
    return results;
  }

  /**
   * 按 ID 获取记忆
   */
  async get(id: string): Promise<MemoryRecord | undefined> {
    const record = this.memories.get(id);
    if (record) {
      record.accessCount++;
      record.lastAccessed = Date.now();
      this.memories.set(id, record);
    }
    return record;
  }

  /**
   * 删除记忆
   */
  async delete(id: string): Promise<boolean> {
    const deleted = this.memories.delete(id);
    if (deleted) {
      this.logger.info({ id }, 'Episodic memory deleted');
    }
    return deleted;
  }

  /**
   * 获取所有记忆
   */
  getAll(): MemoryRecord[] {
    return Array.from(this.memories.values());
  }

  /**
   * 清空记忆
   */
  clear(): void {
    this.memories.clear();
    this.logger.info('Episodic memory cleared');
  }

  /**
   * 获取重要记忆
   */
  async getImportantMemories(minImportance = 0.7): Promise<MemoryRecord[]> {
    const all = this.getAll();
    return all.filter(m => m.importance >= minImportance);
  }

  /**
   * 获取最近记忆
   */
  async getRecentMemories(count = 5): Promise<MemoryRecord[]> {
    return this.getAll()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, count);
  }

  /**
   * 遗忘不重要的记忆
   */
  async forget(threshold = 0.3): Promise<number> {
    let count = 0;
    for (const [id, record] of this.memories.entries()) {
      if (record.importance < threshold && record.accessCount === 0) {
        await this.delete(id);
        count++;
      }
    }
    this.logger.info({ count }, 'Memories forgotten');
    return count;
  }
}

// ============================================================================
// 语义记忆 - 结构化知识库
// ============================================================================

export class SemanticMemory {
  private facts = new Map<string, { content: string; category: string; confidence: number; createdAt: number }>();
  private logger: pino.Logger;

  constructor() {
    this.logger = pino({ name: 'semantic-memory' });
  }

  /**
   * 添加事实
   */
  addFact(key: string, content: string, category: string, confidence = 0.9): void {
    this.facts.set(key, { content, category, confidence, createdAt: Date.now() });
    this.logger.info({ key, category }, 'Fact added');
  }

  /**
   * 获取事实
   */
  getFact(key: string): { content: string; category: string; confidence: number } | undefined {
    return this.facts.get(key);
  }

  /**
   * 按分类获取事实
   */
  getFactsByCategory(category: string): { content: string; confidence: number }[] {
    return Array.from(this.facts.values())
      .filter(f => f.category === category)
      .map(f => ({ content: f.content, confidence: f.confidence }));
  }

  /**
   * 更新事实
   */
  updateFact(key: string, content: string, confidence?: number): boolean {
    const fact = this.facts.get(key);
    if (fact) {
      fact.content = content;
      if (confidence !== undefined) {
        fact.confidence = confidence;
      }
      this.facts.set(key, fact);
      return true;
    }
    return false;
  }

  /**
   * 删除事实
   */
  deleteFact(key: string): boolean {
    const deleted = this.facts.delete(key);
    if (deleted) {
      this.logger.info({ key }, 'Fact deleted');
    }
    return deleted;
  }

  /**
   * 查询事实（简单文本匹配）
   */
  query(text: string, limit = 5): { content: string; confidence: number }[] {
    const results = Array.from(this.facts.values())
      .filter(f => f.content.toLowerCase().includes(text.toLowerCase()))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);

    return results.map(r => ({ content: r.content, confidence: r.confidence }));
  }

  /**
   * 获取所有分类
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    this.facts.forEach(f => categories.add(f.category));
    return Array.from(categories);
  }
}

// ============================================================================
// 程序记忆 - 技能和流程
// ============================================================================

export class ProceduralMemory {
  private skills = new Map<string, { steps: SkillStep[]; category: string; mastery: number }>();
  private logger: pino.Logger;

  constructor() {
    this.logger = pino({ name: 'procedural-memory' });
  }

  /**
   * 添加技能
   */
  addSkill(name: string, steps: SkillStep[], category: string): void {
    this.skills.set(name, { steps, category, mastery: 0.5 });
    this.logger.info({ name, category, stepCount: steps.length }, 'Skill added');
  }

  /**
   * 获取技能
   */
  getSkill(name: string): { steps: SkillStep[]; mastery: number } | undefined {
    return this.skills.get(name);
  }

  /**
   * 执行技能
   */
  async executeSkill(name: string, _context: Record<string, any> = {}): Promise<any> {
    const skill = this.skills.get(name);
    if (!skill) {
      throw new Error(`Skill not found: ${name}`);
    }

    this.logger.info({ name }, 'Executing skill');

    const results: any[] = [];
    for (const step of skill.steps) {
      this.logger.info({ step: step.description }, 'Executing step');
      // TODO: 实际执行步骤（可能需要调用工具）
      results.push({ step: step.description, status: 'completed' });
    }

    // 提升熟练度
    skill.mastery = Math.min(1, skill.mastery + 0.1);
    this.skills.set(name, skill);

    return results;
  }

  /**
   * 更新技能熟练度
   */
  updateMastery(name: string, delta: number): void {
    const skill = this.skills.get(name);
    if (skill) {
      skill.mastery = Math.max(0, Math.min(1, skill.mastery + delta));
      this.skills.set(name, skill);
    }
  }

  /**
   * 获取所有技能
   */
  getAllSkills(): { name: string; category: string; mastery: number }[] {
    return Array.from(this.skills.entries()).map(([name, skill]) => ({
      name,
      category: skill.category,
      mastery: skill.mastery
    }));
  }
}

// ============================================================================
// 记忆系统统一接口
// ============================================================================

export class MemorySystem {
  episodic: EpisodicMemory;
  semantic: SemanticMemory;
  procedural: ProceduralMemory;
  private logger: pino.Logger;

  constructor() {
    this.episodic = new EpisodicMemory();
    this.semantic = new SemanticMemory();
    this.procedural = new ProceduralMemory();
    this.logger = pino({ name: 'memory-system' });
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    await this.episodic.initialize();
    this.logger.info('Memory system initialized');
  }

  /**
   * 添加记忆（统一接口）
   */
  async add(type: MemoryType, content: string, metadata?: Record<string, any>): Promise<string> {
    switch (type) {
      case 'episodic':
        return this.episodic.add({ type, content, metadata: metadata || {}, importance: 0.5 });
      case 'semantic':
        // 语义记忆需要 key 和 category
        const key = metadata?.key || `sem-${Date.now()}`;
        const category = metadata?.category || 'general';
        this.semantic.addFact(key, content, category);
        return key;
      case 'procedural':
        // 程序记忆需要技能步骤
        throw new Error('Procedural memory requires skill steps');
      default:
        throw new Error(`Unknown memory type: ${type}`);
    }
  }

  /**
   * 检索记忆
   */
  async query(query: string, type?: MemoryType, limit = 5): Promise<any[]> {
    if (type === 'episodic' || !type) {
      const docs = await this.episodic._getRelevantDocuments(query);
      return docs.map(d => ({ content: d.pageContent, metadata: d.metadata }));
    }

    if (type === 'semantic') {
      const facts = this.semantic.query(query, limit);
      return facts;
    }

    return [];
  }

  /**
   * 获取记忆摘要
   */
  getSummary(): {
    episodic: number;
    semantic: number;
    procedural: number;
  } {
    return {
      episodic: this.episodic.getAll().length,
      semantic: this.semantic.getCategories().length,
      procedural: this.procedural.getAllSkills().length
    };
  }
}
