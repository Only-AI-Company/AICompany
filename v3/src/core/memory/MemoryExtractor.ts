/**
 * AI Company v3 - Memory Extractor
 *
 * 记忆提取器
 *
 * 职责：
 * 1. 从复盘结果中提取情景记忆（Episodic Memory）
 * 2. 从复盘结果中提取语义记忆（Semantic Memory）
 * 3. 智能分类和标签生成
 * 4. 记忆去重和合并
 */

import type { Review, Task, TaskResult, EpisodicMemory, SemanticMemory } from '../types.js';
import { getAIProvider } from '../ai/AIProvider.js';
import { parseJSON } from '../utils.js';
import { getDatabase, getDatabaseSync } from '../database/index.js';
import { generateId } from '../utils.js';

// ============================================================================
// Types
// ============================================================================

export interface MemoryExtractResult {
  episodicMemories: ExtractedEpisodicMemory[];
  semanticMemories: ExtractedSemanticMemory[];
}

export interface ExtractedEpisodicMemory {
  taskId: string;
  taskDescription: string;
  employeeId: string;
  outcome: 'success' | 'failure' | 'partial';
  input?: string;
  output?: string;
  error?: string;
  duration?: number;
  toolsUsed?: string[];
  learnings: string[];
  improvements: string[];
  metadata?: Record<string, any>;
}

export interface ExtractedSemanticMemory {
  title: string;
  description: string;
  category: string;
  tags: string[];
  confidence: number;
  source: 'review' | 'user' | 'system' | 'extracted';
  sourceMemoryId?: string;
  learnings: string[];
}

// ============================================================================
// Memory Extractor
// ============================================================================

export class MemoryExtractor {
  private aiProvider = getAIProvider();
  private db?: ReturnType<typeof getDatabaseSync>;

  constructor() {
    try {
      this.db = getDatabaseSync();
    } catch (error: any) {
      console.log('[MemoryExtractor] Database not yet initialized');
    }
  }

  /**
   * 从复盘中提取记忆
   *
   * @param review 复盘结果
   * @param task 任务信息
   * @param result 任务结果
   * @returns 提取的记忆
   */
  async extractFromReview(
    review: Review,
    task: Task,
    result: TaskResult
  ): Promise<MemoryExtractResult> {
    console.log(`[MemoryExtractor] Extracting memories from review of task ${task.id}`);

    try {
      // 使用 LLM 分析并提取记忆
      const extracted = await this.analyzeWithLLM(review, task, result);

      // 去重和验证
      const episodicMemories = await this.deduplicateEpisodic(extracted.episodicMemories);
      const semanticMemories = await this.deduplicateSemantic(extracted.semanticMemories);

      console.log(
        `[MemoryExtractor] Extracted ${episodicMemories.length} episodic, ${semanticMemories.length} semantic memories`
      );

      return {
        episodicMemories,
        semanticMemories,
      };
    } catch (error: any) {
      console.error('[MemoryExtractor] Failed to extract memories:', error.message);

      // Fallback: 简单提取
      return this.fallbackExtraction(review, task, result);
    }
  }

  /**
   * 使用 LLM 分析复盘并提取记忆
   */
  private async analyzeWithLLM(
    review: Review,
    task: Task,
    result: TaskResult
  ): Promise<MemoryExtractResult> {
    const systemPrompt = `你是 AI Company 的记忆提取专家。

你的职责是从任务复盘中提取有价值的记忆。

请分析任务复盘，返回 JSON 格式：
{
  "episodicMemories": [
    {
      "outcome": "success|failure|partial",
      "toolsUsed": ["tool1", "tool2"],
      "learnings": ["具体学到的东西1", "具体学到的东西2"],
      "improvements": ["可以改进的地方1", "可以改进的地方2"],
      "metadata": {"key": "value"}
    }
  ],
  "semanticMemories": [
    {
      "title": "简短标题",
      "description": "详细描述这个知识点",
      "category": "技术|流程|策略|沟通|其他",
      "tags": ["标签1", "标签2"],
      "confidence": 0.9,
      "learnings": ["知识点1", "知识点2"]
    }
  ]
}

提取原则：
1. 情景记忆（episodic）：记录具体的任务经验，包括什么有效、什么无效
2. 语义记忆（semantic）：提取通用的知识、规则、最佳实践
3. confidence 基于复盘评分：9-10分=0.9-1.0, 7-8分=0.7-0.9, 5-6分=0.5-0.7, <5分=0.3-0.5
4. 避免重复已有记忆（如果发现相同内容，降低 confidence）
5. 优先提取可复用的知识和经验`;

    const outputPreview = result.output?.substring(0, 500) || '无';
    const userPrompt = `任务：${task.description}
评分：${review.score}/10
优点：${review.strengths.join(', ')}
改进点：${review.improvements.join(', ')}
经验教训：${review.learnings.join(', ')}
结果：${result.success ? '成功' : '失败'}
输出预览：${outputPreview}
${result.error ? `错误：${result.error}` : ''}

请从这次复盘中提取有价值的记忆。`;

    const response = await this.aiProvider.prompt(userPrompt, systemPrompt);

    // 提取文本内容
    const content = typeof response.content === 'string'
      ? response.content
      : response.getText?.() || JSON.stringify(response.content);

    // 解析 JSON
    const extracted = parseJSON(content);

    // 构建情景记忆
    const episodicMemories: ExtractedEpisodicMemory[] = (extracted.episodicMemories || []).map((m: any) => ({
      taskId: task.id,
      taskDescription: task.description,
      employeeId: task.employeeId || 'unknown',
      outcome: m.outcome || (result.success ? 'success' : 'failure'),
      input: task.input,
      output: result.output,
      error: result.error,
      duration: result.duration,
      toolsUsed: m.toolsUsed || [],
      learnings: m.learnings || review.learnings,
      improvements: m.improvements || review.improvements,
      metadata: {
        ...m.metadata,
        score: review.score,
        strengthCount: review.strengths.length,
        improvementCount: review.improvements.length,
      },
    }));

    // 构建语义记忆
    const semanticMemories: ExtractedSemanticMemory[] = (extracted.semanticMemories || []).map((m: any) => ({
      title: m.title || '未命名知识',
      description: m.description || '',
      category: m.category || '技术',
      tags: m.tags || [],
      confidence: m.confidence || 0.7,
      source: 'extracted' as const,
      learnings: m.learnings || [],
    }));

    return { episodicMemories, semanticMemories };
  }

  /**
   * 简单提取（Fallback）
   */
  private fallbackExtraction(
    review: Review,
    task: Task,
    result: TaskResult
  ): MemoryExtractResult {
    const outcome: 'success' | 'failure' | 'partial' = result.success ? 'success' : 'failure';

    // 情景记忆
    const episodicMemory: ExtractedEpisodicMemory = {
      taskId: task.id,
      taskDescription: task.description,
      employeeId: task.employeeId || 'unknown',
      outcome,
      input: task.input,
      output: result.output,
      error: result.error,
      duration: result.duration,
      toolsUsed: [],
      learnings: review.learnings,
      improvements: review.improvements,
      metadata: {
        score: review.score,
        extractedVia: 'fallback',
      },
    };

    // 语义记忆 - 从优点中提取
    const semanticMemories: ExtractedSemanticMemory[] = [];

    if (review.score >= 7 && review.strengths.length > 0) {
      semanticMemories.push({
        title: `有效方法：${task.description.substring(0, 30)}`,
        description: `在任务"${task.description}"中，以下方法被证明有效：${review.strengths.join('、')}`,
        category: '最佳实践',
        tags: ['effective', task.employeeId || 'unknown'],
        confidence: Math.min(0.9, review.score / 10),
        source: 'review',
        learnings: review.strengths,
      });
    }

    if (review.score < 7 && review.improvements.length > 0) {
      semanticMemories.push({
        title: `需要改进：${task.description.substring(0, 30)}`,
        description: `在任务"${task.description}"中，发现以下需要改进的地方：${review.improvements.join('、')}`,
        category: '改进建议',
        tags: ['improvement', task.employeeId || 'unknown'],
        confidence: Math.min(0.8, (10 - review.score) / 10),
        source: 'review',
        learnings: review.improvements,
      });
    }

    return {
      episodicMemories: [episodicMemory],
      semanticMemories,
    };
  }

  /**
   * 情景记忆去重
   *
   * 检查是否有相似的任务记忆已存在
   */
  private async deduplicateEpisodic(
    memories: ExtractedEpisodicMemory[]
  ): Promise<ExtractedEpisodicMemory[]> {
    if (!this.db) return memories;

    const unique: ExtractedEpisodicMemory[] = [];

    for (const memory of memories) {
      // 简单去重：检查最近是否有相同任务的记忆
      const existing = this.db.getEpisodicMemoryIdsByTask(memory.taskId);

      if (existing.length === 0) {
        unique.push(memory);
      } else {
        console.log(`[MemoryExtractor] Skipping duplicate episodic memory for task ${memory.taskId}`);
      }
    }

    return unique;
  }

  /**
   * 语义记忆去重
   *
   * 检查是否有相似的语义记忆已存在
   */
  private async deduplicateSemantic(
    memories: ExtractedSemanticMemory[]
  ): Promise<ExtractedSemanticMemory[]> {
    if (!this.db) return memories;

    const unique: ExtractedSemanticMemory[] = [];

    for (const memory of memories) {
      // 获取所有语义记忆
      const allMemories = this.db.getAllSemanticMemories();

      // 检查是否有相似的记忆（简单的标题相似度检查）
      const similar = allMemories.find((m: any) => {
        const existingTitle = m.title?.toLowerCase() || '';
        const newTitle = memory.title.toLowerCase();
        return existingTitle.includes(newTitle.substring(0, 10)) ||
               newTitle.includes(existingTitle.substring(0, 10));
      });

      if (!similar) {
        unique.push(memory);
      } else {
        console.log(`[MemoryExtractor] Merging similar semantic memory: ${memory.title}`);
        // TODO: 实现记忆合并逻辑
      }
    }

    return unique;
  }

  /**
   * 保存提取的记忆到数据库
   */
  async saveMemories(result: MemoryExtractResult): Promise<void> {
    if (!this.db) {
      console.warn('[MemoryExtractor] No database available, skipping memory save');
      return;
    }

    const now = Date.now();

    // 保存情景记忆
    for (const episodic of result.episodicMemories) {
      try {
        this.db.insertEpisodicMemory({
          id: generateId('episodic'),
          task_id: episodic.taskId,
          task_description: episodic.taskDescription,
          employee_id: episodic.employeeId,
          outcome: episodic.outcome,
          input: episodic.input,
          output: episodic.output,
          error: episodic.error,
          duration: episodic.duration,
          tools_used: episodic.toolsUsed ? JSON.stringify(episodic.toolsUsed) : undefined,
          learnings: JSON.stringify(episodic.learnings),
          improvements: JSON.stringify(episodic.improvements),
          metadata: episodic.metadata ? JSON.stringify(episodic.metadata) : undefined,
          created_at: now,
        });
        console.log(`[MemoryExtractor] Saved episodic memory for task ${episodic.taskId}`);
      } catch (error: any) {
        console.error('[MemoryExtractor] Failed to save episodic memory:', error.message);
      }
    }

    // 保存语义记忆
    for (const semantic of result.semanticMemories) {
      try {
        this.db.insertSemanticMemory({
          id: generateId('semantic'),
          title: semantic.title,
          description: semantic.description,
          category: semantic.category,
          tags: JSON.stringify(semantic.tags),
          confidence: semantic.confidence,
          source: semantic.source,
          source_memory_id: semantic.sourceMemoryId,
          related_knowledge_ids: undefined,
          usage_count: 0,
          created_at: now,
          updated_at: now,
        });
        console.log(`[MemoryExtractor] Saved semantic memory: ${semantic.title}`);
      } catch (error: any) {
        console.error('[MemoryExtractor] Failed to save semantic memory:', error.message);
      }
    }

    // 发出记忆提取事件
    if (result.episodicMemories.length > 0 || result.semanticMemories.length > 0) {
      // TODO: 通过 EventBus 发出事件
      console.log(
        `[MemoryExtractor] Memory extraction complete: ${result.episodicMemories.length} episodic, ${result.semanticMemories.length} semantic`
      );
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let memoryExtractorInstance: MemoryExtractor | null = null;

export function getMemoryExtractor(): MemoryExtractor {
  if (!memoryExtractorInstance) {
    memoryExtractorInstance = new MemoryExtractor();
  }
  return memoryExtractorInstance;
}

export function resetMemoryExtractor(): void {
  memoryExtractorInstance = null;
}
