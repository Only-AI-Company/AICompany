/**
 * AI Company v2 - Validator
 *
 * 验证任务执行结果是否正确
 */

import { ClaudeCLIManager } from './claude/ClaudeCLIManager.js';
import type { TaskPlan, TaskStep } from './TaskPlanner.js';
import type { ExecutionResult } from './ToolExecutor.js';

export interface ValidationResult {
  success: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message?: string;
  }>;
  errors: string[];
  warnings: string[];
}

export interface ValidationOptions {
  cliManager?: ClaudeCLIManager;
  completionThreshold?: number;  // 完成率阈值，默认 80%
}

/**
 * Validator
 *
 * 验证任务产出是否正确
 */
export class Validator {
  private cliManager?: ClaudeCLIManager;
  private readonly completionThreshold: number;  // 完成率阈值（0-100）

  constructor(options?: ValidationOptions) {
    this.cliManager = options?.cliManager;
    this.completionThreshold = options?.completionThreshold ?? 80;
  }

  /**
   * 验证执行结果
   */
  async validate(
    plan: TaskPlan,
    executionResult: ExecutionResult,
    workspacePath?: string
  ): Promise<ValidationResult> {
    const checks: Array<{ name: string; passed: boolean; message?: string }> =
      [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // 验证 workspacePath 有效性
    if (!this.cliManager && !workspacePath) {
      throw new Error('Validator requires either a CLIManager or workspacePath');
    }

    // 使用传入的或现有的 CLI Manager
    const cliManager =
      this.cliManager || new ClaudeCLIManager(workspacePath!);

    // 1. 检查所有步骤是否执行成功
    const failedSteps = executionResult.results.filter((r) => !r.success);
    checks.push({
      name: '步骤执行检查',
      passed: failedSteps.length === 0,
      message:
        failedSteps.length === 0
          ? '所有步骤执行成功'
          : `${failedSteps.length} 个步骤执行失败`,
    });

    if (failedSteps.length > 0) {
      for (const step of failedSteps) {
        errors.push(`步骤 "${step.stepName}" 执行失败：${step.error}`);
      }
    }

    // 2. 验证预期的输出文件是否存在
    for (const step of plan.steps) {
      if (step.type === 'write_file' && step.filePath) {
        const exists = await cliManager.exists(step.filePath);
        checks.push({
          name: `文件检查：${step.filePath}`,
          passed: exists,
          message: exists ? '文件存在' : '文件不存在',
        });
        if (!exists) {
          errors.push(`预期文件不存在：${step.filePath}`);
        }
      }
    }

    // 3. 验证目录结构
    const dirSteps = plan.steps.filter((s) => s.type === 'mkdir');
    for (const step of dirSteps) {
      const dirPath = step.filePath || step.name;
      const exists = await cliManager.exists(dirPath);
      checks.push({
        name: `目录检查：${dirPath}`,
        passed: exists,
        message: exists ? '目录存在' : '目录不存在',
      });
      if (!exists) {
        warnings.push(`预期目录不存在：${dirPath}`);
      }
    }

    // 4. 验证预期输出
    const verifySteps = plan.steps.filter(
      (s) => s.type === 'verify' && s.expectedOutput
    );
    for (const step of verifySteps) {
      if (step.expectedOutput) {
        const exists = await cliManager.exists(step.expectedOutput);
        checks.push({
          name: `验证输出：${step.expectedOutput}`,
          passed: exists,
          message: exists ? '验证通过' : '验证失败',
        });
        if (!exists) {
          errors.push(`验证失败：${step.expectedOutput} 不存在`);
        }
      }
    }

    // 5. 基本完整性检查
    const totalSteps = plan.steps.length;
    const completedSteps = executionResult.results.filter((r) => r.success)
      .length;
    const completionRate = (completedSteps / totalSteps) * 100;

    checks.push({
      name: '完成率检查',
      passed: completionRate >= this.completionThreshold,
      message: `${completionRate.toFixed(1)}% 步骤完成`,
    });

    if (completionRate < this.completionThreshold) {
      errors.push(`完成率过低：${completionRate.toFixed(1)}%`);
    } else if (completionRate < 100) {
      warnings.push(`部分步骤未完成：${completionRate.toFixed(1)}%`);
    }

    const success = errors.length === 0;

    return {
      success,
      checks,
      errors,
      warnings,
    };
  }

  /**
   * 验证单个文件内容
   */
  async validateFileContent(
    filePath: string,
    expectedContent: string,
    cliManager?: ClaudeCLIManager
  ): Promise<{ valid: boolean; message: string }> {
    const manager = cliManager || this.cliManager;
    if (!manager) {
      return { valid: false, message: 'CLI Manager not available' };
    }

    const result = await manager.readFile(filePath);
    if (!result.success) {
      return { valid: false, message: `无法读取文件：${result.error}` };
    }

    // 简单比较（可以改进为更智能的比较）
    const actualContent = result.output || '';
    if (actualContent.trim() === expectedContent.trim()) {
      return { valid: true, message: '文件内容匹配' };
    }

    // 检查关键内容是否存在
    const expectedLines = expectedContent
      .split('\n')
      .filter((line) => line.trim().length > 0);
    const missingLines = expectedLines.filter(
      (line) => !actualContent.includes(line)
    );

    if (missingLines.length === 0) {
      return { valid: true, message: '文件内容基本匹配' };
    }

    return {
      valid: false,
      message: `文件内容不匹配，缺少 ${missingLines.length} 行关键内容`,
    };
  }

  /**
   * 生成验证报告
   */
  generateReport(result: ValidationResult): string {
    let report = '=== 验证报告 ===\n\n';

    report += `整体结果：${result.success ? '✅ 通过' : '❌ 失败'}\n\n`;

    report += '--- 检查项 ---\n';
    for (const check of result.checks) {
      const icon = check.passed ? '✅' : '❌';
      report += `${icon} ${check.name}: ${check.message || ''}\n`;
    }

    if (result.errors.length > 0) {
      report += '\n--- 错误 ---\n';
      for (const error of result.errors) {
        report += `❌ ${error}\n`;
      }
    }

    if (result.warnings.length > 0) {
      report += '\n--- 警告 ---\n';
      for (const warning of result.warnings) {
        report += `⚠️ ${warning}\n`;
      }
    }

    return report;
  }
}

// 工厂函数
let instance: Validator | null = null;

export function getValidator(options?: ValidationOptions): Validator {
  if (!instance) {
    instance = new Validator(options);
  }
  return instance;
}
