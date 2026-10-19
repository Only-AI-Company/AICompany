/**
 * AI Company v2 - Agent Factory
 *
 * 基于 employee 表的智能 Agent 匹配与招募系统
 *
 * 核心理念：
 * - 不预定义角色，Agent 由能力定义
 * - role 只是可选的标签，不影响匹配
 * - 能力是动态字符串，不进行硬编码验证
 */

import type { AIDatabase } from '../../db/Database.js';
import type { AgentCapability, AgentDefinition } from './types.js';
import { generateDynamicSystemPrompt } from '../prompts/DynamicPromptSystem.js';
import type { Tool } from '../tools/types.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Agent 需求
 */
export interface AgentRequirement {
  taskDescription: string;
  requiredCapabilities: string[];
  context?: string;
}

/**
 * Employee 数据库记录
 */
interface EmployeeRecord {
  id: string;
  name: string;
  role: string;
  system_prompt: string;
  capabilities: string;
}

/**
 * 匹配结果
 */
interface MatchResult {
  employee: EmployeeRecord | null;
  matchScore: number;
  matchReason: string;
}

// ============================================================================
// Agent Factory
// ============================================================================

/**
 * Agent 工厂
 *
 * 核心职责：
 * 1. 按 capabilities 匹配现有 employee
 * 2. 匹配失败时招募新 employee
 * 3. 提供统计查询
 */
export class AgentFactory {
  private db: AIDatabase;

  constructor(db: AIDatabase) {
    this.db = db;
  }

  /**
   * 获取或创建 Agent
   *
   * 流程：
   * 1. 清理能力字符串
   * 2. 匹配现有 employee
   * 3. 匹配成功 → 复用
   * 4. 匹配失败 → 招募新 employee
   */
  async getOrCreateAgent(requirement: AgentRequirement): Promise<AgentDefinition> {
    const cleanCaps = this.cleanCapabilities(requirement.requiredCapabilities);

    console.log(`[AgentFactory] 需求能力: [${cleanCaps.join(', ')}]`);

    // 尝试匹配
    const match = this.findBestMatchingEmployee(cleanCaps);

    if (match.employee && match.matchScore > 0) {
      const empCaps = this.parseCapabilities(match.employee);
      console.log(
        `[AgentFactory] ✅ 复用：${match.employee.name} (${match.employee.role}) ` +
        `- 匹配原因：${match.matchReason} ` +
        `- 能力：[${empCaps.join(', ')}]`
      );
      return this.toAgentDefinition(match.employee);
    }

    // 招募新员工
    console.log(`[AgentFactory] 🎯 招募新员工 - 能力：[${cleanCaps.join(', ')}]`);
    return this.recruitNewEmployee(requirement, cleanCaps);
  }

  // ---------------------------------------------------------------------------
  // 私有方法 - 能力处理
  // ---------------------------------------------------------------------------

  /**
   * 清理能力字符串（转小写、去重、去空）
   *
   * 不进行任何硬编码过滤，能力是动态的
   */
  private cleanCapabilities(caps: string[]): string[] {
    if (!Array.isArray(caps) || caps.length === 0) {
      return ['analysis'];
    }

    const cleaned = caps
      .map(c => String(c).toLowerCase().trim())
      .filter(c => c.length > 0);

    // 去重
    const unique = [...new Set(cleaned)];

    return unique.length > 0 ? unique : ['analysis'];
  }

  /**
   * 解析 capabilities（从 JSON 字符串）
   */
  private parseCapabilities(employee: EmployeeRecord): string[] {
    try {
      const parsed = JSON.parse(employee.capabilities) as unknown[];
      // 不进行硬编码过滤，只验证类型
      return parsed.filter((cap): cap is string => typeof cap === 'string' && cap.length > 0);
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // 私有方法 - 匹配逻辑
  // ---------------------------------------------------------------------------

  /**
   * 查找最佳匹配的 employee
   *
   * 匹配算法：
   * 1. 精确匹配：能力完全相同
   * 2. 包含匹配：员工能力包含所需能力
   * 3. 部分匹配：有部分能力重叠
   */
  private findBestMatchingEmployee(requiredCaps: string[]): MatchResult {
    if (requiredCaps.length === 0) {
      return { employee: null, matchScore: 0, matchReason: '无能力要求' };
    }

    const employees = this.getActiveEmployees();
    let bestMatch: EmployeeRecord | null = null;
    let bestScore = 0;
    let bestReason = '';

    for (const emp of employees) {
      const empCaps = this.parseCapabilities(emp);
      const result = this.calculateMatchScore(requiredCaps, empCaps);

      console.log(`[AgentFactory]   ${emp.name} (${emp.role}): [${empCaps.join(', ')}] → ${result.score} 分 (${result.reason})`);

      if (result.score > bestScore) {
        bestMatch = emp;
        bestScore = result.score;
        bestReason = result.reason;
      }
    }

    console.log(`[AgentFactory] ⭐ 最佳：${bestMatch?.name || '无'} (${bestScore} 分) - ${bestReason}`);
    return { employee: bestMatch, matchScore: bestScore, matchReason: bestReason };
  }

  /**
   * 计算匹配分数和原因
   *
   * 匹配规则：
   * - 完全匹配：所有能力都匹配 → 100 分
   * - 包含匹配：员工能力包含所有所需能力 → 80 分
   * - 部分匹配：有部分能力重叠 → 每个能力 10 分
   */
  private calculateMatchScore(
    required: readonly string[],
    employeeCaps: readonly string[]
  ): { score: number; reason: string } {
    // 完全匹配
    if (required.length === employeeCaps.length &&
        required.every(c => employeeCaps.includes(c))) {
      return { score: 100, reason: '完全匹配' };
    }

    // 包含匹配：员工能力包含所有所需能力
    if (required.every(c => employeeCaps.includes(c))) {
      return { score: 80, reason: '包含匹配（员工能力更全面）' };
    }

    // 部分匹配：计算重叠能力数
    let overlapCount = 0;
    const overlappingCaps: string[] = [];
    for (const cap of required) {
      if (employeeCaps.includes(cap)) {
        overlapCount++;
        overlappingCaps.push(cap);
      }
    }

    if (overlapCount > 0) {
      return { score: overlapCount * 10, reason: `部分匹配 (${overlappingCaps.join(', ')})` };
    }

    return { score: 0, reason: '无匹配能力' };
  }

  /**
   * 获取所有 active employees
   */
  private getActiveEmployees(): EmployeeRecord[] {
    const sql = `
      SELECT id, name, role, system_prompt, capabilities
      FROM employees
      WHERE status = 'active'
    `;
    return this.db.prepare(sql).all() as EmployeeRecord[];
  }

  /**
   * 转换为 AgentDefinition
   */
  private toAgentDefinition(employee: EmployeeRecord): AgentDefinition {
    return {
      id: employee.id,
      name: employee.name,
      role: employee.role || undefined,
      capabilities: this.parseCapabilities(employee),
      systemPrompt: employee.system_prompt,
    };
  }

  // ---------------------------------------------------------------------------
  // 私有方法 - 招募逻辑
  // ---------------------------------------------------------------------------

  /**
   * 招募新 employee（写入数据库）
   */
  private recruitNewEmployee(
    requirement: AgentRequirement,
    capabilities: string[]
  ): AgentDefinition {
    const id = this.generateId();
    const name = this.generateName(capabilities);
    const role = this.generateRoleLabel(capabilities);
    const systemPrompt = this.generateSystemPrompt(requirement, capabilities);

    this.insertEmployee({ id, name, role, systemPrompt, capabilities });

    return { id, name, role, capabilities, systemPrompt };
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `emp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * 生成姓名（基于主要能力）
   */
  private generateName(capabilities: string[]): string {
    // 基于主要能力生成名字
    const primary = capabilities[0];

    // 常见能力的默认名字
    const commonNames: Record<string, string> = {
      coding: '技术专家',
      writing: '内容创作者',
      analysis: '分析师',
      planning: '规划师',
      communication: '沟通专家',
      research: '研究员',
      review: '审查员',
      automation: '自动化专家',
    };

    if (commonNames[primary]) {
      return commonNames[primary];
    }

    // 动态能力：基于能力名称生成
    if (primary.includes('开发') || primary.includes('编程')) return '开发工程师';
    if (primary.includes('设计')) return '设计师';
    if (primary.includes('测试')) return '测试工程师';
    if (primary.includes('运维')) return '运维工程师';
    if (primary.includes('产品')) return '产品经理';
    if (primary.includes('数据')) return '数据工程师';

    return `AI 助手 (${primary})`;
  }

  /**
   * 生成角色标签（基于能力）
   */
  private generateRoleLabel(capabilities: string[]): string {
    const primary = capabilities[0];

    // 常见能力的默认标签
    const commonLabels: Record<string, string> = {
      coding: 'Technical Lead',
      writing: 'Content Creator',
      analysis: 'Analyst',
      planning: 'Planner',
      communication: 'Communicator',
      research: 'Researcher',
      review: 'Reviewer',
      automation: 'Automation Specialist',
    };

    if (commonLabels[primary]) {
      return commonLabels[primary];
    }

    // 动态生成：首字母大写
    return primary.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  /**
   * 生成 system prompt
   *
   * 极简设计：
   * - CEO 身份和职责
   * - 工具简单列表
   * - 不给流程，不给例子
   */
  private generateSystemPrompt(
    requirement: AgentRequirement,
    capabilities: string[]
  ): string {
    const { taskDescription, context } = requirement;

    const sections = [
      `# CEO 信息`,
      `姓名：${this.generateName(capabilities)}`,
      `角色：AI Company CEO`,
      `职责：分析需求，决策执行，确保任务完成`,
      ``,
      `# 你的能力`,
      ...capabilities.map(cap => `  - ${this.getCapabilityDescription(cap)}`),
      ``,
      `# 可用工具`,
      this.getSimpleToolList(),
      ``,
      `# 当前任务`,
      taskDescription,
    ];

    if (context) {
      sections.push(``, `# 上下文`, context);
    }

    return sections.join('\n');
  }

  /**
   * 简单工具列表（不给例子，不给详细说明）
   */
  private getSimpleToolList(): string {
    // 从工具注册表获取所有工具
    // 只给名称和描述，让 AI 自己探索
    const tools = [
      'Bash - 运行命令',
      'Read - 读取文件',
      'Write - 创建文件',
      'Edit - 修改文件',
      'Glob - 查找文件',
      'Grep - 搜索内容',
      'LS - 列出目录',
      'BrowserOpen - 打开网页',
      'BrowserClick - 点击元素',
      'BrowserType - 输入文本',
      'BrowserWait - 等待加载',
      'BrowserGetText - 获取文本',
      'BrowserScreenshot - 截图',
      'BrowserClose - 关闭浏览器',
      'HTTP - 网络请求',
      'request_interaction - 请求用户交互',
      '... 等 45 个工具',
    ];

    return tools.join('\n');
  }

  /**
   * 获取能力描述
   */
  private getCapabilityDescription(cap: string): string {
    // 常见能力的默认描述
    const commonDescriptions: Record<string, string> = {
      coding: '代码开发：编写高质量、可维护的代码，进行技术架构设计',
      writing: '内容创作：撰写文章、文案、技术文档等各类内容',
      analysis: '数据分析：分析问题、诊断故障、提供洞察',
      planning: '方案规划：制定计划、设计流程、规划实施路径',
      communication: '沟通协调：清晰表达、协调资源、推动协作',
      research: '信息研究：收集资料、调研问题、整理信息',
      review: '质量审查：审查代码、文档、方案，发现潜在问题',
      automation: '流程自动化：设计脚本、优化流程、提升效率',
    };

    if (commonDescriptions[cap]) {
      return commonDescriptions[cap];
    }

    // 动态生成描述
    return `${cap.charAt(0).toUpperCase() + cap.slice(1)}: ${cap} 相关的工作`;
  }

  /**
   * 插入 employee 到数据库
   */
  private insertEmployee(params: {
    id: string;
    name: string;
    role: string;
    systemPrompt: string;
    capabilities: string[];
  }): void {
    const sql = `
      INSERT INTO employees (
        id, name, role, system_prompt, capabilities,
        model, temperature, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    this.db.prepare(sql).run(
      params.id,
      params.name,
      params.role,
      params.systemPrompt,
      JSON.stringify(params.capabilities),
      'claude-sonnet-4-20250514',
      0.7,
      'active',
      Date.now()
    );
  }

  // ---------------------------------------------------------------------------
  // 公共方法 - 查询与统计
  // ---------------------------------------------------------------------------

  /**
   * 获取所有 employees
   */
  getAllEmployees(): Array<{
    id: string;
    name: string;
    role: string;
    capabilities: string[];
  }> {
    const sql = `
      SELECT id, name, role, capabilities
      FROM employees
      WHERE status = 'active'
      ORDER BY created_at DESC
    `;

    const rows = this.db.prepare(sql).all() as EmployeeRecord[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      role: row.role,
      capabilities: this.parseCapabilities(row),
    }));
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalEmployees: number;
    byRole: Record<string, number>;
    byCapability: Record<string, number>;
  } {
    const all = this.getAllEmployees();
    const byRole: Record<string, number> = {};
    const byCapability: Record<string, number> = {};

    for (const emp of all) {
      byRole[emp.role] = (byRole[emp.role] || 0) + 1;

      for (const cap of emp.capabilities) {
        byCapability[cap] = (byCapability[cap] || 0) + 1;
      }
    }

    return {
      totalEmployees: all.length,
      byRole,
      byCapability,
    };
  }
}

// ============================================================================
// 单例
// ============================================================================

let factoryInstance: AgentFactory | null = null;

export function getAgentFactory(db: AIDatabase): AgentFactory {
  if (!factoryInstance) {
    factoryInstance = new AgentFactory(db);
  }
  return factoryInstance;
}
