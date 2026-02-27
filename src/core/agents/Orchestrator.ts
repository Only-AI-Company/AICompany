import type { AIDatabase } from '../../infrastructure/database/index.js';
import type { Task } from '../../types/index.js';
import type { ReviewResult } from './ReviewerAgent.js';
import type { FoundResources, ProcessRequirementOptions } from '../types/Orchestrator.js';
import { getClaudeCLIManager } from '../../infrastructure/claude/index.js';
import { getPaths } from '../../infrastructure/config/index.js';
import { ReviewerAgent } from './ReviewerAgent.js';
import { prepareWorkDir } from '../../interfaces/gateway/utils.js';
import { existsSync, readdirSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { ScriptBuilder, type ScriptBuildRequest } from '../../application/builder/ScriptBuilder.js';

export interface OrchestrationResult {
  workflowId: string;
  requirement: string;
  status: 'completed' | 'failed' | 'partial';
  stepsCompleted: number;
  stepsTotal: number;
  outputs: string[];
  summary: string;
  report: string;
  finalDeliverable?: string;
}

export class Orchestrator {
  private reviewer: ReviewerAgent;
  private claude = getClaudeCLIManager();
  private paths: ReturnType<typeof getPaths>;
  private scriptBuilder: ScriptBuilder;

  constructor(private db: AIDatabase) {
    this.reviewer = new ReviewerAgent(db);
    this.paths = getPaths(db);
    this.scriptBuilder = new ScriptBuilder(db);
  }

  async processRequirement(
    requirement: string,
    quietMode: boolean = false,
    options: ProcessRequirementOptions & { existingTaskId?: string } = {}
  ): Promise<OrchestrationResult> {
    // 📋 Phase 1: 智能查询已有资源
    if (!options.forceNew) {
      const resources = this.queryExistingResources(requirement, options.searchDays ?? 7);

      if (this.hasResources(resources)) {
        if (!quietMode) {
          console.log(`\n📋 发到已有资源:`);
          this.logFoundResources(resources);
        }

        // 非交互模式：记录找到的资源，但仍继续创建新任务
        // TODO: Phase 2 将添加交互模式让用户选择
        if (!quietMode && resources.cronJobs.length > 0) {
          console.log(`💡 提示: 可用 /run <cron名称> 直接执行 cron 任务`);
        }
      }
    }

    // 📋 Phase 2: 原有流程（创建新任务）
    const existingTask = options.existingTaskId ? this.db.getTask(options.existingTaskId) : undefined;
    const task = existingTask || this.db.createTask({
      type: 'general',
      description: requirement,
      priority: 'medium',
      requested_by: 'user',
    });
    const workDir = task.work_dir;
    if (workDir) {
      prepareWorkDir(workDir, { taskId: task.id, description: requirement });
    }
    this.db.updateTaskStatus(task.id, 'executing');

    try {
      // 构建精密的执行提示词
      const executionPrompt = this.buildExecutionPrompt(requirement, task, options.executionContext);
      const output = await this.claude.prompt(executionPrompt, {
        print: true,
        quietMode,
        cwd: workDir || this.paths.getOutputsPath(),
      });
      if (workDir) {
        const outputsDir = join(workDir, 'outputs');
        writeFileSync(join(outputsDir, 'deliverable.md'), output, 'utf-8');
      }
      this.db.updateTaskStatus(task.id, 'auditing');
      const reviewResult = await this.reviewOutput(task, requirement, workDir || this.paths.getOutputsPath());
      this.db.updateTaskStatus(task.id, 'completed');

      const outputs = workDir ? this.listOutputs(workDir) : [];
      const report = this.buildReport(task, requirement, reviewResult);
      return {
        workflowId: task.id,
        requirement,
        status: reviewResult.score >= 70 ? 'completed' : 'partial',
        stepsCompleted: 1,
        stepsTotal: 1,
        outputs,
        summary: reviewResult.feedback,
        report,
        finalDeliverable: outputs[0],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (workDir) {
        writeFileSync(join(workDir, 'error.txt'), message, 'utf-8');
      }
      this.db.updateTaskStatus(task.id, 'failed', message);
      return {
        workflowId: task.id,
        requirement,
        status: 'failed',
        stepsCompleted: 0,
        stepsTotal: 1,
        outputs: workDir ? this.listOutputs(workDir) : [],
        summary: message,
        report: `执行失败: ${message}`,
      };
    }
  }

  getTaskStatus(taskId: string): { task: Task | null; outputs: string[]; progress: number } {
    const task = this.db.getTask(taskId);
    if (!task) {
      return { task: null, outputs: [], progress: 0 };
    }
    const progress =
      task.status === 'completed' || task.status === 'failed'
        ? 100
        : task.status === 'executing' || task.status === 'in_progress'
          ? 50
          : 0;
    const outputs = task.work_dir ? this.listOutputs(task.work_dir) : [];
    return { task, outputs, progress };
  }

  private listOutputs(workDir: string): string[] {
    if (!existsSync(workDir)) {
      return [];
    }
    const outputsDir = join(workDir, 'outputs');
    const targetDir = existsSync(outputsDir) ? outputsDir : workDir;
    return readdirSync(targetDir)
      .map(file => join(targetDir, file))
      .filter(file => file.endsWith('.md') || file.endsWith('.txt') || file.endsWith('.json'));
  }

  private async reviewOutput(task: Task, requirement: string, workDir: string): Promise<ReviewResult> {
    return this.reviewer.reviewStep(requirement, workDir);
  }

  private buildReport(task: Task, requirement: string, reviewResult: ReviewResult): string {
    const lines = [
      '# 任务执行报告',
      '',
      `任务 ID: ${task.id}`,
      `需求: ${requirement}`,
      '',
      this.reviewer.generateReviewReport(reviewResult),
    ];
    return lines.join('\n');
  }

  /**
   * 构建精密的执行提示词
   */
  private buildExecutionPrompt(requirement: string, task: Task, executionContext?: ProcessRequirementOptions['executionContext']): string {
    const workDir = task.work_dir || this.paths.getOutputsPath();

    // 构建上下文信息
    let contextInfo = '';
    if (executionContext) {
      contextInfo = '\n## 执行上下文\n';
      if (executionContext.source) {
        contextInfo += `- **来源渠道**: ${executionContext.source}\n`;
      }
      if (executionContext.userId) {
        contextInfo += `- **用户 ID**: ${executionContext.userId}\n`;
      }
      if (executionContext.sessionId) {
        contextInfo += `- **会话 ID**: ${executionContext.sessionId}\n`;
      }
      if (executionContext.previousDecision) {
        const pd = executionContext.previousDecision;
        contextInfo += `- **之前决策**: ${pd.type} → ${pd.target} (置信度: ${(pd.confidence * 100).toFixed(0)}%)\n`;
        contextInfo += `  理由: ${pd.reason}\n`;
      }
    }

    return `# AI Company 执行任务

## 你的角色
你是 AI Company 的专业执行 Agent。你的职责是：
1. **理解需求**：深度理解用户的真实需求
2. **执行任务**：使用所有可用工具完成任务
3. **产出交付物**：生成高质量的、可直接使用的交付物
4. **自我验证**：在提交前验证结果的正确性

## 任务信息
- **任务 ID**: ${task.id}
- **需求**: ${requirement}
- **工作目录**: ${workDir}
- **创建时间**: ${new Date(task.created_at).toLocaleString('zh-CN')}
${contextInfo}

## 执行要求

### 1. 需求分析
- 首先仔细分析用户需求，确保理解正确
- 如果需求模糊，做出合理的假设并说明
- 识别任务的关键目标

### 2. 执行策略
- 制定清晰的执行计划
- 选择合适的工具和方法
- 按步骤执行，确保每一步都正确

### 3. 产出标准
**必须产出以下内容**：
1. **核心交付物**：用户要求的主要产出
   - 代码：完整的、可运行的代码
   - 文档：结构清晰、内容完整的文档
   - 分析：有数据支持、结论明确的分析报告

2. **执行报告**：说明你做了什么
   - 采取的步骤
   - 使用的方法
   - 遇到的问题和解决方案
   - 最终结果说明

3. **使用说明**（如果适用）
   - 如何使用产出的代码/文档
   - 依赖项说明
   - 注意事项

### 4. 验收标准
任务完成后，必须满足以下标准：
- ✅ 完全满足用户需求
- ✅ 产出物可直接使用
- ✅ 代码无语法错误，可运行
- ✅ 文档结构清晰，内容完整
- ✅ 有明确的执行说明和结果

## 重要提醒

1. **质量优先**：宁可多花时间确保质量，也不要快速产出低质量结果
2. **主动沟通**：如果需求不明确，说明你的假设并继续
3. **完整交付**：不要只给部分结果，确保交付物是完整的
4. **可验证性**：确保你的结果可以被验证和重现

## 现在开始执行

用户需求：${requirement}

请按照以上要求完成这个任务，并产出完整的交付物。`;
  }

  // ============================================================================
  // 智能资源查询方法
  // ============================================================================

  /**
   * 查询已有资源（cron 任务、相似任务、脚本）
   */
  private queryExistingResources(requirement: string, days: number = 7): FoundResources {
    const keywords = this.extractKeywords(requirement);

    return {
      cronJobs: this.db.searchCronJobsByKeywords(keywords),
      similarTasks: this.db.searchTasksByKeywords(keywords, days),
      existingScripts: this.findExistingScripts(keywords),
      keywords,
    };
  }

  /**
   * 提取关键词（支持中英文）
   */
  private extractKeywords(text: string): string[] {
    // 常见停用词
    const stopwords = new Set([
      '的', '了', '是', '在', '和', '与', '或', '我', '你', '他', '她',
      'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'with', 'on',
      'run', '执行', '运行', '帮', '帮助',
    ]);

    // 提取中文词汇（2个字符以上）
    const chineseMatches = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];

    // 提取英文单词（2个字符以上）
    const englishMatches = text.toLowerCase().match(/[a-z]{2,}/g) || [];

    // 合并、去重、过滤停用词
    const allWords = [...chineseMatches, ...englishMatches];
    const keywords = [...new Set(allWords)].filter(w => !stopwords.has(w));

    return keywords;
  }

  /**
   * 查找已有脚本
   */
  private findExistingScripts(keywords: string[]): FoundResources['existingScripts'] {
    const scripts: FoundResources['existingScripts'] = [];

    try {
      const tasksDir = this.paths.getOutputsPath('tasks');
      if (!existsSync(tasksDir)) return scripts;

      const taskDirs = readdirSync(tasksDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const taskId of taskDirs) {
        const task = this.db.getTask(taskId);
        if (!task) continue;

        const scriptsDir = join(tasksDir, taskId, 'scripts');
        if (!existsSync(scriptsDir)) continue;

        const files = readdirSync(scriptsDir);
        for (const file of files) {
          if (!this.isScriptFile(file)) continue;

          // 检查关键词是否匹配
          const fileName = file.toLowerCase();
          const taskDesc = task.description.toLowerCase();
          const matchesKeyword = keywords.some(k =>
            fileName.includes(k.toLowerCase()) || taskDesc.includes(k.toLowerCase())
          );

          if (matchesKeyword) {
            scripts.push({
              path: join(scriptsDir, file),
              name: file,
              taskDescription: task.description,
              taskId: task.id,
            });
          }
        }
      }
    } catch (error) {
      console.error(`❌ 查找脚本失败:`, error);
    }

    return scripts;
  }

  /**
   * 判断是否为脚本文件
   */
  private isScriptFile(filename: string): boolean {
    return filename.endsWith('.sh') ||
           filename.endsWith('.py') ||
           filename.endsWith('.js') ||
           filename.endsWith('.ts') ||
           filename.endsWith('.rb') ||
           filename.endsWith('.go');
  }

  /**
   * 检查是否有资源
   */
  private hasResources(resources: FoundResources): boolean {
    return resources.cronJobs.length > 0 ||
           resources.similarTasks.length > 0 ||
           resources.existingScripts.length > 0;
  }

  /**
   * 记录找到的资源
   */
  private logFoundResources(resources: FoundResources): void {
    if (resources.cronJobs.length > 0) {
      console.log(`\n  ⏰ Cron 任务 (${resources.cronJobs.length}):`);
      for (const cron of resources.cronJobs) {
        console.log(`     • ${cron.name} - ${cron.description || cron.command}`);
      }
    }

    if (resources.similarTasks.length > 0) {
      console.log(`\n  📋 相似任务 (${resources.similarTasks.length}):`);
      for (const task of resources.similarTasks.slice(0, 3)) {
        const desc = task.description.length > 40
          ? task.description.slice(0, 40) + '...'
          : task.description;
        console.log(`     • [${task.status}] ${desc}`);
      }
    }

    if (resources.existingScripts.length > 0) {
      console.log(`\n  📜 已有脚本 (${resources.existingScripts.length}):`);
      for (const script of resources.existingScripts.slice(0, 3)) {
        console.log(`     • ${script.name} (${script.taskDescription.slice(0, 30)}...)`);
      }
    }

    if (resources.keywords.length > 0) {
      console.log(`\n  🔑 匹配关键词: ${resources.keywords.join(', ')}`);
    }
  }

  // ============================================================================
}
