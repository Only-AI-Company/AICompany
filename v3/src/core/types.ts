/**
 * AI Company v3 - Core Types
 */

// ============================================================================
// Goal Types
// ============================================================================

export type GoalStatus = 'active' | 'completed' | 'failed' | 'paused';

export interface Goal {
  id: string;
  description: string;
  timeframe: string;           // "30天", "1个月" 等
  status: GoalStatus;
  parentGoalId?: string;       // 拆解后的子目标指向父目标
  subGoals?: string[];         // 拆解后的子目标ID列表
  plan?: Plan;                 // 关联的执行计划
  createdAt: number;
  completedAt?: number;
  progress?: number;           // 0-100
}

// ============================================================================
// Plan Types
// ============================================================================

export type PlanStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface PlanStep {
  id: string;
  description: string;
  taskId?: string;             // 关联的任务ID
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  dependencies?: string[];     // 依赖的步骤ID
  estimatedDuration?: number;  // 预估时间（分钟）
}

export interface Plan {
  id: string;
  goalId: string;
  description: string;
  steps: PlanStep[];
  status: PlanStatus;
  currentStepIndex: number;    // 当前执行到第几步
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

// ============================================================================
// Task Types
// ============================================================================

export type TaskStatus = 'pending' | 'scheduled' | 'executing' | 'completed' | 'failed';

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  planId?: string;
  goalId?: string;
  description: string;
  requiredCapabilities: string[];  // 需要的技能
  employeeId?: string;
  status: TaskStatus;
  priority: TaskPriority;
  input?: string;                 // 用户原始输入
  result?: TaskResult;
  createdAt: number;
  scheduledAt?: number;
  startedAt?: number;
  completedAt?: number;
}

export interface TaskResult {
  success: boolean;
  output?: string;
  error?: string;
  duration?: number;              // 执行时长（毫秒）
  metadata?: Record<string, any>;
}

// ============================================================================
// Employee Types
// ============================================================================

export interface Employee {
  id: string;
  name: string;
  role: string;
  skills: string[];               // 技能列表
  level: number;                  // 等级 1-10
  performance: number;            // 绩效分数
  satisfaction: number;           // 满意度 0-100
  systemPrompt: string;           // 系统提示词
  capabilities: string[];         // 能力列表（对应工具）
  createdAt: number;
  lastUsedAt?: number;

  // 执行任务的方法
  execute?(task: Task): Promise<TaskResult>;
  evolve?(newSkills: string[]): void;
  levelUp?(): void;
  updatePerformance?(delta: number): void;
}

// ============================================================================
// Review Types
// ============================================================================

export interface Review {
  id: string;
  taskId: string;
  employeeId: string;
  score: number;                  // 1-10
  strengths: string[];            // 优点
  improvements: string[];         // 改进点
  learnings: string[];            // 经验教训
  shouldUpdatePerformance: boolean;
  performanceDelta?: number;      // 绩效变化
  levelUp?: boolean;              // 是否升级
  createdAt: number;
}

// ============================================================================
// System Status Types
// ============================================================================

export interface SystemStatus {
  engineRunning: boolean;
  currentGoalId?: string;
  activeGoals: number;
  activeTasks: number;
  pendingTasks: number;
  completedTasks: number;
  failedTasks: number;
  activeEmployees: number;
  lastReviewAt?: number;
  uptime: number;                 // 运行时长（秒）
  lastUpdateAt: number;
}

// ============================================================================
// CEO Types
// ============================================================================

export interface Understanding {
  userWant: string;               // 用户想要什么
  intentType: 'goal' | 'task' | 'chat' | 'command';
  confidence: number;             // 0-1
  reasoning: string;              // 推理过程
  suggestedAction?: string;       // 建议的操作
}

export interface CEOAnalysis {
  understanding: Understanding;
  suggestedEmployeeId?: string;
  suggestedPlan?: Plan;
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
}

// ============================================================================
// Memory Types (复用 v2)
// ============================================================================

export interface EpisodicMemory {
  id: string;
  taskDescription: string;
  employeeId: string;
  status: 'success' | 'failure';
  output?: string;
  error?: string;
  reflection?: {
    learnings: string[];
    improvements: string[];
  };
  createdAt: number;
}

export interface SemanticMemory {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  confidence: number;            // 0-1
  learnings: string[];
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Event Types
// ============================================================================

export type SystemEventType =
  | 'engine.started'
  | 'engine.stopped'
  | 'goal.created'
  | 'goal.decomposed'
  | 'goal.completed'
  | 'plan.created'
  | 'plan.started'
  | 'plan.completed'
  | 'plan.cancelled'
  | 'step.started'
  | 'step.completed'
  | 'step.failed'
  | 'task.created'
  | 'task.scheduled'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'review.completed'
  | 'employee.evolved'
  | 'employee.recruited'
  | 'employee.fired'
  | 'memory.extracted'
  | 'user.input'
  | 'user.chat';

export interface SystemEvent {
  type: SystemEventType;
  timestamp: number;
  data: Record<string, any>;
}

// ============================================================================
// Tool Types
// ============================================================================

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required: boolean }>;
  execute: (params: any) => Promise<any>;
}

// ============================================================================
// Progress Types
// ============================================================================

export interface GoalProgress {
  goalId: string;
  description: string;
  progress: number;              // 0-100
  status: GoalStatus;
  completedSteps: number;
  totalSteps: number;
  estimatedCompletion?: number;  // 预计完成时间
  blockers: string[];            // 阻塞因素
}

export interface SystemProgress {
  goals: GoalProgress[];
  activeTasks: number;
  completedToday: number;
  uptime: number;
  lastUpdate: number;
}
