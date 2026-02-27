/**
 * AI Company - Employee Manager Agent
 *
 * 员工管理 Agent：招募、培训、绩效评估、团队优化
 */

import type { AIDatabase } from '../../infrastructure/database/index.js';
import type { Task, Employee } from '../../types/index.js';
import { getClaudeCLIManager } from '../../infrastructure/claude/index.js';
import { getConfigService } from '../../infrastructure/config/index.js';
import { EmployeeService } from '../../application/services/EmployeeService.js';

/**
 * 员工分析结果
 */
export interface EmployeeAnalysis {
  employeeId: string;
  performanceScore: number;    // 综合绩效 0-100
  utilizationRate: number;     // 利用率 0-1
  skillGaps: string[];         // 技能缺口
  suggestions: string[];       // 改进建议
  status: 'excellent' | 'good' | 'average' | 'poor' | 'failing';
}

/**
 * 招募建议
 */
export interface RecruitSuggestion {
  name: string;
  role: string;
  model: string;
  reason: string;
  estimatedCost: number;
  priority: 'high' | 'medium' | 'low';
}

/**
 * 绩效报告
 */
export interface PerformanceReport {
  employeeId: string;
  employeeName: string;
  period: string;              // 评估周期
  completedTasks: number;
  averageQuality: number;
  averageSpeed: number;        // 平均完成时间（毫秒）
  successRate: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

/**
 * 团队优化建议
 */
export interface TeamOptimization {
  toFire: Array<{ id: string; name: string; reason: string }>;
  toReassign: Array<{ from: string; to: string; reason: string }>;
  newRecruits: RecruitSuggestion[];
}

/**
 * 员工健康状态
 */
export interface EmployeeHealth {
  overloaded: Array<{ id: string; name: string; activeTasks: number }>;
  idle: Array<{ id: string; name: string; idleDays: number }>;
  stuck: Array<{ id: string; name: string; reason: string }>;
}

export class EmployeeManagerAgent {
  constructor(
    private db: AIDatabase,
    private claude = getClaudeCLIManager(),
    private employeeService = new EmployeeService(db)
  ) {}

  /**
   * 分析员工表现（AI）
   */
  async analyzeEmployee(employeeId: string): Promise<EmployeeAnalysis> {
    const employee = this.db.getEmployee(employeeId);
    if (!employee) {
      throw new Error(`员工不存在: ${employeeId}`);
    }

    // 获取员工数据
    const allTasks = this.db.getAllTasks().filter(t => t.assigned_to === employeeId);
    const completedTasks = allTasks.filter(t => t.status === 'completed');
    const failedTasks = allTasks.filter(t => t.status === 'failed');
    const activeTasks = allTasks.filter(t => !['completed', 'failed', 'cancelled'].includes(t.status));
    const skills = this.db.getEmployeeSkills(employeeId);

    // 计算基础指标
    const successRate = allTasks.length > 0
      ? (completedTasks.length / allTasks.length) * 100
      : 0;

    // 利用率（活跃任务数 / 5 为满载）
    const utilizationRate = Math.min(activeTasks.length / 5, 1);

    // 构建分析信息
    const taskInfo = completedTasks.length > 0
      ? `完成任务：${completedTasks.length}\n失败任务：${failedTasks.length}\n成功率：${successRate.toFixed(1)}%`
      : '暂无完成任务';

    const prompt = `你是 AI 公司的绩效分析师。

【员工信息】
姓名：${employee.name}
角色：${employee.role}
入职时间：${new Date(employee.hire_date).toLocaleDateString('zh-CN')}
当前任务数：${activeTasks.length}

【任务表现】
${taskInfo}

【技能】
${skills.map(s => s.name).join('、') || '无'}

【任务】
分析这个员工的表现，返回 JSON：

{
  "performanceScore": 综合绩效分（0-100数字）,
  "skillGaps": ["缺位技能1", "缺位技能2"],
  "suggestions": ["改进建议1", "改进建议2"],
  "status": "excellent/good/average/poor/failing"
}

评估标准：
- performanceScore: 综合考虑成功率、任务数量、技能完整度
- skillGaps: 根据角色判断缺少的关键技能
- status: excellent(90+), good(75-89), average(60-74), poor(40-59), failing(<40)`;

    try {
      const response = await this.claude.prompt(prompt, { print: true });
      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        return {
          employeeId,
          performanceScore: result.performanceScore || 50,
          utilizationRate,
          skillGaps: result.skillGaps || [],
          suggestions: result.suggestions || [],
          status: result.status || 'average',
        };
      }
    } catch {
      // 降级返回
    }

    // 降级返回基础分析
    return {
      employeeId,
      performanceScore: successRate,
      utilizationRate,
      skillGaps: [],
      suggestions: ['建议多完成一些任务'],
      status: successRate >= 80 ? 'good' : successRate >= 50 ? 'average' : 'poor',
    };
  }

  /**
   * 智能招募（基于任务积压分析）
   */
  async smartRecruit(backlogTasks?: Task[]): Promise<RecruitSuggestion[]> {
    const currentEmployees = this.db.getAllEmployees();
    const pendingTasks = backlogTasks || this.db.getAllTasks().filter(t =>
      !['completed', 'failed', 'cancelled'].includes(t.status) && !t.assigned_to
    );

    if (pendingTasks.length === 0) {
      return [];
    }

    // 获取配置的模型
    const config = getConfigService(this.db);
    const defaultModel = config.get('model.default', 'claude-opus-4-6') as string;
    const fallbackModel = config.get('model.fallback', 'claude-sonnet-4-5-20250929') as string;

    // 分析积压任务
    const taskDescriptions = pendingTasks.map(t => t.description).join('\n');
    const employeeInfo = currentEmployees.map(e => `- ${e.name}（${e.role}）`).join('\n') || '无';

    const prompt = `你是 AI 公司的 HR 经理。

【公司现状】
现有员工：${currentEmployees.length}人
${employeeInfo}

【待分配任务】
${pendingTasks.length}个任务：
${taskDescriptions.slice(0, 500)}...

【任务】
分析并建议需要招募的员工，返回 JSON 数组：

[
  {
    "name": "建议的员工姓名",
    "role": "角色名称",
    "model": "${defaultModel} 或 ${fallbackModel}",
    "reason": "招募理由（简短）",
    "estimatedCost": 预估月成本（数字）,
    "priority": "high/medium/low"
  }
]

要求：
- 最多推荐2个员工
- estimatedCost 单位是美元/月
- 综合考虑任务类型和现有员工结构`;

    try {
      const response = await this.claude.prompt(prompt, { print: true });
      const jsonMatch = response.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/) || response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
    } catch {
      // 降级
    }

    return [];
  }

  /**
   * 绩效评估
   */
  async evaluatePerformance(employeeId: string, periodDays: number = 30): Promise<PerformanceReport> {
    const employee = this.db.getEmployee(employeeId);
    if (!employee) {
      throw new Error(`员工不存在: ${employeeId}`);
    }

    const allTasks = this.db.getAllTasks().filter(t => t.assigned_to === employeeId);
    const cutoffTime = Date.now() - periodDays * 24 * 60 * 60 * 1000;

    const periodTasks = allTasks.filter(t => t.created_at >= cutoffTime);
    const completedTasks = periodTasks.filter(t => t.status === 'completed');
    const failedTasks = periodTasks.filter(t => t.status === 'failed');

    // 计算平均完成时间
    const completedWithTime = completedTasks.filter(t => t.completed_at);
    const avgSpeed = completedWithTime.length > 0
      ? completedWithTime.reduce((sum, t) => sum + (t.completed_at! - t.created_at), 0) / completedWithTime.length
      : 0;

    const successRate = periodTasks.length > 0
      ? (completedTasks.length / periodTasks.length) * 100
      : 0;

    const avgQuality = employee.average_quality || 50;

    const prompt = `你是 AI 公司的绩效评估专家。

【员工信息】
姓名：${employee.name}
角色：${employee.role}

【近期表现】（${periodDays}天）
完成任务：${completedTasks.length}
失败任务：${failedTasks.length}
成功率：${successRate.toFixed(1)}%
平均质量：${avgQuality}

【任务】
生成绩效评估报告，返回 JSON：

{
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["不足1", "不足2"],
  "recommendations": ["建议1", "建议2"]
}

要求：
- 优势：最多2条
- 不足：最多2条
- 建议：最多2条，具体可行`;

    let strengths: string[] = [];
    let weaknesses: string[] = [];
    let recommendations: string[] = [];

    try {
      const response = await this.claude.prompt(prompt, { print: true });
      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        strengths = result.strengths || [];
        weaknesses = result.weaknesses || [];
        recommendations = result.recommendations || [];
      }
    } catch {
      // 降级
      if (successRate >= 80) strengths.push('成功率高');
      if (avgQuality >= 70) strengths.push('产出质量好');
      if (successRate < 60) weaknesses.push('成功率需提升');
      if (avgQuality < 60) weaknesses.push('质量需改进');
    }

    return {
      employeeId,
      employeeName: employee.name,
      period: `${periodDays}天`,
      completedTasks: completedTasks.length,
      averageQuality: avgQuality,
      averageSpeed: avgSpeed,
      successRate,
      strengths,
      weaknesses,
      recommendations,
    };
  }

  /**
   * 检测技能缺口并触发学习
   */
  async detectAndTrain(employeeId: string): Promise<string[]> {
    const analysis = await this.analyzeEmployee(employeeId);

    if (analysis.skillGaps.length === 0) {
      return [];
    }

    const learnedSkills: string[] = [];

    for (const skill of analysis.skillGaps) {
      try {
        // 尝试安装技能
        this.claude.installPlugin(skill, 'user');
        this.db.addEmployeeSkill(employeeId, { name: skill });
        learnedSkills.push(skill);
      } catch {
        // 技能不存在或安装失败，跳过
      }
    }

    return learnedSkills;
  }

  /**
   * 团队优化（重新分配/解雇低效员工）
   */
  async optimizeTeam(): Promise<TeamOptimization> {
    const employees = this.db.getAllEmployees();
    const toFire: Array<{ id: string; name: string; reason: string }> = [];
    const toReassign: Array<{ from: string; to: string; reason: string }> = [];

    // 分析每个员工
    for (const emp of employees) {
      const analysis = await this.analyzeEmployee(emp.id);

      // 绩效极差且任务数 > 5，建议解雇
      if (analysis.status === 'failing') {
        const allTasks = this.db.getAllTasks().filter(t => t.assigned_to === emp.id);
        if (allTasks.length >= 5) {
          toFire.push({
            id: emp.id,
            name: emp.name,
            reason: `绩效评分过低（${analysis.performanceScore}/100）`,
          });
        }
      }
    }

    // 检查是否需要新招募
    const newRecruits = await this.smartRecruit();

    return {
      toFire,
      toReassign,
      newRecruits,
    };
  }

  /**
   * 员工健康检查
   */
  healthCheck(): EmployeeHealth {
    const employees = this.db.getAllEmployees();
    const allTasks = this.db.getAllTasks();

    const overloaded: Array<{ id: string; name: string; activeTasks: number }> = [];
    const idle: Array<{ id: string; name: string; idleDays: number }> = [];
    const stuck: Array<{ id: string; name: string; reason: string }> = [];

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    for (const emp of employees) {
      // 检查过载
      const activeTasks = allTasks.filter(t =>
        t.assigned_to === emp.id && !['completed', 'failed', 'cancelled'].includes(t.status)
      );

      if (activeTasks.length >= 5) {
        overloaded.push({
          id: emp.id,
          name: emp.name,
          activeTasks: activeTasks.length,
        });
      }

      // 检查闲置（超过3天无活动）
      const lastActive = emp.last_active || 0;
      if (now - lastActive > 3 * oneDayMs && activeTasks.length === 0) {
        idle.push({
          id: emp.id,
          name: emp.name,
          idleDays: Math.floor((now - lastActive) / oneDayMs),
        });
      }

      // 检查卡住（有进行中任务但超过24小时无更新）
      const inProgressTasks = activeTasks.filter(t => t.status === 'in_progress');
      const stuckTasks = inProgressTasks.filter(t => {
        // 使用 started_at 或 created_at 判断
        const lastUpdate = t.started_at || t.created_at;
        return now - lastUpdate > oneDayMs;
      });
      if (stuckTasks.length > 0) {
        stuck.push({
          id: emp.id,
          name: emp.name,
          reason: `${stuckTasks.length}个任务超时未更新`,
        });
      }
    }

    return {
      overloaded,
      idle,
      stuck,
    };
  }

  /**
   * 生成团队报告
   */
  async generateTeamReport(): Promise<string> {
    const employees = this.db.getAllEmployees();
    const health = this.healthCheck();

    const prompt = `你是 AI 公司的 HR 经理。

【团队概况】
员工总数：${employees.length}
过载员工：${health.overloaded.length}
闲置员工：${health.idle.length}
卡住员工：${health.stuck.length}

【员工列表】
${employees.map(e => `- ${e.name}（${e.role}）：完成${e.completed_tasks || 0}个任务`).join('\n')}

【任务】
生成一份简明的团队状态报告（150字内），包含：
1. 整体状态
2. 需要关注的问题
3. 改进建议`;

    try {
      return await this.claude.prompt(prompt, { print: true });
    } catch {
      return `团队共${employees.length}人，${health.overloaded.length}人过载，${health.idle.length}人闲置。`;
    }
  }
}
