/**
 * AI Company - Task Planner
 *
 * 任务规划器：分析任务，确定需要的角色和员工
 *
 * 流程：
 * 1. 分析任务需要哪些角色
 * 2. 确定内部员工 + 需要招募的员工
 * 3. 返回完整的执行计划
 */

import type { AIDatabase } from '../../infrastructure/database/index.js';
import type { Task, Employee } from '../../types/index.js';
import { getClaudeCLIManager } from '../../infrastructure/claude/index.js';

// ============================================================================
// 类型定义
// ============================================================================

/** 角色需求 */
export interface RoleRequirement {
  role: string;
  reason: string; // 为什么需要这个角色
  priority: 'critical' | 'important' | 'optional';
  estimatedHours: number;
  skills: string[];
}

/** 员工分配计划 */
export interface EmployeeAssignment {
  employeeId?: string; // 内部员工 ID
  employeeName?: string; // 员工名称
  role: string;
  isRecruit: boolean; // 是否需要招募
  recruitReason?: string; // 招募理由（如果需要招募）
  assignedPart: string; // 负责的部分
}

/** 执行计划 */
export interface ExecutionPlan {
  taskId: string;
  taskDescription: string;
  complexity: number; // 1-10
  estimatedTotalHours: number;
  roleRequirements: RoleRequirement[];
  assignments: EmployeeAssignment[];
  existingEmployees: EmployeeAssignment[]; // 内部员工
  neededRecruits: EmployeeAssignment[]; // 需要招募的
  collaborationMode: 'sequential' | 'parallel' | 'leader_follower';
  suggestedLeader?: string; // 建议的领导者
}

// ============================================================================
// TaskPlanner
// ============================================================================

export class TaskPlanner {
  constructor(
    private db: AIDatabase,
    private claude = getClaudeCLIManager()
  ) {}

  /**
   * 规划任务执行
   *
   * 输入：任务详情 + 现有员工列表
   * 输出：完整的执行计划
   */
  async planExecution(task: Task, existingEmployees: Employee[]): Promise<ExecutionPlan> {
    console.log(`\n📋 TaskPlanner 正在规划任务执行...`);

    // 1. 获取员工信息（批量获取技能）
    const employeeIds = existingEmployees.map(e => e.id);
    const skillsMap = this.db.getEmployeeSkillsBatch(employeeIds);

    const employeeInfo = existingEmployees.map(emp => ({
      id: emp.id,
      name: emp.name,
      role: emp.role,
      nickname: emp.nickname,
      skills: skillsMap.get(emp.id) || [],
      status: emp.status,
      completedTasks: emp.completed_tasks || 0,
      averageQuality: emp.average_quality || 50,
      model: emp.model,
      systemPrompt: emp.system_prompt?.slice(0, 200), // 截取部分用于展示
    }));

    // 2. 使用 AI 分析任务并制定计划
    const prompt = this.buildPlanningPrompt(task, employeeInfo);

    try {
      const response = await this.claude.prompt(prompt, { print: true, outputFormat: 'json' });
      const plan = this.parsePlanningResponse(response, task, employeeInfo);

      console.log(`\n✓ 执行计划已生成：`);
      console.log(`   复杂度：${plan.complexity}/10`);
      console.log(`   预估工时：${plan.estimatedTotalHours}小时`);
      console.log(`   协作模式：${plan.collaborationMode}`);
      console.log(`   内部员工：${plan.existingEmployees.length}人`);
      console.log(`   需要招募：${plan.neededRecruits.length}人\n`);

      return plan;
    } catch (error) {
      console.error(`规划失败:`, error);
      // 返回降级计划
      return this.createFallbackPlan(task, employeeInfo);
    }
  }

  /**
   * 构建规划提示词
   */
  private buildPlanningPrompt(task: Task, employeeInfo: Array<any>): string {
    const employeeList = employeeInfo.length > 0
      ? employeeInfo.map(e =>
          `- ${e.name}（${e.role}）
    ID: ${e.id}
    技能：${e.skills.join('、') || '无'}
    状态：${e.status}
    完成任务：${e.completedTasks}
    质量：${e.averageQuality}/100`
        ).join('\n\n')
      : '（暂无员工）';

    return `你是 AI 公司的 Task Planner（任务规划专家）。

【任务】
${task.description}

【现有员工】
${employeeList}

【任务】
分析这个任务，制定完整的执行计划。返回 JSON：

{
  "complexity": 复杂度（1-10的数字）,
  "estimatedTotalHours": 预估总工时（小时数）,
  "roleRequirements": [
    {
      "role": "角色名称",
      "reason": "为什么需要这个角色",
      "priority": "critical|important|optional",
      "estimatedHours": 预估工时,
      "skills": ["技能1", "技能2"]
    }
  ],
  "assignments": [
    {
      "employeeId": "内部员工ID（如果使用现有员工）",
      "employeeName": "员工名称",
      "role": "担任的角色",
      "isRecruit": false,
      "assignedPart": "负责的具体部分"
    }
  ],
  "collaborationMode": "sequential|parallel|leader_follower",
  "suggestedLeader": "建议的领导者姓名"
}

【规划原则】
1. 优先使用现有员工
2. 如果现有员工技能不足，标记需要招募
3. 复杂任务（complexity > 7）建议多个角色协作
4. leader_follower 模式：一个领导者 + 多个执行者
5. parallel 模式：多个角色并行工作
6. sequential 模式：按顺序执行

【输出要求】
- 只返回 JSON，不要其他内容
- employeeId 必须从现有员工中选择
- 如果需要招募，设置 isRecruit: true 并说明 recruitReason`;
  }

  /**
   * 解析规划响应
   */
  private parsePlanningResponse(
    response: string,
    task: Task,
    employeeInfo: Array<any>
  ): ExecutionPlan {
    let parsed: any;

    // 提取 JSON
    try {
      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
                        response.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } else {
        parsed = JSON.parse(response);
      }
    } catch (error) {
      console.error(`JSON 解析失败:`, error);
      throw new Error('规划响应解析失败');
    }

    // 分类：内部员工 vs 需要招募
    const assignments: EmployeeAssignment[] = (parsed.assignments || []).map((a: any) => ({
      employeeId: a.employeeId,
      employeeName: a.employeeName,
      role: a.role,
      isRecruit: a.isRecruit || false,
      recruitReason: a.recruitReason,
      assignedPart: a.assignedPart,
    }));

    const existingEmployees = assignments.filter(a => !a.isRecruit);
    const neededRecruits = assignments.filter(a => a.isRecruit);

    return {
      taskId: task.id,
      taskDescription: task.description,
      complexity: parsed.complexity || 5,
      estimatedTotalHours: parsed.estimatedTotalHours || 4,
      roleRequirements: parsed.roleRequirements || [],
      assignments,
      existingEmployees,
      neededRecruits,
      collaborationMode: parsed.collaborationMode || 'leader_follower',
      suggestedLeader: parsed.suggestedLeader,
    };
  }

  /**
   * 创建降级计划（当 AI 失败时）
   */
  private createFallbackPlan(task: Task, employeeInfo: Array<any>): ExecutionPlan {
    const activeEmployees = employeeInfo.filter(e => e.status === 'active');

    // 使用第一个可用员工
    const assignment: EmployeeAssignment = activeEmployees.length > 0
      ? {
          employeeId: activeEmployees[0].id,
          employeeName: activeEmployees[0].name,
          role: activeEmployees[0].role,
          isRecruit: false,
          assignedPart: '完整任务',
        }
      : {
          role: 'generalist',
          isRecruit: true,
          recruitReason: '没有可用员工',
          assignedPart: '完整任务',
        };

    return {
      taskId: task.id,
      taskDescription: task.description,
      complexity: 5,
      estimatedTotalHours: 2,
      roleRequirements: [],
      assignments: [assignment],
      existingEmployees: activeEmployees.length > 0 ? [assignment] : [],
      neededRecruits: activeEmployees.length === 0 ? [assignment] : [],
      collaborationMode: 'sequential',
    };
  }
}
