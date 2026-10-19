/**
 * AI Company v3 - Memory System Types
 *
 * 记忆系统类型定义
 */

// ============================================================================
// Memory Types
// ============================================================================

/**
 * 情景记忆 (Episodic Memory)
 * 存储具体的任务执行历史和经验
 */
export interface EpisodicMemory {
  id: string;
  taskId: string;
  taskDescription: string;
  employeeId: string;
  outcome: 'success' | 'failure' | 'partial';
  input?: string;
  output?: string;
  error?: string;
  duration?: number;
  toolsUsed?: string[];
  learnings: string[];       // 从这次执行中学到了什么
  improvements: string[];    // 可以改进的地方
  metadata?: Record<string, any>;
  createdAt: number;
  retrievedCount: number;    // 被检索次数（用于热度计算）
}

/**
 * 语义记忆 (Semantic Memory)
 * 存储通用知识和最佳实践
 */
export interface SemanticMemory {
  id: string;
  title: string;
  description: string;
  category: MemoryCategory;
  tags: string[];
  confidence: number;        // 0-1，知识可信度
  source: 'review' | 'user' | 'system' | 'extracted';
  sourceMemoryId?: string;   // 来源的情景记忆 ID
  relatedKnowledgeIds?: string[];
  usageCount: number;        // 使用次数
  lastUsedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * 工作记忆 (Working Memory)
 * 当前任务的临时上下文
 */
export interface WorkingMemory {
  taskId: string;
  context: Record<string, any>;
  createdAt: number;
  expiresAt?: number;        // 过期时间
}

export type MemoryCategory =
  | 'skill'           // 技能相关知识
  | 'tool'            // 工具使用知识
  | 'domain'          // 领域知识
  | 'process'         // 流程知识
  | 'best_practice'   // 最佳实践
  | 'warning'         // 警告/陷阱
  | 'tip';            // 技巧

// ============================================================================
// Memory Query
// ============================================================================

export interface MemoryQuery {
  /** 查询文本 */
  query?: string;

  /** 类别过滤 */
  categories?: MemoryCategory[];

  /** 标签过滤 */
  tags?: string[];

  /** 最小置信度 */
  minConfidence?: number;

  /** 最大结果数 */
  limit?: number;

  /** 时间范围 */
  timeRange?: {
    from: number;
    to: number;
  };
}

export interface MemorySearchResult<T> {
  memories: T[];
  scores: number[];    // 相关性分数
  total: number;
}

// ============================================================================
// Memory System Interface
// ============================================================================

export interface MemorySystem {
  // 情景记忆
  addEpisodic(data: Omit<EpisodicMemory, 'id' | 'createdAt' | 'retrievedCount'>): Promise<string>;
  getEpisodic(memoryId: string): Promise<EpisodicMemory | null>;
  retrieveEpisodic(query: MemoryQuery): Promise<MemorySearchResult<EpisodicMemory>>;
  getEpisodicByTask(taskId: string): Promise<EpisodicMemory[]>;
  getEpisodicByEmployee(employeeId: string, limit?: number): Promise<EpisodicMemory[]>;

  // 语义记忆
  addSemantic(data: Omit<SemanticMemory, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): Promise<string>;
  getSemantic(memoryId: string): Promise<SemanticMemory | null>;
  retrieveSemantic(query: MemoryQuery): Promise<MemorySearchResult<SemanticMemory>>;
  updateSemanticConfidence(memoryId: string, delta: number): Promise<void>;
  incrementUsage(memoryId: string): Promise<void>;

  // 工作记忆
  setWorking(taskId: string, context: Record<string, any>, ttlMs?: number): void;
  getWorking(taskId: string): WorkingMemory | null;
  clearWorking(taskId: string): void;
  cleanupExpiredWorking(): void;

  // 记忆提取（从情景记忆提取语义知识）
  extractSemanticFromEpisodic(episodicId: string): Promise<string[]>;

  // 统计
  getStats(): MemoryStats;
}

export interface MemoryStats {
  episodic: {
    total: number;
    byOutcome: Record<'success' | 'failure' | 'partial', number>;
    today: number;
  };
  semantic: {
    total: number;
    byCategory: Record<MemoryCategory, number>;
  };
  working: {
    active: number;
  };
}

