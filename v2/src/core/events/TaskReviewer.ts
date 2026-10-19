/**
 * AI Company v2 - Task Reviewer
 *
 * 任务复盘器 - 负责任务完成后的复盘和员工绩效更新
 *
 * 职责：
 * - 监听 task.completed 事件
 * - 调用 CEO 进行任务复盘
 * - 更新员工绩效
 * - 存储记忆（episodic + semantic）
 * - 发出绩效更新事件
 */

import { getEventBus, type SystemEvent } from './EventBus.js';
import { getCEOSupervisor } from '../supervision/CEOSupervisorAgent.js';
import { getDatabase } from '../../db/Database.js';
import { getMemoryStore } from '../memory/MemoryStore.js';
import { getProvider } from '../ai/AIProvider.js';

export class TaskReviewer {
  private eventBus = getEventBus();
  private db = getDatabase();
  private ceo = getCEOSupervisor();
  private memoryStore = getMemoryStore();
  private provider = getProvider();
  private started = false;

  /**
   * 启动任务复盘器
   */
  start(): void {
    if (this.started) {
      console.log('[TaskReviewer] Already started');
      return;
    }

    console.log('[TaskReviewer] Starting task reviewer...');

    // 订阅任务完成事件
    this.eventBus.on('task.completed' as any, this.handleTaskCompleted.bind(this));

    this.started = true;
    console.log('[TaskReviewer] Task reviewer started');
  }

  /**
   * 停止任务复盘器
   */
  stop(): void {
    if (!this.started) {
      return;
    }

    console.log('[TaskReviewer] Stopping task reviewer...');
    this.started = false;
    console.log('[TaskReviewer] Task reviewer stopped');
  }

  // ---------------------------------------------------------------------------
  // 事件处理
  // ---------------------------------------------------------------------------

  /**
   * 处理任务完成事件
   */
  private async handleTaskCompleted(event: any): Promise<void> {
    const { taskId, employeeId, result, taskDescription, duration } = event;

    console.log(`\n[TaskReviewer] 任务完成，开始复盘...`);

    if (!employeeId) {
      console.warn('[TaskReviewer] 跳过复盘：缺少员工信息');
      return;
    }

    try {
      await this.conductReview(taskId, employeeId, taskDescription, result, duration);
    } catch (error: any) {
      console.error(`[TaskReviewer] 复盘失败：${error.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 复盘逻辑
  // ---------------------------------------------------------------------------

  /**
   * 执行任务复盘
   */
  private async conductReview(
    taskId: string,
    employeeId: string,
    taskDescription: string,
    result: any,
    duration?: number
  ): Promise<void> {
    // CEO 复盘任务
    const review = await this.ceo.reviewTask(
      taskId,
      taskDescription || '未知任务',
      {
        success: result.success,
        output: result.output,
        error: result.error,
        duration,
      }
    );

    console.log(`[TaskReviewer] 复盘结果:`);
    console.log(`  - 评分：${review.score}/10`);
    console.log(`  - 优点：${review.strengths.length}项`);
    console.log(`  - 改进：${review.improvements.length}项`);

    // ==========================================================================
    // 关键步骤：存储记忆
    // ==========================================================================
    await this.storeMemory(taskId, employeeId, taskDescription, result, review);

    // 更新员工绩效
    if (review.shouldUpdatePerformance) {
      const perfUpdate = await this.ceo.updateEmployeePerformance(employeeId, review);

      if (perfUpdate) {
        console.log(`[TaskReviewer] 绩效更新：+${perfUpdate.pointsDelta}分`);
        if (perfUpdate.levelUp) {
          console.log(`[TaskReviewer] 员工升级！`);
        }
      }
    }

    // 更新数据库任务状态
    this.db.updateTaskStatus(taskId, 'completed', {
      output: result.output,
      error: result.error,
    });
  }

  /**
   * 存储记忆（episodic + semantic）
   */
  private async storeMemory(
    taskId: string,
    employeeId: string,
    taskDescription: string,
    result: any,
    review: any
  ): Promise<void> {
    try {
      // 1. 存储情景记忆（episodic memory）
      const episodicId = await this.memoryStore.storeEpisodicMemory({
        taskId,
        taskType: this.determineTaskType(taskDescription),
        taskDescription,
        user_input: taskDescription,
        assignedCXO: employeeId,
        agentId: employeeId,
        toolsUsed: this.extractToolsUsed(result),
        status: result.success ? 'success' : 'failure',
        output: result.output,
        artifacts: result.artifacts,
        reflection: {
          successFactors: review.strengths,
          failureFactors: review.improvements,
          keyDecisions: review.keyDecisions || [],
          learnings: [...review.strengths, ...review.improvements],
        },
      });

      console.log(`[TaskReviewer] 存储情景记忆：${episodicId}`);

      // 2. 如果有可复用的模式，存储语义记忆
      if (review.strengths.length > 0 || review.improvements.length > 0) {
        await this.extractAndStoreSemanticMemory(episodicId, taskDescription, review);
      }
    } catch (error: any) {
      console.error('[TaskReviewer] 存储记忆失败:', error.message);
    }
  }

  /**
   * 确定任务类型
   */
  private determineTaskType(taskDescription: string): 'query' | 'task' | 'goal' | 'script' {
    const input = taskDescription.toLowerCase();

    if (/查询 | 状态 | 多少 | 列表 |list|status/i.test(input)) {
      return 'query';
    }
    if (/目标 | 月 | 周 | 天 | 持续 |goal|target/i.test(input)) {
      return 'goal';
    }
    if (/执行 | 运行 | 命令 | 脚本 |script|command/i.test(input)) {
      return 'script';
    }
    return 'task';
  }

  /**
   * 提取使用的工具
   */
  private extractToolsUsed(result: any): string[] {
    const tools: string[] = [];

    if (result.toolUsage && Array.isArray(result.toolUsage)) {
      for (const usage of result.toolUsage) {
        if (usage.toolName) {
          tools.push(usage.toolName);
        }
      }
    }

    return tools;
  }

  /**
   * 从复盘中提取语义记忆（模式/规则）
   */
  private async extractAndStoreSemanticMemory(
    episodicId: string,
    taskDescription: string,
    review: any
  ): Promise<void> {
    const learnings = [...review.strengths, ...review.improvements].join('\n- ');

    const prompt = `从以下任务复盘中提取可复用的模式/规则：

任务：${taskDescription}
复盘学习：
- ${learnings}

提取 1-3 条通用规则或最佳实践，返回 JSON:
{
  "patterns": [
    {
      "title": "规则标题",
      "description": "规则描述",
      "type": "pattern | rule | skill",
      "tags": ["标签 1", "标签 2"]
    }
  ]
}`;

    try {
      const response = await this.provider.messages(
        [{ role: 'user', content: prompt }],
        '你是一个经验丰富的教练，擅长从具体案例中提取通用模式。只返回 JSON。'
      );

      let content = response.content;
      if (Array.isArray(content)) {
        const textBlocks = content.filter((b: any) => b.type === 'text').map((b: any) => b.text);
        content = textBlocks.join('');
      }

      const result = JSON.parse(content);

      for (const pattern of (result.patterns || [])) {
        await this.memoryStore.storeSemanticMemory({
          memoryType: pattern.type as any,
          title: pattern.title,
          description: pattern.description,
          content: { taskType: 'task', originalTask: taskDescription },
          derivedFrom: episodicId,
          tags: pattern.tags || [],
          confidence: 0.8,
          usageCount: 0,
        });

        console.log(`[TaskReviewer] 存储语义记忆：${pattern.title}`);
      }
    } catch (error: any) {
      console.error('[TaskReviewer] 提取语义记忆失败:', error.message);
    }
  }
}

let reviewerInstance: TaskReviewer | null = null;

export function getTaskReviewer(): TaskReviewer {
  if (!reviewerInstance) {
    reviewerInstance = new TaskReviewer();
  }
  return reviewerInstance;
}

export function resetTaskReviewer(): void {
  if (reviewerInstance) {
    reviewerInstance.stop();
    reviewerInstance = null;
  }
}
