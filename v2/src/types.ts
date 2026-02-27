/**
 * AI Company v2 - 类型定义
 * 所有类型集中定义，便于理解和维护
 */

// ============================================================================
// 输入相关
// ============================================================================

export type InputSource = 'cli' | 'telegram' | 'web' | 'cron' | 'system';

export interface InputMessage {
  id: string;
  source: InputSource;
  content: string;
  userId?: string;
  chatId?: string;
  timestamp: number;
  rawData?: any;
}

export interface InputClassification {
  type: 'task' | 'goal' | 'script' | 'chat' | 'query';
  confidence: number;
  params: Record<string, any>;
}

// ============================================================================
// 意图相关
// ============================================================================

export type IntentType =
  | 'create_task'
  | 'create_goal'
  | 'create_script'
  | 'execute_cron'
  | 'query_status'
  | 'query_tasks'
  | 'query_goals'
  | 'query_employees'
  | 'chat'
  | 'open_task'
  | 'unknown';

export interface IntentAnalysis {
  type: IntentType;
  confidence: number;
  entities: {
    description?: string;
    title?: string;
    goalType?: 'long_term' | 'short_term' | 'recurring';
    priority?: 'urgent' | 'high' | 'medium' | 'low';
    dueDate?: number;
    cronRule?: string;
    recurring?: {
      frequency: 'daily' | 'weekly' | 'monthly';
      time?: string;
      autoRenew?: boolean;
    };
  };
  reasoning?: string;
}

// ============================================================================
// 执行相关
// ============================================================================

export type ExecutionType = 'task' | 'goal' | 'cron' | 'script';
export type ExecutionStatus = 'pending' | 'planning' | 'executing' | 'completed' | 'failed' | 'cancelled';

export interface ExecutionRequest {
  type: ExecutionType;
  description: string;
  params?: Record<string, any>;
  workDir?: string;
  correlationId?: string;
  source?: {
    type: InputSource;
    userId?: string;
    chatId?: string;
    id?: string;
  };
}

export interface ExecutionResult {
  success: boolean;
  status: ExecutionStatus;
  output?: string;
  error?: string;
  artifacts?: Artifact[];
  metadata?: {
    duration?: number;
    iterations?: number;
    completionPercentage?: number;
  };
}

export interface Artifact {
  type: 'file' | 'directory' | 'url' | 'data';
  path?: string;
  content?: string;
  metadata?: Record<string, any>;
}

export interface ExecutionProgress {
  executionId: string;
  status: ExecutionStatus;
  percentage: number;
  currentStep?: string;
  totalSteps?: number;
  message?: string;
  timestamp: number;
}

// ============================================================================
// 目标相关
// ============================================================================

export type GoalType = 'long_term' | 'short_term' | 'recurring';
export type GoalStatus = 'pending' | 'pending_owner' | 'planning' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface CreateGoalRequest {
  type: GoalType;
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  dueDate?: number;
  parentGoalId?: string;
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    cronRule?: string;
    autoRenew: boolean;
  };
  initialPlan?: {
    steps: Array<{
      name: string;
      description: string;
      estimatedMinutes?: number;
    }>;
  };
}

export interface Goal {
  id: string;
  type: GoalType;
  title: string;
  description?: string;
  status: GoalStatus;
  acceptanceCriteria?: string;
  dueDate?: number;
  parentGoalId?: string;
  recurring?: string; // JSON string
  ownerId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface GoalProgress {
  goalId: string;
  title: string;
  completionPercentage: number;
  status: GoalStatus;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  failedTasks: number;
}

export interface GoalPlan {
  steps: Array<{
    id: string;
    name: string;
    description: string;
    estimatedMinutes: number;
    tool?: string;
  }>;
  totalEstimatedMinutes: number;
  prerequisites?: string[];
}

// ============================================================================
// 任务相关
// ============================================================================

export type TaskStatus = 'pending' | 'assigned' | 'planning' | 'executing' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  type: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  goalId?: string;
  workDir?: string;
  assignedTo?: string;
  requestedBy: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  output?: string;
  error?: string;
}

// ============================================================================
// Cron相关
// ============================================================================

export interface CronJob {
  id: string;
  name: string;
  description?: string;
  command: string;
  args?: Record<string, any>;
  cronRule: string;
  enabled: boolean;
  goalId?: string;
  timeout?: number;
  workingDir?: string;
  env?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
  lastRun?: number;
  nextRun?: number;
}

// ============================================================================
// 事件相关
// ============================================================================

export const EventType = {
  // 输入事件
  INPUT_RECEIVED: 'input.received',
  INPUT_CLASSIFIED: 'input.classified',

  // 意图事件
  INTENT_ANALYZED: 'intent.analyzed',

  // 执行事件
  EXECUTION_STARTED: 'execution.started',
  EXECUTION_PROGRESS: 'execution.progress',
  EXECUTION_COMPLETED: 'execution.completed',
  EXECUTION_FAILED: 'execution.failed',

  // 目标事件
  GOAL_CREATED: 'goal.created',
  GOAL_STARTED: 'goal.started',
  GOAL_PROGRESS: 'goal.progress',
  GOAL_COMPLETED: 'goal.completed',
  GOAL_FAILED: 'goal.failed',
  GOAL_PLAN_CREATED: 'goal.plan_created',
  GOAL_STATUS_CHANGED: 'goal.status_changed',

  // 任务事件
  TASK_CREATED: 'task.created',
  TASK_COMPLETED: 'task.completed',
  TASK_FAILED: 'task.failed',

  // 员工事件
  EMPLOYEE_CREATED: 'employee.created',

  // Cron事件
  CRON_CREATED: 'cron.created',
  CRON_TRIGGERED: 'cron.triggered',
  CRON_COMPLETED: 'cron.completed',
  CRON_FAILED: 'cron.failed',

  // 响应事件
  RESPONSE_READY: 'response.ready',

  // 通知事件
  NOTIFICATION_NEEDED: 'notification.needed',

  // 配置事件
  CONFIG_UPDATED: 'config.updated',
} as const;

export type EventTypeName = typeof EventType[keyof typeof EventType];

export type SystemEvent = {
  type: EventTypeName;
  data: any;
  timestamp: number;
};

export type EventHandler = (event: SystemEvent) => void | Promise<void>;

// ============================================================================
// 员工相关
// ============================================================================

export type EmployeeState = 'idle' | 'busy' | 'error' | 'offline';

export interface Employee {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'inactive';
  systemPrompt: string;
  model: string;
  temperature: number;
  createdAt: number;

  // 统计信息
  total_tasks?: number;
  completed_tasks?: number;
  failed_tasks?: number;

  // 积分系统
  points?: number;
  level?: number;

  // 满意度 (0-100)
  satisfaction?: number;

  // 当前状态
  current_state?: EmployeeState;

  // 最后活动时间
  last_activity_at?: number;
}

// ============================================================================
// Humans 相关
// ============================================================================

export interface Human {
  id: string;
  name: string;
  gender?: 'male' | 'female' | 'other';
  location?: string;
  birthday?: string;
  appearance?: string;
  personalityTraits?: string;
  hobbies?: string;
  workPreferences?: string;
  skills?: string;
  weaknesses?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// 配置相关
// ============================================================================

export interface AIProviderConfig {
  active: string;
  providers: Record<string, {
    apiKey?: string;
    baseURL?: string;
    model?: string;
  }>;
}

export interface TelegramConfig {
  enabled: boolean;
  botToken?: string;
}

export interface Config {
  aiProvider: AIProviderConfig;
  telegram: TelegramConfig;
  company: {
    name: string;
    timezone: string;
  };
}

// ============================================================================
// 通知相关
// ============================================================================

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  content: string;
  channels: Array<'telegram' | 'cli'>;
  userId?: string;
  chatId?: string;
  timestamp: number;
}

// ============================================================================
// 数据库相关
// ============================================================================

export interface Database {
  prepare(sql: string): Statement;
  exec(sql: string): void;
}

export interface Statement {
  run(...params: any[]): RunResult;
  get(...params: any[]): any;
  all(...params: any[]): any[];
}

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}
