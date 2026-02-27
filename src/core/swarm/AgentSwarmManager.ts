/**
 * AI Company - Agent Swarm Manager
 *
 * Agent Swarm 管理器：协调多个 Agent 协作完成任务
 *
 * 流程：
 * 1. 根据执行计划准备所有 Agent（内部员工 + 招募新员工）
 * 2. 使用 Claude CLI 的 --agents 参数动态创建/使用 Agents
 * 3. 触发 Swarm 模式，让 Agents 协作完成任务
 * 4. 【新增】自动验收：由专门的 Reviewer Agent 验收结果
 */

import type { AIDatabase } from '../../infrastructure/database/index.js';
import type { Task, Employee } from '../../types/index.js';
import type { ExecutionPlan, EmployeeAssignment } from '../planning/TaskPlanner.js';
import type { ReviewResult } from '../agents/ReviewerAgent.js';
import { getClaudeCLIManager } from '../../infrastructure/claude/index.js';
import { EmployeeAgentService } from '../../application/services/EmployeeAgentService.js';
import { EmployeeService } from '../../application/services/EmployeeService.js';
import { RecruitmentService } from '../../application/services/RecruitmentService.js';
import { ReviewerAgent } from '../agents/ReviewerAgent.js';
import { getHookSystem } from '../runtime/HookSystem.js';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// 类型定义
// ============================================================================

/** Agent 定义（用于 Claude CLI --agents 参数） */
export interface AgentDefinition {
  name: string;
  description: string;
  prompt: string;
}

/** Swarm 执行结果 */
export interface SwarmExecutionResult {
  success: boolean;
  output: string;
  agentsUsed: string[];
  recruitedEmployees: Employee[];
  duration: number;
  error?: string;
  /** 验收结果 */
  reviewResult?: ReviewResult;
  /** 是否通过验收 */
  reviewPassed?: boolean;
}

/** Swarm 配置 */
export interface SwarmConfig {
  taskId: string;
  taskDescription: string;
  workDir?: string;
  collaborationMode: 'sequential' | 'parallel' | 'leader_follower';
  leaderAgent?: string;
  /** 验收标准 */
  acceptanceCriteria?: string;
  /** 是否跳过验收 */
  skipReview?: boolean;
}

// ============================================================================
// AgentSwarmManager
// ============================================================================

export class AgentSwarmManager {
  private employeeAgentService: EmployeeAgentService;
  private employeeService: EmployeeService;
  private recruitmentService: RecruitmentService;
  private reviewerAgent: ReviewerAgent;
  private hookSystem = getHookSystem();

  constructor(
    private db: AIDatabase,
    private claude = getClaudeCLIManager()
  ) {
    this.employeeAgentService = new EmployeeAgentService(db, claude);
    this.employeeService = new EmployeeService(db);
    this.recruitmentService = new RecruitmentService(db);
    this.reviewerAgent = new ReviewerAgent(db, claude);
  }

  /**
   * 执行 Swarm（主入口）
   *
   * 流程：
   * 1. 根据执行计划准备所有 Agent
   * 2. 招募需要的员工
   * 3. 构建 Agent 定义（包括验收者）
   * 4. 使用 Claude CLI --agents 触发 Swarm
   * 5. 【新增】自动验收结果
   */
  async executeSwarm(
    task: Task,
    plan: ExecutionPlan,
    config: SwarmConfig
  ): Promise<SwarmExecutionResult> {
    console.log(`\n🐁 AgentSwarm 正在启动...`);
    console.log(`   任务：${task.description.slice(0, 50)}...`);
    console.log(`   协作模式：${plan.collaborationMode}`);
    console.log(`   需要 Agents：${plan.assignments.length}个\n`);

    const startTime = Date.now();
    const recruitedEmployees: Employee[] = [];

    // 确保工作目录存在
    const workDir = config.workDir || task.work_dir || this.createWorkDirectory(task.id);
    if (!existsSync(workDir)) {
      mkdirSync(workDir, { recursive: true });
    }

    try {
      // 2. 招募需要的员工
      for (const assignment of plan.neededRecruits) {
        console.log(`   👥 招募: ${assignment.role}`);
        const recruited = await this.recruitmentService.recruit(assignment.role);
        // 将 recruited 转换为 Employee 格式
        const employee = this.db.getEmployee(recruited.id);
        if (employee) {
          recruitedEmployees.push(employee);
        }
        assignment.employeeId = recruited.id;
        assignment.employeeName = recruited.name;
      }

      // 3. 收集所有员工（内部 + 新招募）
      const allEmployeeIds = plan.assignments
        .map(a => a.employeeId)
        .filter((id): id is string => id !== undefined);

      // 4. 构建 Agent 定义（包括验收者 Agent）
      const agentDefinitions = await this.buildAgentDefinitions(
        allEmployeeIds,
        plan.assignments,
        workDir
      );

      // 【新增】添加验收者 Agent
      const reviewerAgent = this.buildReviewerAgent(task, config);
      agentDefinitions.push(reviewerAgent);

      console.log(`\n   📦 Agent 定义 (${agentDefinitions.length}个，含验收者):`);
      for (const agent of agentDefinitions) {
        console.log(`      - ${agent.name}: ${agent.description}`);
      }

      // 5. 构建 Swarm prompt（包含验收说明）
      const swarmPrompt = this.buildSwarmPrompt(task, plan, agentDefinitions, config);

      // 6. 触发 Hook
      await this.hookSystem.emitAsync('execution:start', {
        executionId: `swarm-${task.id}`,
        taskId: task.id,
      });

      // 7. 使用 Claude CLI --agents 执行
      const output = await this.executeWithAgents(
        swarmPrompt,
        agentDefinitions,
        workDir,
        plan.suggestedLeader
      );

      const duration = Date.now() - startTime;

      // 8. 【新增】自动验收
      let reviewResult: ReviewResult | undefined;
      let reviewPassed = false;

      if (!config.skipReview) {
        console.log(`\n\n🔍 Reviewer Agent 正在验收...`);
        reviewResult = await this.autoReview(task, workDir, output, config);
        reviewPassed = reviewResult.overall === 'approved';

        console.log(`\n   📊 验收结果：${reviewResult.overall.toUpperCase()}`);
        console.log(`   📈 评分：${reviewResult.score}/100`);
        console.log(`   💬 反馈：${reviewResult.feedback.slice(0, 100)}...\n`);

        // 触发验收 Hook
        await this.hookSystem.emitAsync('task:on_complete', {
          taskId: task.id,
          result: { review: reviewResult },
        });
      } else {
        reviewPassed = true; // 跳过验收默认通过
      }

      // 9. 触发完成 Hook
      await this.hookSystem.emitAsync('execution:complete', {
        executionId: `swarm-${task.id}`,
        result: { output, duration, review: reviewResult },
      });

      // 10. 更新任务状态
      const finalStatus = reviewPassed ? 'completed' : 'auditing'; // 验收不通过进入审计状态
      this.db.updateTaskStatus(task.id, finalStatus);

      // 11. 更新所有员工的统计
      for (const employeeId of allEmployeeIds) {
        const employee = this.db.getEmployee(employeeId);
        if (employee) {
          const completedTasks = (employee.completed_tasks || 0) + 1;
          this.db.updateEmployee(employeeId, {
            completed_tasks: completedTasks,
            last_active: Date.now(),
          });
        }
      }

      // 12. 保存验收报告
      if (reviewResult) {
        this.saveReviewReport(workDir, reviewResult, output);
      }

      return {
        success: reviewPassed, // 验收通过才算成功
        output,
        agentsUsed: agentDefinitions.map(a => a.name),
        recruitedEmployees,
        duration,
        reviewResult,
        reviewPassed,
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;

      // 触发失败 Hook
      await this.hookSystem.emitAsync('execution:failed', {
        executionId: `swarm-${task.id}`,
        error: error.message,
      });

      // 更新任务状态
      this.db.updateTaskStatus(task.id, 'failed', error.message);

      return {
        success: false,
        output: '',
        agentsUsed: [],
        recruitedEmployees,
        duration,
        error: error.message,
        reviewPassed: false,
      };
    }
  }

  /**
   * 【新增】自动验收
   */
  private async autoReview(
    task: Task,
    workDir: string | undefined,
    output: string,
    config: SwarmConfig
  ): Promise<ReviewResult> {
    // 保存输出到文件供 ReviewerAgent 检查
    if (workDir) {
      const outputFile = join(workDir, 'output.md');
      writeFileSync(outputFile, output, 'utf-8');

      // 使用 ReviewerAgent 验收
      const acceptanceCriteria = config.acceptanceCriteria || task.acceptance_criteria;
      const reviewPrompt = acceptanceCriteria
        ? `需求：${task.description}\n\n验收标准：${acceptanceCriteria}`
        : task.description;

      return this.reviewerAgent.reviewStep(reviewPrompt, workDir);
    }

    // 没有工作目录时的降级处理
    return {
      overall: 'approved',
      score: 75,
      feedback: '无工作目录，跳过详细验收',
      issues: [],
      suggestions: [],
    };
  }

  /**
   * 【新增】构建验收者 Agent
   */
  private buildReviewerAgent(task: Task, config: SwarmConfig): AgentDefinition {
    const criteria = config.acceptanceCriteria || task.acceptance_criteria || '完成任务的所有要求';

    return {
      name: 'reviewer',
      description: '验收专家：严格验收任务结果，确保质量达标',
      prompt: `你是 AI Company 的验收专家。

【验收标准】
${criteria}

【职责】
1. 检查其他 Agent 的产出是否符合验收标准
2. 识别任何问题或缺陷
3. 给出明确的验收结论：通过/需要修订/拒绝
4. 提供具体的改进建议

【验收流程】
1. 仔细审查工作目录中的所有产出文件
2. 对照验收标准逐项检查
3. 给出详细反馈和改进建议
4. 如果不通过，说明具体原因`,
    };
  }

  /**
   * 【修改】构建 Swarm prompt（包含验收说明）
   */
  private buildSwarmPrompt(
    task: Task,
    plan: ExecutionPlan,
    agents: AgentDefinition[],
    config: SwarmConfig
  ): string {
    const parts: string[] = [];

    parts.push(`# Agent Swarm 协作任务`);
    parts.push(``);
    parts.push(`## 任务概述`);
    parts.push(task.description);
    parts.push(``);

    // 验收标准
    if (config.acceptanceCriteria || task.acceptance_criteria) {
      parts.push(`## 验收标准`);
      parts.push(config.acceptanceCriteria || task.acceptance_criteria || '完成任务的所有要求');
      parts.push(``);
      parts.push(`⚠️ 注意：完成任务后，reviewer Agent 将根据此标准进行严格验收。`);
      parts.push(``);
    }

    // 协作模式说明
    parts.push(`## 协作模式`);
    parts.push(`模式：${plan.collaborationMode}`);

    switch (plan.collaborationMode) {
      case 'leader_follower':
        parts.push(`- ${plan.suggestedLeader || '第一个 Agent'} 作为领导者，协调整体任务`);
        parts.push(`- 其他 Agent 在自己负责的领域工作`);
        parts.push(`- 定期同步进度，确保方向一致`);
        break;

      case 'parallel':
        parts.push(`- 各 Agent 并行工作`);
        parts.push(`- 在完成后汇总结果`);
        break;

      case 'sequential':
        parts.push(`- 按顺序执行`);
        parts.push(`- 每个 Agent 完成后，下一个 Agent 接手`);
        break;
    }

    parts.push(``);

    // 角色分配
    parts.push(`## 角色分配`);
    for (const agent of agents) {
      parts.push(`- **${agent.name}**: ${agent.description}`);
    }

    parts.push(``);

    // 执行要求
    parts.push(`## 执行要求`);
    parts.push(`1. 各 Agent 根据自己的角色和职责完成工作`);
    parts.push(`2. 协作时确保信息共享，避免重复工作`);
    parts.push(`3. 最终输出应该是一个完整、可交付的结果`);
    parts.push(`4. 在工作目录创建必要的文件`);
    parts.push(`5. 完成后通知 reviewer Agent 进行验收`);
    parts.push(``);

    return parts.join('\n');
  }

  /**
   * 保存验收报告
   */
  private saveReviewReport(workDir: string, reviewResult: ReviewResult, output: string): void {
    try {
      const reportFile = join(workDir, 'review-report.md');
      const reportContent = this.reviewerAgent.generateReviewReport(reviewResult);
      writeFileSync(reportFile, reportContent + '\n\n## 原始输出\n\n' + output, 'utf-8');
    } catch (error) {
      console.error(`保存验收报告失败:`, error);
    }
  }

  /**
   * 构建 Agent 定义
   */
  private async buildAgentDefinitions(
    employeeIds: string[],
    assignments: EmployeeAssignment[],
    workDir?: string
  ): Promise<AgentDefinition[]> {
    const definitions: AgentDefinition[] = [];

    for (let i = 0; i < employeeIds.length; i++) {
      const employeeId = employeeIds[i];
      const employee = this.db.getEmployee(employeeId);

      if (!employee) {
        console.warn(`员工不存在: ${employeeId}`);
        continue;
      }

      const assignment = assignments.find(a => a.employeeId === employeeId);
      const agentName = `agent-${i + 1}-${employee.name.replace(/\s+/g, '-').toLowerCase()}`;

      // 构建 Agent prompt
      const prompt = this.buildAgentPrompt(employee, assignment);

      definitions.push({
        name: agentName,
        description: `${employee.name}（${employee.role}）负责：${assignment?.assignedPart || '协助完成任务'}`,
        prompt,
      });

      // 同时创建/更新 EmployeeAgent 映射
      this.employeeAgentService.ensureEmployeeAgent(employeeId, {
        scope: 'project',
        cwd: workDir,
        agentName,
      });
    }

    return definitions;
  }

  /**
   * 构建 Agent prompt
   */
  private buildAgentPrompt(employee: Employee, assignment?: EmployeeAssignment): string {
    const parts: string[] = [];

    // 基本信息
    parts.push(`你是 ${employee.name}，担任 ${employee.role}。`);

    // 背景故事
    if (employee.backstory) {
      parts.push(`\n【背景】\n${employee.backstory}`);
    }

    // 技能
    const skills = this.db.getEmployeeSkills(employee.id).map(s => s.name);
    if (skills.length > 0) {
      parts.push(`\n【你的技能】\n${skills.map(s => `- ${s}`).join('\n')}`);
    }

    // 分配的任务
    if (assignment?.assignedPart) {
      parts.push(`\n【你负责的部分】\n${assignment.assignedPart}`);
    }

    // 工作指导
    parts.push(`\n【工作方式】`);
    parts.push(`- 发挥你的专业能力`);
    parts.push(`- 与其他 Agent 协作完成整体任务`);
    parts.push(`- 在你的职责范围内做出决策`);
    parts.push(`- 输出完整、可交付的结果`);

    return parts.join('\n');
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
   * 使用 Claude CLI --agents 执行
   */
  private async executeWithAgents(
    prompt: string,
    agents: AgentDefinition[],
    workDir?: string,
    leaderAgent?: string
  ): Promise<string> {
    // 构建 agents JSON 对象
    const agentsObj: Record<string, { description: string; prompt: string }> = {};
    for (const agent of agents) {
      agentsObj[agent.name] = {
        description: agent.description,
        prompt: agent.prompt,
      };
    }

    // 确定使用的 agent（默认第一个或指定的 leader）
    const primaryAgent = leaderAgent && agents.some(a => a.name === leaderAgent)
      ? leaderAgent
      : agents[0]?.name;

    console.log(`\n   🚀 使用 Claude CLI --agents 执行...`);
    console.log(`   📌 主要 Agent: ${primaryAgent}`);
    console.log(``);

    // 使用 ClaudeCLIManager 执行
    const output = await this.claude.prompt(prompt, {
      agent: primaryAgent,
      agents: agentsObj, // 传递 agents 对象
      systemPrompt: `你正在与其他 AI Agent 协作完成任务。请根据你的角色和职责，与其他 Agent 配合完成整体任务。完成任务后，请说明"任务已完成，等待 reviewer Agent 验收"。`,
      cwd: workDir,
      print: true,
    });

    return output;
  }
}

// ============================================================================
// 导出
// ============================================================================

export * from './AgentSwarmManager.js';
