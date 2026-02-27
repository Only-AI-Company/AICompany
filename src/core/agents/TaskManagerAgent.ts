/**
 * AI Company - Task Manager Agent
 *
 * 扁平化管理 Agent：负责任务分析、智能分配、进度监控
 */

import type { AIDatabase } from '../../infrastructure/database/index.js';
import type { Task, Employee } from '../../types/index.js';
import { getClaudeCLIManager } from '../../infrastructure/claude/index.js';
import { TaskExecutor } from '../../application/services/TaskExecutor.js';

export interface TaskAnalysis {
  type: string;           // 任务类型
  complexity: number;     // 复杂度 1-10
  requiredSkills: string[]; // 需要的技能
  estimatedHours: number; // 预估工时
  suggestedRole: string;  // 建议的角色
  priority: number;       // 优先级 1-10
}

export interface AssignmentSuggestion {
  employeeId: string;
  employeeName: string;
  matchScore: number;     // 匹配度 0-100
  reason: string;         // 推荐理由
}

export class TaskManagerAgent {
  constructor(
    private db: AIDatabase,
    private claude = getClaudeCLIManager(),
    private executor = new TaskExecutor(db)
  ) {}

  /**
   * 分析任务（AI）
   */
  async analyzeTask(description: string): Promise<TaskAnalysis> {
    const prompt = `你是任务分析专家。

【任务】${description}

【任务】分析这个任务，返回 JSON：

{
  "type": "任务类型（开发/设计/内容/分析/其他）",
  "complexity": 复杂度（1-10的数字）,
  "requiredSkills": ["技能1", "技能2"],
  "estimatedHours": 预估工时（小时数）,
  "suggestedRole": "建议的角色",
  "priority": 优先级（1-10的数字）
}

要求：
- 复杂度合理评估
- 技能精简（最多3个）
- 工时考虑实际情况`;

    try {
      const response = await this.claude.prompt(prompt, { print: true });
      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
      throw new Error('分析失败');
    } catch {
      // 降级默认值
      return {
        type: 'general',
        complexity: 5,
        requiredSkills: [],
        estimatedHours: 2,
        suggestedRole: 'generalist',
        priority: 5,
      };
    }
  }

  /**
   * 找到最合适的员工（AI）
   * 优化：批量获取技能，避免 N+1 查询
   */
  async findBestEmployee(taskAnalysis: TaskAnalysis): Promise<AssignmentSuggestion | null> {
    const employees = this.db.getAllEmployees().filter(e => e.status === 'active');

    if (employees.length === 0) {
      return null;
    }

    // 批量获取所有员工的技能（一次查询）
    const skillsMap = this.db.getEmployeeSkillsBatch(employees.map(e => e.id));

    // 构建员工信息
    const employeeInfo = employees.map(emp => {
      const skills = skillsMap.get(emp.id) || [];
      return {
        id: emp.id,
        name: emp.name,
        role: emp.role,
        skills,
        completedTasks: emp.completed_tasks || 0,
        quality: emp.average_quality || 50,
      };
    });

    const prompt = `你是任务分配专家。

【任务需求】
类型：${taskAnalysis.type}
复杂度：${taskAnalysis.complexity}/10
需要技能：${taskAnalysis.requiredSkills.join('、')}

【可用员工】
${employeeInfo.map(e => `- ${e.name}（${e.role}）
  技能：${e.skills.join('、') || '无'}
  完成任务：${e.completedTasks}
  平均质量：${e.quality}`).join('\n\n')}

【任务】
分析并找到最合适的员工，返回 JSON：

{
  "employeeId": "员工ID",
  "employeeName": "员工姓名",
  "matchScore": 匹配度（0-100的数字）,
  "reason": "推荐理由（简短）"
}

要求：
- 综合考虑技能匹配、工作负载、历史表现
- 匹配度要合理评估`;

    try {
      const response = await this.claude.prompt(prompt, { print: true });
      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 智能创建并分配任务
   */
  async createAndAssign(description: string): Promise<{
    task: Task;
    assignedTo?: AssignmentSuggestion;
  }> {
    console.log(`\n🤖 TaskManager 正在分析任务...`);
    console.log(`   描述：${description}\n`);

    // 1. 分析任务
    const analysis = await this.analyzeTask(description);

    console.log(`📊 任务分析：`);
    console.log(`   类型：${analysis.type}`);
    console.log(`   复杂度：${analysis.complexity}/10`);
    console.log(`   建议角色：${analysis.suggestedRole}`);
    console.log(`   预估工时：${analysis.estimatedHours}小时\n`);

    // 2. 创建任务
    const task = this.db.createTask({
      type: analysis.type,
      description,
      priority: analysis.complexity > 7 ? 'high' : analysis.complexity > 4 ? 'medium' : 'low',
      requested_by: 'user',
      status: 'pending_owner',
    });

    console.log(`✓ 任务已创建：${task.id}\n`);

    return { task };
  }

  async approveTaskAndExecute(taskId: string): Promise<{
    task: Task;
    assignedTo?: AssignmentSuggestion;
    execution?: { success: boolean; output: string; error?: string };
  }> {
    const task = this.db.getTask(taskId);
    if (!task) {
      throw new Error('任务不存在');
    }

    const analysis = await this.analyzeTask(task.description);
    const suggestion = await this.findBestEmployee(analysis);

    if (!suggestion) {
      return { task };
    }

    this.db.assignTask(task.id, suggestion.employeeId);
    const execution = await this.executor.execute(task.id);

    return {
      task: this.db.getTask(task.id)!,
      assignedTo: suggestion,
      execution: {
        success: execution.success,
        output: execution.output,
        error: execution.error,
      },
    };
  }

  /**
   * 监控任务进度
   */
  monitorProgress(): {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
    issues: string[];
  } {
    const tasks = this.db.getAllTasks();
    const issues: string[] = [];

    const pending = tasks.filter(t => t.status === 'pending').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const failed = tasks.filter(t => t.status === 'failed').length;

    // 检测异常
    tasks.forEach(task => {
      const age = Date.now() - task.created_at;
      if (task.status === 'in_progress' && age > 24 * 60 * 60 * 1000) { // 超过24小时
        issues.push(`任务 ${task.id} 执行时间过长`);
      }
      if (task.status === 'assigned' && age > 60 * 60 * 1000) { // 超过1小时未开始
        issues.push(`任务 ${task.id} 未开始执行`);
      }
    });

    return {
      total: tasks.length,
      pending,
      inProgress,
      completed,
      failed,
      issues,
    };
  }

  /**
   * 生成工作报告
   */
  async generateReport(): Promise<string> {
    const tasks = this.db.getAllTasks();
    const employees = this.db.getAllEmployees();

    const completed = tasks.filter(t => t.status === 'completed');
    const failed = tasks.filter(t => t.status === 'failed');
    const inProgress = tasks.filter(t => t.status === 'in_progress');

    const employeeList = employees.map(e =>
      `- ${e.name}（${e.role}）：完成${e.completed_tasks || 0}个任务，质量${Math.round(e.average_quality || 0)}`
    ).join('\n');

    const prompt = `你是工作汇报专家。

【数据】
总任务：${tasks.length}
已完成：${completed.length}
进行中：${inProgress.length}
失败：${failed.length}
员工数：${employees.length}

【员工列表】
${employeeList}

【任务】
生成一份简明的工作日报（100字内），包含：
1. 整体进展
2. 需要关注的问题
3. 建议`;

    try {
      return await this.claude.prompt(prompt, { print: true });
    } catch {
      return `今日完成${completed.length}个任务，${inProgress.length}个进行中，${failed.length}个失败。`;
    }
  }
}
