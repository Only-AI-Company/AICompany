/**
 * AI Company v2 - Employee Agent Manager
 *
 * 管理员工的 Agent 缓存：
 * - 存储已验证的 Agent 提示词
 * - 追踪使用效果（成功率、评分）
 * - 为 CEO 决策提供数据支持
 */

import type { AIDatabase } from '../../db/Database.js';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 员工信息摘要
 */
export interface EmployeeInfo {
  id: string;
  name: string;
  role: string;
  capabilities: string[];
}

/**
 * Employee Agent 缓存记录
 */
export interface EmployeeAgent {
  id: string;
  employee_id: string;
  task_type: string;
  task_subtype: string | null;
  agent_name: string;
  agent_file: string;
  prompt_content: string;
  success_count: number;
  fail_count: number;
  success_rate: number;
  avg_performance_score: number;
  usage_count: number;
  last_used_at: number | null;
  last_success_at: number | null;
  created_at: number;
  updated_at: number;
}

/**
 * Agent 决策上下文
 */
export interface AgentDecisionContext {
  employees: EmployeeInfo[];
  agents: EmployeeAgent[];
}

/**
 * Agent 决策结果
 */
export interface AgentDecision {
  strategy: 'use_existing' | 'create_new';

  // use_existing
  agentId?: string;
  agentFile?: string;
  employeeId?: string;

  // create_new
  newAgentConfig?: {
    employeeId: string;
    name: string;
    taskType: string;
    taskSubtype: string;
    prompt: string;
  };

  reason: string;
}

// ============================================================================
// Employee Agent Manager
// ============================================================================

export class EmployeeAgentManager {
  private db: AIDatabase;
  private claudeAgentsDir: string;

  constructor(db: AIDatabase) {
    this.db = db;
    this.claudeAgentsDir = path.join(process.env.HOME || '', '.claude', 'agents');
  }

  // ---------------------------------------------------------------------------
  // 查询方法
  // ---------------------------------------------------------------------------

  /**
   * 收集员工上下文信息（供 CEO 决策使用）
   */
  collectEmployeeContext(): AgentDecisionContext {
    // 1. 获取所有员工信息
    const employees = this.db.prepare(`
      SELECT id, name, role, capabilities
      FROM employees
      WHERE status = 'active'
    `).all() as EmployeeInfo[];

    // 2. 获取所有缓存的 agents
    const agents = this.db.prepare(`
      SELECT id, employee_id, task_type, task_subtype,
             agent_name, agent_file,
             success_count, fail_count, success_rate, avg_performance_score,
             usage_count, last_used_at, last_success_at,
             created_at, updated_at
      FROM employee_agents
      ORDER BY success_rate DESC, usage_count DESC
    `).all() as EmployeeAgent[];

    return { employees, agents };
  }

  /**
   * 获取特定员工的 Agent 缓存
   */
  getEmployeeAgents(employeeId: string): EmployeeAgent[] {
    return this.db.prepare(`
      SELECT * FROM employee_agents
      WHERE employee_id = ?
      ORDER BY success_rate DESC, usage_count DESC
    `).all(employeeId) as EmployeeAgent[];
  }

  /**
   * 查找最匹配的 Agent
   */
  findBestMatch(taskType: string, taskSubtype: string | null): EmployeeAgent | null {
    // 精确匹配
    let result = this.db.prepare(`
      SELECT * FROM employee_agents
      WHERE task_type = ? AND (task_subtype = ? OR task_subtype IS NULL)
      ORDER BY success_rate DESC, usage_count DESC
      LIMIT 1
    `).get(taskType, taskSubtype) as EmployeeAgent | undefined;

    if (result) return result;

    // 模糊匹配（只匹配 task_type）
    result = this.db.prepare(`
      SELECT * FROM employee_agents
      WHERE task_type = ?
      ORDER BY success_rate DESC, usage_count DESC
      LIMIT 1
    `).get(taskType) as EmployeeAgent | undefined;

    return result || null;
  }

  // ---------------------------------------------------------------------------
  // Agent 创建与更新
  // ---------------------------------------------------------------------------

  /**
   * 保存新的 Agent 到缓存
   */
  saveAgent(agent: Partial<Omit<EmployeeAgent, 'id' | 'created_at' | 'updated_at'>> & Pick<EmployeeAgent, 'employee_id' | 'task_type' | 'agent_name' | 'agent_file' | 'prompt_content'>): EmployeeAgent {
    const id = `agent_${randomBytes(8).toString('hex')}`;
    const now = Date.now();

    const newAgent: EmployeeAgent = {
      id,
      employee_id: agent.employee_id,
      task_type: agent.task_type,
      task_subtype: agent.task_subtype ?? null,
      agent_name: agent.agent_name,
      agent_file: agent.agent_file,
      prompt_content: agent.prompt_content,
      success_count: agent.success_count ?? 0,
      fail_count: agent.fail_count ?? 0,
      success_rate: agent.success_rate ?? 0,
      avg_performance_score: agent.avg_performance_score ?? 0,
      usage_count: agent.usage_count ?? 0,
      last_used_at: agent.last_used_at ?? null,
      last_success_at: agent.last_success_at ?? null,
      created_at: now,
      updated_at: now,
    };

    try {
      // 检查是否已存在相同 employee_id, task_type, task_subtype 的 agent
      const existing = this.db.prepare(`
        SELECT id FROM employee_agents
        WHERE employee_id = ? AND task_type = ? AND (task_subtype = ? OR (task_subtype IS NULL AND ? IS NULL))
      `).get(newAgent.employee_id, newAgent.task_type, newAgent.task_subtype, newAgent.task_subtype) as { id: string } | undefined;

      if (existing) {
        // 更新现有 agent
        this.db.prepare(`
          UPDATE employee_agents
          SET agent_name = ?,
              agent_file = ?,
              prompt_content = ?,
              updated_at = ?
          WHERE id = ?
        `).run(
          newAgent.agent_name,
          newAgent.agent_file,
          newAgent.prompt_content,
          now,
          existing.id
        );

        console.log(`[EmployeeAgentManager] ✅ 更新现有 Agent: ${newAgent.agent_name} (${newAgent.task_type}/${newAgent.task_subtype}) - ${existing.id}`);
        return { ...newAgent, id: existing.id };
      }

      // 插入新 agent
      this.db.prepare(`
        INSERT INTO employee_agents (
          id, employee_id, task_type, task_subtype,
          agent_name, agent_file, prompt_content,
          success_count, fail_count, success_rate, avg_performance_score,
          usage_count, last_used_at, last_success_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newAgent.id,
        newAgent.employee_id,
        newAgent.task_type,
        newAgent.task_subtype,
        newAgent.agent_name,
        newAgent.agent_file,
        newAgent.prompt_content,
        newAgent.success_count || 0,
        newAgent.fail_count || 0,
        newAgent.success_rate || 0,
        newAgent.avg_performance_score || 0,
        newAgent.usage_count || 0,
        newAgent.last_used_at || null,
        newAgent.last_success_at || null,
        newAgent.created_at,
        newAgent.updated_at
      );

      console.log(`[EmployeeAgentManager] ✅ 保存新 Agent: ${newAgent.agent_name} (${newAgent.task_type}/${newAgent.task_subtype})`);
      return newAgent;
    } catch (error: any) {
      console.error(`[EmployeeAgentManager] 保存 Agent 失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 更新 Agent 使用统计
   */
  recordUsage(agentId: string, success: boolean, performanceScore?: number): void {
    const agent = this.db.prepare(`SELECT * FROM employee_agents WHERE id = ?`).get(agentId) as EmployeeAgent | undefined;
    if (!agent) return;

    const now = Date.now();
    const newSuccessCount = agent.success_count + (success ? 1 : 0);
    const newFailCount = agent.fail_count + (success ? 0 : 1);
    const newUsageCount = agent.usage_count + 1;

    // 重新计算成功率
    const newSuccessRate = newUsageCount > 0 ? newSuccessCount / newUsageCount : 0;

    // 更新平均性能分（简单移动平均）
    let newAvgScore = agent.avg_performance_score;
    if (performanceScore !== undefined) {
      if (agent.usage_count === 0) {
        newAvgScore = performanceScore;
      } else {
        // 0.3 权重给历史，0.7 权重给新评分
        newAvgScore = agent.avg_performance_score * 0.3 + performanceScore * 0.7;
      }
    }

    try {
      this.db.prepare(`
        UPDATE employee_agents
        SET success_count = ?,
            fail_count = ?,
            success_rate = ?,
            avg_performance_score = ?,
            usage_count = ?,
            last_used_at = ?,
            last_success_at = CASE WHEN ? THEN ? ELSE last_success_at END,
            updated_at = ?
        WHERE id = ?
      `).run(
        newSuccessCount,
        newFailCount,
        newSuccessRate,
        newAvgScore,
        newUsageCount,
        now,
        success ? 1 : 0,     // CASE WHEN condition (boolean -> number)
        now,                // THEN value (timestamp)
        now,                // updated_at
        agentId             // WHERE id
      );

      console.log(`[EmployeeAgentManager] ${success ? '✅' : '❌'} Agent ${agent.agent_name}: ${success ? '成功' : '失败'}, 成功率=${newSuccessRate.toFixed(2)}`);
    } catch (error: any) {
      console.error(`[EmployeeAgentManager] recordUsage 失败: ${error.message}`);
      console.error(`[EmployeeAgentManager] SQL 参数: success=${success}, agentId=${agentId}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Claude Agent 文件操作
  // ---------------------------------------------------------------------------

  /**
   * 创建 Claude Agent 文件
   */
  async createClaudeAgentFile(config: {
    name: string;
    prompt: string;
  }): Promise<string> {
    // 确保 agents 目录存在
    if (!fs.existsSync(this.claudeAgentsDir)) {
      fs.mkdirSync(this.claudeAgentsDir, { recursive: true });
    }

    const fileName = `${config.name.toLowerCase().replace(/\s+/g, '-')}.md`;
    const filePath = path.join(this.claudeAgentsDir, fileName);

    // 写入 agent 文件
    const content = `# ${config.name}

${config.prompt}
`;

    fs.writeFileSync(filePath, content, 'utf-8');

    console.log(`[EmployeeAgentManager] 📄 创建 Claude Agent 文件: ${fileName}`);
    return filePath;
  }

  /**
   * 读取现有 Claude Agent 文件
   */
  listExistingClaudeAgents(): Array<{ name: string; file: string; content?: string }> {
    if (!fs.existsSync(this.claudeAgentsDir)) {
      return [];
    }

    const files = fs.readdirSync(this.claudeAgentsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const filePath = path.join(this.claudeAgentsDir, f);
        const name = f.replace('.md', '').replace(/-/g, ' ');
        return { name, file: filePath };
      });

    return files;
  }

  // ---------------------------------------------------------------------------
  // 同步 Claude Agents 到数据库
  // ---------------------------------------------------------------------------

  /**
   * 将 ~/.claude/agents/ 中现有的 agents 同步到数据库
   */
  syncClaudeAgents(employeeId: string): number {
    const agents = this.listExistingClaudeAgents();
    let synced = 0;

    for (const agent of agents) {
      // 检查是否已存在
      const existing = this.db.prepare(`
        SELECT id FROM employee_agents
        WHERE employee_id = ? AND agent_file = ?
      `).get(employeeId, agent.file);

      if (!existing) {
        const content = fs.readFileSync(agent.file, 'utf-8');

        this.db.prepare(`
          INSERT INTO employee_agents (
            id, employee_id, task_type, task_subtype,
            agent_name, agent_file, prompt_content,
            success_count, fail_count, success_rate, avg_performance_score,
            usage_count, last_used_at, last_success_at,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `agent_${randomBytes(8).toString('hex')}`,
          employeeId,
          'general',  // 默认类型，可以后续优化
          null,
          agent.name,
          agent.file,
          content,
          0, 0, 0, 0,  // 新 agent，无统计
          0, null, null,
          Date.now(),
          Date.now()
        );

        synced++;
      }
    }

    if (synced > 0) {
      console.log(`[EmployeeAgentManager] ✅ 同步了 ${synced} 个 Claude Agents 到数据库`);
    }

    return synced;
  }
}

// ============================================================================
// 导出
// ============================================================================

export function getEmployeeAgentManager(db: AIDatabase): EmployeeAgentManager {
  return new EmployeeAgentManager(db);
}
