/**
 * Agent 层类型定义
 */

import type {
  AgentRole,
  AgentStatus,
  AgentCapability,
  ThoughtProcess,
  Action,
  ActionResult,
  Reflection,
  Memory,
  MemoryQuery,
  TaskContext,
  Goal,
  Constraints,
  Experience
} from '../index';

// ============================================================================
// Agent 接口
// ============================================================================

export interface Agent {
  // 基本信息
  readonly id: string;
  readonly name: string;
  readonly role: AgentRole;
  readonly capabilities: AgentCapability[];

  // 状态
  readonly status: AgentStatus;

  // 核心能力
  think(context: TaskContext): Promise<ThoughtProcess>;
  plan(goal: Goal, constraints: Constraints): Promise<Plan>;
  act(action: Action, context: ExecutionContext): Promise<ActionResult>;
  reflect(action: Action, result: ActionResult): Promise<Reflection>;

  // 记忆与学习
  learn(experience: Experience): Promise<void>;
  recall(query: MemoryQuery): Promise<Memory[]>;

  // 协作
  collaborate(agents: Agent[], task: any, role: CollaborationRole): Promise<any>;
  delegate(task: any, candidates: Agent[]): Promise<DelegationDecision>;

  // 生命周期
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  reset(): Promise<void>;

  // 监控
  getState(): AgentState;
  getMetrics(): AgentMetrics;
}

export type CollaborationRole = 'leader' | 'contributor' | 'reviewer';

// ============================================================================
// Agent 配置
// ============================================================================

export interface AgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface AgentDependencies {
  llm: any;  // ClaudeClient
  memory: any;  // MemorySystem
  tools: any;  // ToolRegistry
}

// ============================================================================
// Agent 状态与指标
// ============================================================================

export interface AgentState {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  capabilities: AgentCapability[];
  currentTask?: string;
  error?: string;
}

export interface AgentMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  avgTaskDuration: number;
  avgQualityScore: number;
  toolCallsCount: number;
  llmTokensUsed: number;
  lastActive: number;
}

// ============================================================================
// 执行上下文
// ============================================================================

export interface ExecutionContext {
  taskId: string;
  userId: string;
  conversationId: string;
  source: string;
  variables: Record<string, any>;
  parentContext?: ExecutionContext;
}

// ============================================================================
// 计划
// ============================================================================

export interface Plan {
  id: string;
  goalId: string;
  steps: PlanStep[];
  dependencies: DependencyGraph;
  resourceRequirements: ResourceRequirement[];
  timeline: Timeline;
  contingencyPlans: ContingencyPlan[];
}

export interface PlanStep {
  id: string;
  description: string;
  agentId?: string;
  tool?: string;
  estimatedDuration: number;
  dependencies: string[];
  successCriteria: SuccessCriteria;
}

export interface DependencyGraph {
  nodes: string[];
  edges: Array<{ from: string; to: string }>;
}

export interface ResourceRequirement {
  type: string;
  amount: number;
  unit: string;
}

export interface Timeline {
  estimatedStart: number;
  estimatedEnd: number;
  milestones: Milestone[];
}

export interface Milestone {
  id: string;
  description: string;
  targetDate: number;
  completed: boolean;
}

export interface SuccessCriteria {
  metrics: Record<string, number>;
  description: string;
}

export interface ContingencyPlan {
  trigger: string;
  actions: string[];
}

// ============================================================================
// 委派决策
// ============================================================================

export interface DelegationDecision {
  selectedAgent: string;
  confidence: number;
  rationale: string;
  alternatives: Array<{
    agentId: string;
    score: number;
  }>;
}

// ============================================================================
// 工具相关
// ============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  inputSchema: any;
  outputSchema: any;
  execute: (params: any) => Promise<any>;
  validate: (params: any) => boolean;
}

export interface ToolRegistry {
  register(tool: ToolDefinition): void;
  unregister(name: string): void;
  execute(name: string, params: any): Promise<any>;
  list(category?: string): ToolDefinition[];
  getSchemaForLLM(): string;
}
