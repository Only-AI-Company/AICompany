/**
 * AI Company v2 - Agent System Types
 *
 * 核心理念：
 * - Agent 能力是动态的，不是预定义枚举
 * - LLM 根据任务需要自由推断所需"技能"
 * - 能力用于员工匹配和任务分配
 */

// ============================================================================
// 能力定义（动态）
// ============================================================================

/**
 * Agent 能力
 *
 * 能力是自由文本字符串，不再预定义枚举
 * LLM 可以根据任务需要自由推断所需技能
 *
 * 常见能力示例（仅供参考，不是限制）：
 * - coding: 代码开发、架构设计
 * - writing: 内容创作、文案撰写
 * - analysis: 数据分析、问题诊断
 * - planning: 方案规划、策略制定
 * - communication: 沟通协调、用户交互
 * - research: 信息收集、资料调研
 * - review: 质量审查、合规检查
 * - automation: 流程自动化、脚本编写
 */
export type AgentCapability = string;

/**
 * 常见能力列表（仅供参考）
 */
export const CommonCapabilities = [
  'coding',
  'writing',
  'analysis',
  'planning',
  'communication',
  'research',
  'review',
  'automation',
] as const;

// ============================================================================
// Agent 定义
// ============================================================================

/**
 * Agent 定义（核心接口）
 *
 * 一个 Agent 由以下要素定义：
 * - capabilities: 能做什么（自由文本描述）
 * - systemPrompt: 如何做（技能边界、工作原则）
 * - name: 人类可读标识
 * - role: 可选的角色标签（仅用于人类理解）
 */
export interface AgentDefinition {
  id: string;
  name: string;
  role?: string;
  capabilities: AgentCapability[];
  systemPrompt: string;
}

/**
 * Agent 任务
 */
export interface AgentTask {
  id: string;
  description: string;
  requiredCapabilities: AgentCapability[];  // 动态能力列表
  priority: 'low' | 'medium' | 'high' | 'critical';
  context?: string;
}

/**
 * Agent 任务结果
 */
export interface AgentTaskResult {
  taskId: string;
  success: boolean;
  output?: string;
  error?: string;
  artifacts?: AgentArtifact[];
  metadata?: {
    duration?: number;
    tokensUsed?: number;
  };
}

/**
 * Agent 产出物
 */
export interface AgentArtifact {
  type: 'code' | 'document' | 'plan' | 'report' | 'data';
  name: string;
  content?: string;
  path?: string;
}

// ============================================================================
// Agent 状态
// ============================================================================

/**
 * Agent 状态
 */
export type AgentState =
  | 'idle'       // 空闲，可接受新任务
  | 'busy'       // 执行中
  | 'error';     // 错误状态

/**
 * Agent 状态信息
 */
export interface AgentStatus {
  id: string;
  name: string;
  state: AgentState;
  capabilities: AgentCapability[];
  currentTaskId?: string;
  /** 所有活跃任务 ID 列表（支持并行任务） */
  activeTaskIds?: string[];
  /** 活跃任务数量 */
  activeTasksCount?: number;
  completedTasks: number;
  failedTasks: number;
  lastActiveAt?: number;
}
