/**
 * CEOAgent - 首席执行官 Agent
 *
 * 职责：
 * - 战略思考与决策
 * - 任务分配与协调
 * - 风险控制与审批
 * - 质量监督
 */

import { BaseAgent } from './BaseAgent';
import type { Task, ThoughtProcess, RiskLevel, Evidence } from '../../types';

export interface CEOAgentConfig {
  name?: string;
  autonomyLevel?: 1 | 2 | 3 | 4;
}

export class CEOAgent extends BaseAgent {
  private autonomyLevel: 1 | 2 | 3 | 4;

  constructor(config: CEOAgentConfig = {}) {
    super({
      role: 'ceo',
      name: config.name || 'CEO',
      maxIterations: 5,
      reflectionEnabled: true
    });

    this.autonomyLevel = config.autonomyLevel ?? 2;
  }

  /**
   * 观察环境与任务
   */
  protected observe(task: Task): any[] {
    return [
      {
        type: 'task_received',
        content: task.description,
        source: 'user',
        confidence: 1.0
      },
      {
        type: 'priority_assessment',
        content: `Task priority: ${task.priority}`,
        source: 'internal',
        confidence: 0.9
      },
      {
        type: 'risk_assessment',
        content: this.assessRisk(task),
        source: 'internal',
        confidence: 0.8
      }
    ];
  }

  /**
   * 分析任务需求
   */
  protected async analyze(task: Task): Promise<any> {
    // CEO 的分析逻辑
    const analysis: {
      initialHypothesis: string;
      evidenceChain: Evidence[];
      conclusion: string;
      confidence: number;
      rationale: string;
      expectedOutcome: string;
    } = {
      initialHypothesis: this.generateHypothesis(task),
      evidenceChain: [],
      conclusion: '',
      confidence: 0.5,
      rationale: '',
      expectedOutcome: ''
    };

    // 根据自主级别决定分析深度
    if (this.autonomyLevel >= 3) {
      // 高级自主：深度分析
      const evidence: Evidence[] = [
        {
          type: 'historical_pattern',
          content: 'Similar tasks completed successfully',
          weight: 0.7
        }
      ];
      analysis.evidenceChain = evidence;
      analysis.conclusion = `Task "${task.description}" aligns with goals`;
      analysis.confidence = 0.8;
      analysis.rationale = 'Task fits established patterns';
      analysis.expectedOutcome = 'Successful completion';
    } else {
      // 低级自主：保守分析
      analysis.conclusion = `Task requires supervision`;
      analysis.confidence = 0.6;
      analysis.rationale = 'Conservative approach recommended';
      analysis.expectedOutcome = 'Completion with oversight';
    }

    return analysis;
  }

  /**
   * 创建执行计划
   */
  protected async createPlan(thought: ThoughtProcess): Promise<any> {
    const plan = {
      strategy: this.determineStrategy(thought),
      steps: [] as any[],
      riskMitigation: [] as string[],
      successCriteria: [] as string[]
    };

    // 根据任务类型制定策略
    if (thought.decision.selectedAction.type === 'use_tool') {
      plan.steps.push({
        type: 'tool_execution',
        tool: 'default',
        parameters: thought.decision.selectedAction.parameters
      });
    }

    plan.riskMitigation.push('Monitor execution progress');
    plan.successCriteria.push('Task completed without errors');

    return plan;
  }

  /**
   * 执行计划
   */
  protected async execute(plan: any): Promise<any> {
    this.logger.info({ plan }, 'CEO executing plan');

    // CEO 通常委托执行给其他 Agent
    return {
      delegated: true,
      plan,
      timestamp: Date.now(),
      status: 'delegated'
    };
  }

  /**
   * 评估执行结果
   */
  protected async evaluate(result: any): Promise<void> {
    this.logger.info({ result }, 'CEO evaluating result');

    // 评估逻辑
    const quality = result?.status === 'completed' ? 'high' : 'needs_improvement';
    this.logger.info({ quality }, 'Evaluation complete');
  }

  /**
   * 决策：是否批准任务
   */
  decideApproval(task: Task): { approved: boolean; risk: RiskLevel; reason: string } {
    const risk = this.assessRisk(task);

    // 根据自主级别决定
    if (this.autonomyLevel === 1) {
      // 级别 1：所有任务都需要用户批准
      return { approved: false, risk, reason: 'Autonomy level 1: requires user approval' };
    }

    if (risk === 'low' && this.autonomyLevel >= 2) {
      return { approved: true, risk, reason: 'Low risk task auto-approved' };
    }

    if (risk === 'medium' && this.autonomyLevel >= 3) {
      return { approved: true, risk, reason: 'Medium risk task auto-approved at level 3+' };
    }

    if (risk === 'high' && this.autonomyLevel === 4) {
      return { approved: true, risk, reason: 'High risk task auto-approved at level 4' };
    }

    return { approved: false, risk, reason: 'Requires higher autonomy level' };
  }

  /**
   * 评估任务风险
   */
  private assessRisk(task: Task): RiskLevel {
    // 简单风险评估逻辑
    const highRiskKeywords = ['删除', '清除', '重置', '停止', '修改配置'];
    const content = task.description.toLowerCase();

    if (highRiskKeywords.some(keyword => content.includes(keyword))) {
      return 'high';
    }

    if (task.priority === 'critical') {
      return 'high';
    }

    if (task.priority === 'high') {
      return 'medium';
    }

    return 'low';
  }

  /**
   * 生成假设
   */
  private generateHypothesis(task: Task): string {
    return `Task "${task.description}" can be completed successfully`;
  }

  /**
   * 确定策略
   */
  private determineStrategy(thought: ThoughtProcess): string {
    const actionType = thought.decision.selectedAction.type;

    switch (actionType) {
      case 'use_tool':
        return 'tool_based_execution';
      case 'delegate':
        return 'delegation';
      case 'collaborate':
        return 'collaboration';
      default:
        return 'direct_execution';
    }
  }

  /**
   * 获取自主级别
   */
  getAutonomyLevel(): 1 | 2 | 3 | 4 {
    return this.autonomyLevel;
  }

  /**
   * 设置自主级别
   */
  setAutonomyLevel(level: 1 | 2 | 3 | 4): void {
    this.autonomyLevel = level;
    this.logger.info({ level }, 'Autonomy level updated');
  }
}
