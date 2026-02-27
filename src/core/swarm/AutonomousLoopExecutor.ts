/**
 * AI Company - Autonomous Loop Executor
 *
 * 自主循环执行器：让 AI 完全自主地分析、执行、检查、改进
 * 直到任务解决或超时
 *
 * 核心理念：
 * - 不预设任务类型（代码、文档、运营、分析...）
 * - 不预设角色和步骤
 * - AI 自主决定需要什么、做什么、怎么做
 * - 形成完整闭环：分析 → 执行 → 检查 → 改进 → 循环
 */

import type { AIDatabase } from '../../infrastructure/database/index.js';
import type { Task, Employee } from '../../types/index.js';
import { getClaudeCLIManager } from '../../infrastructure/claude/index.js';
import { getHookSystem } from '../runtime/HookSystem.js';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// 类型定义
// ============================================================================

/** 循环状态 */
export type LoopState =
  | 'analyzing'      // 分析任务
  | 'planning'        // 制定计划
  | 'executing'       // 执行中
  | 'reviewing'       // 检查结果
  | 'improving'       // 改进中
  | 'completed'       // 完成
  | 'failed'          // 失败
  | 'timeout';        // 超时

/** 循环迭代结果 */
export interface LoopIteration {
  iteration: number;
  state: LoopState;
  timestamp: number;
  duration: number;
  aiDecision: {
    currentState: string;
    nextAction: string;
    reasoning: string;
    needsMoreWork: boolean;
    completionPercentage: number;
  };
  output?: string;
  error?: string;
}

/** 执行结果 */
export interface AutonomousExecutionResult {
  success: boolean;
  iterations: LoopIteration[];
  finalOutput: string;
  totalDuration: number;
  completionReason: 'success' | 'max_iterations' | 'timeout' | 'error';
  metadata: {
    totalIterations: number;
    averageIterationDuration: number;
    finalCompletionPercentage: number;
  };
}

/** 配置 */
export interface AutonomousConfig {
  taskId: string;
  taskDescription: string;
  workDir?: string;
  /** 最大迭代次数 */
  maxIterations?: number;
  /** 超时时间（毫秒），默认 30 分钟 */
  timeout?: number;
  /** 超时通知回调 */
  onTimeout?: (reason: string) => void;
}

// ============================================================================
// AutonomousLoopExecutor
// ============================================================================

export class AutonomousLoopExecutor {
  private hookSystem = getHookSystem();
  private iterations: LoopIteration[] = [];

  // 默认配置
  private readonly DEFAULT_MAX_ITERATIONS = 10;
  private readonly DEFAULT_TIMEOUT = 30 * 60 * 1000; // 30 分钟

  constructor(
    private db: AIDatabase,
    private claude = getClaudeCLIManager()
  ) {}

  /**
   * 执行自主循环
   */
  async execute(config: AutonomousConfig): Promise<AutonomousExecutionResult> {
    const startTime = Date.now();
    const maxIterations = config.maxIterations || this.DEFAULT_MAX_ITERATIONS;
    const timeout = config.timeout || this.DEFAULT_TIMEOUT;
    const workDir = config.workDir || this.createWorkDirectory(config.taskId);

    // 准备工作目录
    if (!existsSync(workDir)) {
      mkdirSync(workDir, { recursive: true });
    }

    console.log(`\n🔄 Autonomous Loop Executor 启动`);
    console.log(`   任务：${config.taskDescription.slice(0, 60)}...`);
    console.log(`   最大迭代：${maxIterations} 次`);
    console.log(`   超时：${Math.round(timeout / 60000)} 分钟`);
    console.log(`   工作目录：${workDir}\n`);

    let currentState: LoopState = 'analyzing';
    let context = this.buildInitialContext(config);
    let finalOutput = '';

    // 迭代循环
    for (let i = 1; i <= maxIterations; i++) {
      const iterationStart = Date.now();
      const elapsed = iterationStart - startTime;

      // 检查超时
      if (elapsed > timeout) {
        console.log(`\n⏰ 超时！已运行 ${Math.round(elapsed / 60000)} 分钟`);
        this.triggerTimeoutNotification(config, elapsed);

        this.recordIteration({
          iteration: i,
          state: 'timeout',
          timestamp: iterationStart,
          duration: 0,
          aiDecision: {
            currentState: '执行中',
            nextAction: '超时终止',
            reasoning: `超过最大时长 ${Math.round(timeout / 60000)} 分钟`,
            needsMoreWork: true,
            completionPercentage: this.estimateCompletion(context),
          },
        });

        return {
          success: false,
          iterations: this.iterations,
          finalOutput,
          totalDuration: elapsed,
          completionReason: 'timeout',
          metadata: this.buildMetadata(elapsed),
        };
      }

      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🔄 迭代 #${i} - ${currentState.toUpperCase()}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      // 执行当前状态
      const result = await this.executeState(currentState, context, config, workDir);

      const iterationDuration = Date.now() - iterationStart;

      // 记录迭代
      this.recordIteration({
        iteration: i,
        state: currentState,
        timestamp: iterationStart,
        duration: iterationDuration,
        aiDecision: result.decision,
        output: result.output,
        error: result.error,
      });

      // 更新上下文
      context = this.updateContext(context, result, workDir);

      // 检查是否完成
      if (result.decision.completionPercentage >= 100) {
        console.log(`\n✅ 任务完成！`);
        finalOutput = result.output || '';

        return {
          success: true,
          iterations: this.iterations,
          finalOutput,
          totalDuration: Date.now() - startTime,
          completionReason: 'success',
          metadata: this.buildMetadata(Date.now() - startTime),
        };
      }

      // 更新状态
      currentState = this.getNextState(currentState, result.decision);

      // 保存中间结果
      this.saveIterationState(workDir, i, result);

      console.log(`   进度：${result.decision.completionPercentage}%`);
      console.log(`   下一步：${result.decision.nextAction}`);
      console.log(`   理由：${result.decision.reasoning}`);
    }

    // 达到最大迭代次数
    console.log(`\n⚠️  达到最大迭代次数 (${maxIterations})`);

    return {
      success: false,
      iterations: this.iterations,
      finalOutput: context.lastOutput || '',
      totalDuration: Date.now() - startTime,
      completionReason: 'max_iterations',
      metadata: this.buildMetadata(Date.now() - startTime),
    };
  }

  /**
   * 执行当前状态
   */
  private async executeState(
    state: LoopState,
    context: any,
    config: AutonomousConfig,
    workDir: string
  ): Promise<{ decision: any; output?: string; error?: string }> {
    const prompt = this.buildStatePrompt(state, context, config, workDir);

    try {
      const output = await this.claude.prompt(prompt, {
        print: true,
        cwd: workDir,
        outputFormat: 'json',
      });

      // 解析 AI 决策
      const decision = this.parseAIDecision(output);

      return { decision, output };
    } catch (error: any) {
      return {
        decision: {
          currentState: state,
          nextAction: '重试',
          reasoning: `执行失败: ${error.message}`,
          needsMoreWork: true,
          completionPercentage: this.estimateCompletion(context),
        },
        error: error.message,
      };
    }
  }

  /**
   * 构建状态提示词
   */
  private buildStatePrompt(
    state: LoopState,
    context: any,
    config: AutonomousConfig,
    workDir: string
  ): string {
    const stateInstructions: Record<LoopState, string> = {
      analyzing: `
【当前阶段：分析任务】

请深入分析任务需求，确定：
1. 任务的本质和目标
2. 需要什么样的产出（代码/文档/运营内容/分析报告等）
3. 可能涉及的技术栈或工具
4. 潜在的挑战和风险
5. 预估的工作量

返回 JSON 格式的分析结果。`,

      planning: `
【当前阶段：制定计划】

根据任务分析，制定详细的执行计划：
1. 将任务分解为具体的步骤
2. 确定每个步骤的交付物
3. 估算每个步骤的时间
4. 识别步骤之间的依赖关系
5. 规划验证和检查点

返回 JSON 格式的计划。`,

      executing: `
【当前阶段：执行任务】

根据计划执行当前步骤：
1. 使用合适的工具和方法
2. 创建必要的文件
3. 产出高质量的交付物
4. 记录执行过程

完成任务后，说明已完成的工作和产出。`,

      reviewing: `
【当前阶段：检查结果】

严格检查已完成的工作：
1. 对照任务需求，检查是否满足
2. 检查产出的质量
3. 识别任何问题或缺陷
4. 评估完成度 (0-100%)
5. 决定是否需要改进

给出详细的检查结论。`,

      improving: `
【当前阶段：改进优化】

根据检查结果，进行改进：
1. 针对发现的问题进行修复
2. 优化产出的质量
3. 补充缺失的部分
4. 提升整体完成度

说明改进的内容和效果。`,

      completed: '任务已完成',
      failed: '任务失败，将重新分析',
      timeout: '执行超时',
    };

    // 读取已有的文件列表
    const existingFiles = this.getExistingFiles(workDir);

    return `# AI 自主执行循环

你是一个完全自主的 AI 执行者。你的目标是从头到尾完成一个任务，不依赖人类的指令。

## 任务
${config.taskDescription}

## 当前状态
${stateInstructions[state]}

## 已完成的工作
${context.completedSteps || '无'}

## 上次输出
${context.lastOutput || '无'}

## 工作目录中的文件
${existingFiles.length > 0 ? existingFiles.join('\n') : '(空)'}

## 进度
当前完成度：${this.estimateCompletion(context)}%
已迭代次数：${this.iterations.length}

---

【输出格式】（严格 JSON）
\`\`\`json
{
  "currentState": "当前状态描述",
  "nextAction": "下一步要做什么",
  "reasoning": "决策理由",
  "needsMoreWork": true/false,
  "completionPercentage": 0-100,
  "output": "当前的产出内容（如果有）"
}
\`\`\`

请根据当前状态执行相应的工作，然后返回 JSON 格式的决策。`;
  }

  /**
   * 解析 AI 决策
   */
  private parseAIDecision(output: string): any {
    try {
      const jsonMatch = output.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
                        output.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
    } catch (error) {
      // 解析失败
    }

    // 降级处理
    return {
      currentState: 'unknown',
      nextAction: '继续',
      reasoning: '无法解析 AI 决策，继续执行',
      needsMoreWork: true,
      completionPercentage: 50,
    };
  }

  /**
   * 获取下一个状态
   */
  private getNextState(currentState: LoopState, decision: any): LoopState {
    if (decision.completionPercentage >= 100) {
      return 'completed';
    }

    const stateFlow: Record<LoopState, LoopState> = {
      'analyzing': 'planning',
      'planning': 'executing',
      'executing': 'reviewing',
      'reviewing': decision.needsMoreWork ? 'improving' : 'completed',
      'improving': 'reviewing',
      'completed': 'completed',
      'failed': 'analyzing', // 失败后重新分析
      'timeout': 'timeout',
    };

    return stateFlow[currentState] || 'analyzing';
  }

  /**
   * 构建初始上下文
   */
  private buildInitialContext(config: AutonomousConfig): any {
    return {
      taskId: config.taskId,
      taskDescription: config.taskDescription,
      completedSteps: '',
      lastOutput: '',
      startTime: Date.now(),
    };
  }

  /**
   * 更新上下文
   */
  private updateContext(context: any, result: any, workDir: string): any {
    return {
      ...context,
      completedSteps: (context.completedSteps || '') +
        (result.decision.currentState ? `\n- ${result.decision.currentState}: ${result.decision.nextAction}` : ''),
      lastOutput: result.output || context.lastOutput,
      lastState: result.decision.currentState,
    };
  }

  /**
   * 估算完成度
   */
  private estimateCompletion(context: any): number {
    if (this.iterations.length === 0) return 0;
    const lastIteration = this.iterations[this.iterations.length - 1];
    return lastIteration.aiDecision?.completionPercentage || 0;
  }

  /**
   * 触发超时通知
   */
  private triggerTimeoutNotification(config: AutonomousConfig, elapsed: number): void {
    const message = `
⏰ AI Company 任务执行超时提醒

任务：${config.taskDescription.slice(0, 50)}...
已运行：${Math.round(elapsed / 60000)} 分钟
状态：仍在执行中

请检查任务是否需要人工干预。
    `.trim();

    console.log(`\n${message}`);

    // 触发 Hook
    this.hookSystem.emit('execution:timeout', {
      taskId: config.taskId,
      duration: elapsed,
      message,
    });

    // 调用用户自定义回调
    if (config.onTimeout) {
      config.onTimeout(message);
    }
  }

  /**
   * 记录迭代
   */
  private recordIteration(iteration: LoopIteration): void {
    this.iterations.push(iteration);

    // 触发 Hook
    this.hookSystem.emit('execution:iteration', iteration);
  }

  /**
   * 保存迭代状态
   */
  private saveIterationState(workDir: string, iteration: number, result: any): void {
    try {
      const stateFile = join(workDir, `iteration-${iteration}.json`);
      writeFileSync(stateFile, JSON.stringify({
        iteration,
        timestamp: Date.now(),
        decision: result.decision,
        output: result.output,
      }, null, 2), 'utf-8');
    } catch (error) {
      console.error(`保存迭代状态失败:`, error);
    }
  }

  /**
   * 获取现有文件列表
   */
  private getExistingFiles(workDir: string): string[] {
    try {
      const { readdirSync } = require('fs');
      if (!existsSync(workDir)) return [];
      return readdirSync(workDir);
    } catch {
      return [];
    }
  }

  /**
   * 创建工作目录
   */
  private createWorkDirectory(taskId: string): string {
    const { homedir } = require('os');
    const { join } = require('path');
    return join(homedir(), '.ai-company', 'outputs', 'tasks', taskId);
  }

  /**
   * 构建元数据
   */
  private buildMetadata(totalDuration: number): any {
    const avgDuration = this.iterations.length > 0
      ? totalDuration / this.iterations.length
      : 0;

    return {
      totalIterations: this.iterations.length,
      averageIterationDuration: avgDuration,
      finalCompletionPercentage: this.estimateCompletion({}),
    };
  }
}

// ============================================================================
// 导出
// ============================================================================

export * from './AutonomousLoopExecutor.js';
