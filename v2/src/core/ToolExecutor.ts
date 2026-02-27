/**
 * AI Company v2 - Tool Executor
 *
 * 执行拆解后的任务步骤
 * - 使用 ClaudeCLIManager 执行命令
 * - 使用 WorkspaceManager 管理工作目录
 */

import { ClaudeCLIManager } from './claude/ClaudeCLIManager.js';
import { WorkspaceManager, WorkspaceInfo } from './Workspace.js';
import type { TaskPlan, TaskStep } from './TaskPlanner.js';

export interface ExecutionProgress {
  currentStep: number;
  totalSteps: number;
  currentStepName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
  error?: string;
}

export interface ExecutionResult {
  success: boolean;
  results: Array<{
    stepId: string;
    stepName: string;
    success: boolean;
    output?: string;
    error?: string;
  }>;
  summary: string;
  workspace?: WorkspaceInfo;
}

export interface ExecutorOptions {
  workspaceManager?: WorkspaceManager;
  onProgress?: (progress: ExecutionProgress) => void;
}

/**
 * Tool Executor
 *
 * 执行任务计划中的每个步骤
 */
export class ToolExecutor {
  private workspaceManager: WorkspaceManager;
  private onProgress?: (progress: ExecutionProgress) => void;
  private currentWorkspace: WorkspaceInfo | null = null;

  constructor(options?: ExecutorOptions) {
    this.workspaceManager =
      options?.workspaceManager || new WorkspaceManager();
    this.onProgress = options?.onProgress;
  }

  /**
   * 执行任务计划
   */
  async execute(plan: TaskPlan): Promise<ExecutionResult> {
    console.log(`[ToolExecutor] Starting execution of plan: ${plan.taskId}`);

    // 创建工作区
    this.currentWorkspace =
      await this.workspaceManager.createWorkspace(plan.taskId);

    // 创建 CLI Manager
    const cliManager = new ClaudeCLIManager(this.currentWorkspace.path);
    await cliManager.initialize();

    const results: ExecutionResult['results'] = [];
    let hasFailure = false;

    // 按顺序执行步骤（考虑依赖关系）
    const executedSteps = new Set<string>();

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];

      // 检查依赖
      if (step.dependencies && step.dependencies.length > 0) {
        const unmetDeps = step.dependencies.filter(
          (depId) => !executedSteps.has(depId)
        );
        if (unmetDeps.length > 0) {
          console.warn(
            `[ToolExecutor] Step ${step.id} has unmet dependencies: ${unmetDeps.join(', ')}`
          );
        }
      }

      // 发布进度
      this.reportProgress({
        currentStep: i + 1,
        totalSteps: plan.steps.length,
        currentStepName: step.name,
        status: 'running',
      });

      // 执行步骤
      const result = await this.executeStep(step, cliManager);

      results.push({
        stepId: step.id,
        stepName: step.name,
        success: result.success,
        output: result.output,
        error: result.error,
      });

      if (result.success) {
        executedSteps.add(step.id);
      } else {
        hasFailure = true;
        console.error(
          `[ToolExecutor] Step failed: ${step.name} - ${result.error}`
        );

        // 如果是关键步骤失败，停止执行
        if (step.type === 'mkdir' || step.type === 'write_file') {
          console.log(
            '[ToolExecutor] Critical step failed, stopping execution'
          );
          break;
        }
      }

      this.reportProgress({
        currentStep: i + 1,
        totalSteps: plan.steps.length,
        currentStepName: step.name,
        status: result.success ? 'completed' : 'failed',
        output: result.output,
        error: result.error,
      });
    }

    // 完成工作区
    await this.workspaceManager.completeWorkspace(
      this.currentWorkspace.id,
      !hasFailure
    );

    const summary = this.generateSummary(plan, results);

    return {
      success: !hasFailure,
      results,
      summary,
      workspace: this.currentWorkspace,
    };
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(
    step: TaskStep,
    cliManager: ClaudeCLIManager
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    console.log(`[ToolExecutor] Executing step: ${step.name}`);

    switch (step.type) {
      case 'mkdir': {
        const dirPath = step.filePath || step.name;
        return await cliManager.mkdir(dirPath);
      }

      case 'write_file': {
        if (!step.filePath) {
          return {
            success: false,
            error: 'write_file step requires filePath',
          };
        }
        const content = step.content || '';
        return await cliManager.writeFile(step.filePath, content);
      }

      case 'run_command': {
        if (!step.command) {
          return {
            success: false,
            error: 'run_command step requires command',
          };
        }
        return await cliManager.executeCommand(step.command);
      }

      case 'verify': {
        // 验证步骤
        if (step.expectedOutput) {
          // 检查预期的文件是否存在
          const exists = await cliManager.exists(step.expectedOutput);
          if (!exists) {
            return {
              success: false,
              error: `Expected output not found: ${step.expectedOutput}`,
            };
          }
        }
        return {
          success: true,
          output: 'Verification passed',
        };
      }

      case 'other':
      default: {
        // 其他类型的步骤，尝试运行命令
        if (step.command) {
          return await cliManager.executeCommand(step.command);
        }
        // 如果没有命令，返回成功
        return {
          success: true,
          output: 'Step completed (no action)',
        };
      }
    }
  }

  /**
   * 报告进度
   */
  private reportProgress(progress: ExecutionProgress): void {
    if (this.onProgress) {
      this.onProgress(progress);
    }
  }

  /**
   * 生成执行摘要
   */
  private generateSummary(
    plan: TaskPlan,
    results: ExecutionResult['results']
  ): string {
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    let summary = `任务执行完成\n\n`;
    summary += `原始请求：${plan.originalRequest}\n`;
    summary += `总步骤数：${plan.steps.length}\n`;
    summary += `成功：${successCount}\n`;
    summary += `失败：${failCount}\n\n`;

    if (failCount > 0) {
      summary += `失败的步骤:\n`;
      for (const result of results) {
        if (!result.success) {
          summary += `  - ${result.stepName}: ${result.error}\n`;
        }
      }
    }

    return summary.trim();
  }

  /**
   * 获取当前工作区
   */
  getCurrentWorkspace(): WorkspaceInfo | null {
    return this.currentWorkspace;
  }
}

// 工厂函数 - 每次创建新实例，支持不同配置
let instance: ToolExecutor | null = null;

/**
 * 创建 ToolExecutor 实例
 * @param options 配置选项
 * @returns 新的 ToolExecutor 实例
 */
export function createToolExecutor(options?: ExecutorOptions): ToolExecutor {
  return new ToolExecutor(options);
}

/**
 * 获取单例 ToolExecutor 实例（不推荐，建议使用 createToolExecutor）
 * @deprecated 使用 createToolExecutor 代替
 */
export function getToolExecutor(options?: ExecutorOptions): ToolExecutor {
  if (!instance) {
    instance = new ToolExecutor(options);
  }
  return instance;
}
