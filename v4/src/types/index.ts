/**
 * AI Company v4 - 核心类型定义
 */

// ============================================================================
// Agent 类型
// ============================================================================

export type AgentRole =
  | 'ceo'
  | 'manager'
  | 'researcher'
  | 'creator'
  | 'publisher'
  | 'analyst'
  | 'optimizer'
  | 'specialist';

export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'planning'
  | 'acting'
  | 'reflecting'
  | 'learning'
  | 'busy'
  | 'error'
  | 'stopped';

export type AgentCapability =
  | 'strategic_thinking'
  | 'planning'
  | 'execution'
  | 'tool_use'
  | 'memory'
  | 'learning'
  | 'communication'
  | 'collaboration'
  | 'research'
  | 'creation'
  | 'analysis'
  | 'optimization';

// ============================================================================
// 任务类型
// ============================================================================

export type TaskType =
  | 'goal'           // 长期目标
  | 'task'           // 单次任务
  | 'query'          // 查询请求
  | 'chat'           // 聊天对话
  | 'scheduled';     // 定时任务

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'waiting_approval'
  | 'waiting_feedback'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskPriority =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low';

export interface Task {
  id: string;
  type: TaskType;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: number;
  updatedAt: number;
  userId?: string;
  conversationId?: string;
  result?: any;
  error?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// 消息类型
// ============================================================================

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, any>;
  timestamp: number;
}

export interface Conversation {
  id: string;
  userId: string;
  source: MessageSource;
  title?: string;
  status: 'active' | 'archived';
  createdAt: number;
  updatedAt: number;
}

export type MessageSource = 'telegram' | 'mobile_app' | 'web' | 'cli';

// ============================================================================
// 通信层类型
// ============================================================================

export interface WebSocketMessage {
  type: WSMessageType;
  payload: any;
  timestamp?: number;
}

export type WSMessageType =
  | 'chat_message'
  | 'chat_response'
  | 'task_created'
  | 'task_updated'
  | 'task_completed'
  | 'system_event'
  | 'error'
  | 'ping'
  | 'pong';

export interface RestApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ============================================================================
// 交互层类型
// ============================================================================

export interface Intent {
  type: IntentType;
  confidence: number;
  entities: Record<string, any>;
  rawInput: string;
}

export type IntentType =
  | 'query'              // 信息查询
  | 'task'               // 任务执行
  | 'goal'               // 长期目标
  | 'chat'               // 闲聊
  | 'status'             // 状态查询
  | 'config'             // 配置修改
  | 'approval_request'   // 审批请求
  | 'feedback_request';  // 反馈请求

export interface InteractionContext {
  userId: string;
  source: MessageSource;
  conversationId: string;
  createdAt?: number;
  intent?: Intent;
  pendingApproval?: ApprovalRequest;
  pendingFeedback?: FeedbackRequest;
}

export interface ApprovalRequest {
  id: string;
  taskId: string;
  description: string;
  risk: RiskLevel;
  options: string[];
  timeout?: number;
}

export interface FeedbackRequest {
  id: string;
  taskId: string;
  question: string;
  type: 'rating' | 'text' | 'selection';
  options?: string[];
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

// ============================================================================
// 编排层类型
// ============================================================================

export interface OrchestratorConfig {
  maxConcurrentTasks: number;
  defaultPriority: TaskPriority;
  autoApproveLowRisk: boolean;
}

export interface TaskContext {
  taskId: string;
  goal: Goal;
  constraints: Constraints;
  currentState: AgentStatus;
  availableAgents: AgentInfo[];
  availableTools: ToolInfo[];
  history: TaskHistory;
  relevantMemories: Memory[];
}

// ============================================================================
// 目标与计划
// ============================================================================

export interface Goal {
  id: string;
  description: string;
  type: 'strategic' | 'tactical' | 'operational';
  priority: TaskPriority;
  timeframe: string;
  successCriteria: SuccessCriteria;
  constraints: Constraints;
  status: GoalStatus;
}

export type GoalStatus = 'active' | 'completed' | 'paused' | 'cancelled';

export interface SuccessCriteria {
  metrics: Record<string, number>;
  description: string;
}

export interface Constraints {
  time?: TimeConstraint;
  resources?: ResourceConstraint;
  quality?: QualityConstraint;
  risk?: RiskConstraint;
}

export interface TimeConstraint {
  deadline?: number;
  maxDuration?: number;
}

export interface ResourceConstraint {
  maxTokens?: number;
  maxApiCalls?: number;
  budget?: number;
}

export interface QualityConstraint {
  minQualityScore?: number;
  requireReview?: boolean;
}

export interface RiskConstraint {
  maxRiskLevel?: RiskLevel;
  requireApproval?: boolean;
}

// ============================================================================
// 工具类型
// ============================================================================

export interface Tool {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: any;
  outputSchema: any;
  execute: (params: any) => Promise<ToolResult>;
  validate: (params: any) => boolean;
}

export type ToolCategory =
  | 'llm'
  | 'web'
  | 'browser'
  | 'file'
  | 'platform'
  | 'system'
  | 'xiaohongshu';

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface ToolInfo {
  name: string;
  description: string;
  category: ToolCategory;
}

// ============================================================================
// 记忆类型
// ============================================================================

export interface Memory {
  id: string;
  type: MemoryType;
  content: any;
  importance: number;
  confidence: number;
  timestamp: number;
  embedding?: number[];
  accessCount: number;
  lastAccessed: number;
}

export type MemoryType =
  | 'episodic'     // 情景记忆
  | 'semantic'     // 语义记忆
  | 'procedural';  // 程序记忆

export interface MemoryQuery {
  query?: string;
  types?: MemoryType[];
  filters?: Record<string, any>;
  limit?: number;
  minImportance?: number;
}

// ============================================================================
// Agent 执行类型
// ============================================================================

export interface ThoughtProcess {
  observations: Observation[];
  reasoning: Reasoning;
  decision: Decision;
  selfCritique?: SelfCritique;
}

export interface Observation {
  type: string;
  content: string;
  source: string;
  confidence: number;
}

export interface Reasoning {
  initialHypothesis: string;
  evidenceChain: Evidence[];
  conclusion: string;
  confidence: number;
  reasoningType: 'deductive' | 'inductive' | 'abductive';
}

export interface Evidence {
  type: string;
  content: string;
  weight: number;
}

export interface Decision {
  selectedAction: Action;
  alternatives: AlternativeAction[];
  rationale: string;
  expectedOutcome: string;
}

export interface AlternativeAction {
  action: Action;
  pros: string[];
  cons: string[];
  score: number;
}

export interface SelfCritique {
  concerns: string[];
  adjustments: string[];
  confidenceAdjustment: number;
}

// ============================================================================
// 行动类型
// ============================================================================

export interface Action {
  id: string;
  type: ActionType;
  agentId: string;
  description: string;
  parameters: Record<string, any>;
  expectedOutcome?: string;
  riskAssessment?: RiskAssessment;
  metadata?: Record<string, any>;
}

export type ActionType =
  | 'think'
  | 'plan'
  | 'execute'
  | 'use_tool'
  | 'collaborate'
  | 'delegate'
  | 'request_info'
  | 'report'
  | 'learn';

export interface RiskAssessment {
  level: RiskLevel;
  factors: string[];
  mitigation?: string[];
}

export interface ActionResult {
  actionId: string;
  agentId: string;
  timestamp: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
  output?: any;
  error?: string;
  duration?: number;
  qualityScore?: number;
  newObservations?: Observation[];
  nextActions?: Action[];
}

// ============================================================================
// 学习类型
// ============================================================================

export interface Experience {
  id: string;
  agentId: string;
  taskId: string;
  action: Action;
  result: ActionResult;
  context: TaskContext;
  timestamp: number;
}

export interface Reflection {
  id: string;
  agentId: string;
  actionId: string;
  timestamp: number;
  selfEvaluation: SelfEvaluation;
  improvements: string[];
  learnings: string[];
  adjustments: Adjustments;
}

export interface SelfEvaluation {
  success: boolean;
  quality: number;
  efficiency: number;
  satisfaction: number;
}

export interface Adjustments {
  keep: string[];
  change: string[];
  add: string[];
  remove: string[];
}

// ============================================================================
// 辅助类型
// ============================================================================

export interface AgentInfo {
  id: string;
  name: string;
  role: AgentRole;
  capabilities: AgentCapability[];
  status: AgentStatus;
}

export interface TaskHistory {
  actions: Action[];
  results: ActionResult[];
  reflections: Reflection[];
}

// ============================================================================
// 导出
// ============================================================================

export * from './api/types';
export * from './agent/types';
