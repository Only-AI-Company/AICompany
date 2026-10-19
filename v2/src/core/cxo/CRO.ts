/**
 * CXO 架构 - CRO (Chief Resource Officer)
 *
 * 职责：员工管理
 * - 匹配任务到合适的员工
 * - 招聘新员工（创建专业 agent）
 * - 追踪和优化员工绩效
 */

import { getDatabase } from '../../db/Database.js';
import { getEmployeeAgentManager } from '../agents/EmployeeAgentManager.js';
import type {
  ICRO,
  TaskRequirements,
  Employee,
  EmployeeMatch,
  TaskReview,
  EmployeePerformance,
} from './types.js';

export class CRO implements ICRO {
  private db = getDatabase();
  private agentManager = getEmployeeAgentManager(this.db);

  /**
   * 为任务匹配合适的员工
   */
  async findEmployee(
    requirements: TaskRequirements,
    employees: Employee[]
  ): Promise<EmployeeMatch> {
    console.log(`\n[CRO] 🔍 为任务匹配合适的员工`);
    console.log(`[CRO] 任务: ${requirements.description.substring(0, 50)}...`);
    console.log(`[CRO] 所需能力: [${requirements.requiredCapabilities.join(', ')}]`);
    console.log(`[CRO] 可用员工: ${employees.length} 个`);

    // 1. 尝试匹配合适的现有员工
    const match = this.matchExistingEmployee(requirements, employees);

    if (match) {
      console.log(`[CRO] ✅ 匹配成功: ${match.employee.name}`);
      console.log(`[CRO] 💭 原因: ${match.matchReason}`);
      return match;
    }

    // 2. 没有合适的员工，招聘新的
    console.log(`[CRO] 📝 没有合适的员工，招聘新员工...`);
    return await this.hireEmployee(requirements);
  }

  /**
   * 招聘新员工（创建新的 agent）
   */
  async hireEmployee(requirements: TaskRequirements): Promise<EmployeeMatch> {
    console.log(`[CRO] 🆕 招聘新员工`);
    console.log(`[CRO] 需求: ${requirements.description.substring(0, 50)}...`);

    // 1. 获取或创建员工
    const employee = this.selectEmployeeForHire(requirements);
    console.log(`[CRO] 选中员工: ${employee.name} (${employee.role})`);

    // 2. 生成专业的 agent prompt
    const agentPrompt = await this.generateProfessionalPrompt(requirements, employee);
    console.log(`[CRO] ✅ 专业 prompt 已生成 (${agentPrompt.length} 字符)`);

    // 3. 保存到数据库
    const taskType = requirements.taskType || this.inferTaskType(requirements);
    const taskSubtype = requirements.taskSubtype || null;

    const savedAgent = this.agentManager.saveAgent({
      employee_id: employee.id,
      task_type: taskType,
      task_subtype: taskSubtype,
      agent_name: `${taskSubtype || taskType}-expert`,
      agent_file: `~/.claude/agents/${taskSubtype || taskType}-expert.md`,
      prompt_content: agentPrompt,
    });

    console.log(`[CRO] 💾 Agent 已保存: ${savedAgent.id}`);

    return {
      employee,
      agentPrompt,
      matchReason: `新招聘的 ${employee.name}，专长于 ${taskType}${taskSubtype ? '/' + taskSubtype : ''}`,
      matchScore: 1.0,
      isNew: true,
    };
  }

  /**
   * 更新员工绩效
   */
  async updatePerformance(employeeId: string, review: TaskReview): Promise<void> {
    // 使用 EmployeeAgentManager 记录使用情况
    // 这里简化处理，实际应该关联到具体的 agent
    console.log(`[CRO] 📊 更新员工绩效: ${employeeId} - ${review.score}/10`);

    // 记录活动
    this.db.logActivity({
      eventType: 'cro.performance_update',
      actor: 'cro',
      action: 'update_performance',
      context: {
        employeeId,
        taskId: review.taskId,
        success: review.success,
        score: review.score,
      },
    });
  }

  /**
   * 获取员工绩效
   */
  async getEmployeePerformance(employeeId: string): Promise<EmployeePerformance | null> {
    const row = this.db.prepare(`
      SELECT id, name, points, level, satisfaction
      FROM employees
      WHERE id = ?
    `).get(employeeId) as any;

    if (!row) {
      return null;
    }

    // 获取完成任务统计
    const stats = this.db.prepare(`
      SELECT COUNT(*) as total,
             AVG(CASE WHEN status = 'completed' THEN 1 ELSE NULL END) as completed
      FROM tasks
      WHERE assigned_to = ?
    `).get(employeeId) as any;

    return {
      employeeId: row.id,
      points: row.points || 0,
      level: row.level || 1,
      satisfaction: row.satisfaction || 50,
      completedTasks: stats.completed || 0,
      avgScore: 0, // TODO: 从 review 表计算
    };
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 匹配现有员工
   */
  private matchExistingEmployee(
    requirements: TaskRequirements,
    employees: Employee[]
  ): EmployeeMatch | null {
    const scored = employees.map(emp => {
      const score = this.calculateMatchScore(requirements.requiredCapabilities, emp.capabilities);
      return {
        employee: emp,
        score,
      };
    });

    // 按分数排序
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];

    // 阈值：需要至少 30% 匹配度
    if (best && best.score >= 0.3) {
      // 获取 agent prompt
      const agentPrompt = this.getAgentPrompt(best.employee.id, requirements);

      return {
        employee: best.employee,
        agentPrompt,
        matchReason: `能力匹配度: ${(best.score * 100).toFixed(0)}%`,
        matchScore: best.score,
        isNew: false,
      };
    }

    return null;
  }

  /**
   * 计算匹配分数
   */
  private calculateMatchScore(required: string[], employeeCaps: string[]): number {
    if (required.length === 0 || employeeCaps.length === 0) {
      return 0;
    }

    let totalScore = 0;

    for (const reqCap of required) {
      let bestMatch = 0;

      for (const empCap of employeeCaps) {
        const score = this.calculateSingleMatch(reqCap, empCap);
        if (score > bestMatch) {
          bestMatch = score;
        }
      }

      totalScore += bestMatch;
    }

    return totalScore / required.length;
  }

  /**
   * 计算单个能力的匹配分数
   */
  private calculateSingleMatch(required: string, employee: string): number {
    // 完全匹配
    if (required === employee) {
      return 1.0;
    }

    // 包含匹配
    if (employee.includes(required) || required.includes(employee)) {
      return 0.5;
    }

    return 0;
  }

  /**
   * 获取员工的 agent prompt
   */
  private getAgentPrompt(employeeId: string, requirements: TaskRequirements): string {
    // 查找该员工最相关的 agent
    const taskType = requirements.taskType || this.inferTaskType(requirements);

    const agent = this.db.prepare(`
      SELECT prompt_content
      FROM employee_agents
      WHERE employee_id = ?
        AND (task_type = ? OR task_type = 'general')
      ORDER BY
        CASE WHEN task_type = ? THEN 1 ELSE 2 END,
        success_rate DESC,
        usage_count DESC
      LIMIT 1
    `).get(employeeId, taskType, taskType) as { prompt_content: string } | undefined;

    if (agent && agent.prompt_content) {
      return agent.prompt_content;
    }

    // Fallback prompt
    return this.generateFallbackPrompt(requirements);
  }

  /**
   * 生成专业的 agent prompt（使用 LLM）
   */
  private async generateProfessionalPrompt(
    requirements: TaskRequirements,
    employee: Employee
  ): Promise<string> {
    // 获取成功 agent 的参考
    const successfulAgents = this.db.prepare(`
      SELECT agent_name, prompt_content, success_rate, task_type, task_subtype
      FROM employee_agents
      WHERE success_rate >= 0.6 AND usage_count >= 2
      ORDER BY success_rate DESC, usage_count DESC
      LIMIT 3
    `).all() as Array<{
      agent_name: string;
      prompt_content: string;
      success_rate: number;
      task_type: string;
      task_subtype: string | null;
    }>;

    // 构建参考信息
    let referenceInfo = '';
    if (successfulAgents.length > 0) {
      referenceInfo = '\n\n## 参考的成功 Agent 模板：\n\n';
      for (const agent of successfulAgents) {
        referenceInfo += `### ${agent.agent_name}\n`;
        referenceInfo += `- 类型: ${agent.task_type}/${agent.task_subtype || '通用'}\n`;
        referenceInfo += `- 成功率: ${(agent.success_rate * 100).toFixed(1)}%\n`;
        referenceInfo += `- Prompt 片段:\n${agent.prompt_content.substring(0, 400)}...\n\n`;
      }
    }

    const prompt = `请为一个 AI Agent 设计专业的 system prompt。

## 任务需求
描述：${requirements.description}
所需能力：${requirements.requiredCapabilities.join(', ')}
任务类型：${requirements.taskType || 'auto'}${requirements.taskSubtype ? '/' + requirements.taskSubtype : ''}${referenceInfo}

## 设计要求

请生成一个专业的 AI Agent system prompt，必须包含以下部分：

1. **角色定位**（Role）
   - 明确这个 agent 的专业身份
   - 说明它的职责范围

2. **核心能力**（Core Capabilities）
   - 列出完成这个任务需要的专业技能
   - 具体说明每个能力的含义

3. **工作流程**（Workflow）
   - 给出清晰的执行步骤
   - 说明如何分析任务、如何使用工具、如何验证结果

4. **工具使用**（Tools）
   - 说明如何使用可用的工具（Bash、Read、Write、Edit、Glob、Grep）
   - 针对任务特点给出工具使用建议

5. **质量标准**（Quality Standards）
   - 定义什么样的输出是合格的
   - 说明交付物的格式和要求

## 输出格式

直接返回完整的 system prompt 内容（纯文本，不要 JSON，不要用 \`\`\` 包裹）。

提示：
- 要具体而非泛泛而谈
- 要针对任务特点定制
- 要包含可执行的指导
- 参考上面的成功模板，但不要照搬`;

    const systemPrompt = `你是 AI Agent prompt 设计专家。

你的职责是根据任务需求，生成专业、可执行的 system prompt。

好的 prompt 应该：
- 具体明确，不使用空洞的描述
- 针对任务类型定制
- 包含清晰的工作流程
- 说明如何使用可用工具
- 定义质量标准

只返回 prompt 内容，不要其他解释或标记。`;

    try {
      const { getProvider } = await import('../ai/AIProvider.js');
      const provider = getProvider();

      const response = await provider.messages(
        [{ role: 'user', content: prompt }],
        systemPrompt
      );

      // 提取文本内容
      let content = response.content;
      if (Array.isArray(content)) {
        const textBlocks = content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text);
        content = textBlocks.join('');
      }

      return content;
    } catch (error) {
      console.error('[CRO] 生成专业 prompt 失败:', error);
      return this.generateFallbackPrompt(requirements);
    }
  }

  /**
   * 生成 Fallback prompt
   */
  private generateFallbackPrompt(requirements: TaskRequirements): string {
    const taskType = requirements.taskType || 'general';
    const taskSubtype = requirements.taskSubtype || '';

    return `# ${taskSubtype || taskType} Expert

You are an expert in ${taskSubtype || taskType}.

## Task
${requirements.description}

## Required Capabilities
${requirements.requiredCapabilities.map(cap => `- ${cap}`).join('\n')}

## Instructions
- Analyze the task carefully
- Use available tools to complete the task
- Provide clear and helpful responses
- Report any issues or blockers

## Output
Provide a complete, working solution.`;
  }

  /**
   * 选择要招聘的员工
   */
  private selectEmployeeForHire(requirements: TaskRequirements): Employee {
    // 根据任务类型选择合适的员工
    const taskType = requirements.taskType || this.inferTaskType(requirements);

    // 简单映射：任务类型 → 员工角色
    const roleMap: Record<string, string> = {
      'coding': 'CTO',
      'writing': 'CMO',
      'operations': 'CMO',
      'marketing': 'CMO',
      'planning': 'COO',
      'management': 'COO',
      'analysis': 'CFO',
      'finance': 'CFO',
    };

    const targetRole = roleMap[taskType] || 'COO';

    // 从数据库获取该角色的员工
    const employee = this.db.prepare(`
      SELECT id, name, role, capabilities
      FROM employees
      WHERE role = ? AND status = 'active'
      LIMIT 1
    `).get(targetRole) as Employee | undefined;

    if (employee) {
      return employee;
    }

    // Fallback: 使用第一个员工
    return this.db.prepare(`
      SELECT id, name, role, capabilities
      FROM employees
      WHERE status = 'active'
      LIMIT 1
    `).get() as Employee;
  }

  /**
   * 推断任务类型
   */
  private inferTaskType(requirements: TaskRequirements): string {
    const caps = requirements.requiredCapabilities;
    const desc = requirements.description.toLowerCase();

    // 从能力推断
    if (caps.some(c => c.includes('code') || c.includes('coding') || c.includes('programming'))) {
      return 'coding';
    }
    if (caps.some(c => c.includes('writing') || c.includes('content') || c.includes('创作'))) {
      return 'writing';
    }
    if (caps.some(c => c.includes('analysis') || c.includes('research'))) {
      return 'analysis';
    }

    // 从描述推断
    if (/代码|编程|开发|api|接口|app|应用/.test(desc)) {
      return 'coding';
    }
    if (/写|文章|小说|文案|笔记|内容/.test(desc)) {
      return 'writing';
    }
    if (/运营|推广|营销|小红书|twitter|微博/.test(desc)) {
      return 'operations';
    }
    if (/分析|数据|统计|报告/.test(desc)) {
      return 'analysis';
    }

    return 'general';
  }
}

// ============================================================================
// 单例
// ============================================================================

let croInstance: CRO | null = null;

export function getCRO(): CRO {
  if (!croInstance) {
    croInstance = new CRO();
  }
  return croInstance;
}

export function resetCRO(): void {
  croInstance = null;
}
