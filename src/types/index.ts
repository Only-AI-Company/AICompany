/**
 * AI Company - Core Types
 *
 * 核心类型定义（不含枚举常量）
 */

// ============================================================================
// 基础类型
// ============================================================================

/** 员工状态 */
export type EmployeeStatus = 'active' | 'busy' | 'offline' | 'unavailable' | 'archived';

/** 员工性别 */
export type EmployeeGender = 'male' | 'female' | 'non-binary';

/** 员工情绪 */
export type EmployeeMood = 'happy' | 'neutral' | 'stressed' | 'excited' | 'tired' | 'focused';

/** 员工性格特质 */
export type EmployeeTrait =
  | 'analytical'      // 分析型
  | 'creative'        // 创造型
  | 'detail-oriented' // 注重细节
  | 'leadership'      // 领导力
  | 'pragmatic'       // 实用主义
  | 'perfectionist'   // 完美主义
  | 'adventurous'     // 冒险精神
  | 'collaborative'   // 团队协作
  | 'independent'     // 独立自主
  | 'curious';        // 好奇心强

/** 沟通风格 */
export type CommunicationStyle =
  | 'direct'          // 直接
  | 'diplomatic'      // 外交
  | 'friendly'        // 友好
  | 'formal'          // 正式
  | 'casual';         // 随意

/** 工作偏好 */
export type WorkPreference =
  | 'solo'            // 独自工作
  | 'team'            // 团队协作
  | 'flexible';       // 灵活

/** 公司角色 */
export type CompanyRole =
  | 'CEO'
  | 'CTO'
  | 'COO'
  | 'CFO'
  | 'PM'
  | 'Technical_Lead'
  | 'Frontend_Engineer'
  | 'Backend_Engineer'
  | 'Fullstack_Engineer'
  | 'QA_Engineer'
  | 'UI_Designer'
  | 'UX_Designer'
  | 'Product_Designer'
  | 'Data_Analyst'
  | 'Content_Writer';

/** 任务优先级 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

/** 任务状态（Agent 生产级） */
export type TaskStatus =
  | 'pending_owner'  // 等待负责人确认
  | 'pending'        // 等待处理
  | 'assigned'       // 已分配（向后兼容）
  | 'in_progress'    // 进行中（向后兼容）
  | 'planning'       // 方案制定中
  | 'dispatched'     // 已分发
  | 'executing'      // 执行中
  | 'wait_human'     // 等待人工介入
  | 'auditing'       // 审计中
  | 'completed'      // 已完成
  | 'failed'         // 已失败
  | 'cancelled';     // 已取消（向后兼容）

/** 任务状态大写别名（兼容） */
export type TaskStatusUpper =
  | 'PENDING_OWNER'  // 等待负责人确认
  | 'PENDING'        // 等待处理
  | 'PLANNING'       // 方案制定中
  | 'DISPATCHED'     // 已分发
  | 'EXECUTING'      // 执行中
  | 'WAIT_HUMAN'     // 等待人工介入
  | 'AUDITING'       // 审计中
  | 'COMPLETED'      // 已完成
  | 'FAILED';        // 已失败

/** 任务状态（向后兼容） */
export type TaskStatusLegacy = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

/** 任务来源 */
export type TaskRequestedBy = 'user' | 'employee';

/** 团队状态 */

/** 记忆类型 */
export type MemoryType = 'episodic' | 'semantic' | 'procedural';

/** 对话角色 */
export type ConversationRole = 'user' | 'employee';

export type ChatSource = 'tg' | 'web' | 'cli' | 'api' | 'other';

export type ChatDirection = 'user' | 'company';

// ============================================================================
// JSON 类型（存储在 TEXT 字段中）
// ============================================================================

/** 性格特征 */
export interface PersonalityTraits {
  traits?: string[];
  style?: string;
}

/** 任务上下文 */
export interface TaskContext {
  checkpointId?: string;            // 快照恢复点
  previousResults?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /** Telegram 聊天 ID（用于通知任务完成） */
  telegramChatId?: number;
  /** Telegram 用户名（用于 @ 提及） */
  telegramUsername?: string;
}

// ============================================================================
// 数据库实体类型
// ============================================================================

/** 员工 */
export interface Employee {
  id: string;
  name: string;
  nickname?: string;
  avatar?: string;
  role: string;
  company_role?: CompanyRole;  // 公司角色
  gender?: EmployeeGender;
  personality?: string; // JSON: PersonalityTraits

  // 人类属性
  age?: number;
  birth_date?: number;
  traits?: EmployeeTrait[];      // 性格特质
  communication_style?: CommunicationStyle;
  work_preference?: WorkPreference;
  current_mood?: EmployeeMood;
  motivation?: string;            // 工作动力
  fears?: string[];               // 害怕什么
  quirks?: string[];              // 小怪癖/习惯

  // 专业背景
  backstory?: string;
  expertise?: string[];           // 精通领域
  weaknesses?: string;
  strengths?: string;

  // 工作相关
  hire_date: number;
  model: string;
  system_prompt: string;
  base_personality?: string;
  temperature?: number;
  status: EmployeeStatus;
  current_task?: string;
  last_active: number;

  // 人类档案关联
  human_id: string;     // 关联的人类档案 ID
  display_name?: string;  // 显示名称（来自人类档案）

  // 统计
  score?: number;
  completed_tasks?: number;
  failed_tasks?: number;
  average_quality?: number;
  total_earnings?: number;
  level?: number;
  total_hours?: number;
  favorite_tasks?: string;
}

export interface EmployeeAgentMapping {
  id: string;
  employee_id: string;
  agent_name: string;
  scope: 'user' | 'project';
  config_path: string;
  status: 'active' | 'archived';
  metadata_json?: string;
  created_at: number;
  updated_at: number;
}

/** 技能 */
export interface Skill {
  id: string;
  name: string;
  category: string;
  description: string;
  system_prompt: string;
  examples?: string;
  requirements?: string;
  version: string;
  author?: string;
  cached_at: number;
  usage_count?: number;
}

/** 员工技能关联 */
export interface EmployeeSkill {
  employee_id: string;
  skill_id: string;
  equipped_at: number;
  proficiency?: number;
}

/** 任务（Agent 生产级） */
export interface Task {
  id: string;
  type: string;
  description: string;

  // --- 物理环境管理 ---
  work_dir?: string;                // Agent 的"物理办公位"（可选，默认自动生成）
  plan_file_path?: string;          // 方案文档路径
  branch_name?: string;             // 绑定的 Git 分支
  session_id?: string;              // tmux session 名称或 PTY PID

  // --- 状态与流程控制 ---
  priority: TaskPriority;
  status: TaskStatus;

  // --- 时间戳 ---
  created_at: number;
  started_at?: number;
  completed_at?: number;
  estimated_duration?: number;

  // --- 关联与溯源 ---
  requested_by: TaskRequestedBy;
  owner_id?: string;
  parent_task_id?: string;
  assigned_to?: string;
  assigned_at?: number;
  due_date?: number;
  acceptance_criteria?: string;
  owner_feedback?: string;

  // --- 上下文与配置 ---
  context_json?: string;             // 包含 checkpoint_id
  context_checkpoint_id?: string;   // 快照恢复点

  // --- 审计与产出 ---
  artifacts_json?: string;           // 产出文件清单: ["script.py", "config.yaml"]
  result_signal?: string;            // Agent 结束信号: [[PASSED]], [[REJECTED]]
  last_error?: string;               // 失败原因分析

  // --- 指标统计 ---
  token_usage?: number;
  quality?: number;                  // 0-100 评分

  // --- 向后兼容字段（废弃）---
  output?: string;
  deliverables_json?: string;
}

/** 任务执行记录 */
export interface TaskExecution {
  id: string;
  task_id: string;
  employee_id: string;
  started_at: number;
  completed_at?: number;
  duration?: number;
  input_prompt: string;
  input_context?: string;
  output_raw: string;
  output_parsed?: string;
  quality?: number;
  success: boolean;
  tokens_used?: number;
  model_used?: string;
}

export type GoalStatus =
  | 'pending_owner'
  | 'planning'
  | 'in_progress'
  | 'completed'
  | 'rejected';

export interface Goal {
  id: string;
  type: string;
  title: string;
  description?: string;
  status: GoalStatus;
  owner_id?: string;
  parent_goal_id?: string;
  due_date?: number;
  acceptance_criteria?: string;
  owner_feedback?: string;
  created_at: number;
  updated_at: number;
}

export type GoalPlanStatus = 'pending_owner' | 'approved' | 'rejected';

export interface GoalPlan {
  id: string;
  goal_id: string;
  version: number;
  content: string;
  status: GoalPlanStatus;
  owner_feedback?: string;
  created_at: number;
  updated_at: number;
}

export interface TaskEmployee {
  task_id: string;
  employee_id: string;
  assigned_part?: string;
  assigned_at: number;
}


/** 记忆 */
export interface Memory {
  id: number;
  employee_id: string;
  type: MemoryType;
  content: string;
  timestamp: number;
  task_id?: string;
  importance?: number;
  access_count?: number;
  embedding?: Buffer;
}

/** 对话 */
export interface Conversation {
  id: number;
  session_id: string;
  employee_id: string;
  role: ConversationRole;
  content: string;
  timestamp: number;
  context_json?: string;
}

export interface ChatMessage {
  id: number;
  session_id?: string;
  content: string;
  source: ChatSource;
  direction: ChatDirection;
  message_type?: string;
  external_message_id?: string;
  external_chat_id?: string;
  external_user_id?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  payload_json?: string;
  metadata_json?: string;
  created_at: number;
}

// ============================================================================
// 输入/输出类型
// ============================================================================

/** 创建员工输入（无默认值，强制输入） */
export interface CreateEmployeeInput {
  name: string;
  role: string;
  nickname?: string;
  avatar?: string;
  personality?: PersonalityTraits;
  backstory?: string;
  model?: string;
  base_personality?: string;
  temperature?: number;
  favorite_tasks?: string;
  weaknesses?: string;
  human_id?: string;     // 关联的人类档案 ID
  display_name?: string;  // 显示名称（来自人类档案）
}

export interface CreateEmployeeAgentInput {
  id?: string;
  employee_id: string;
  agent_name: string;
  scope: 'user' | 'project';
  config_path: string;
  status: 'active' | 'archived';
  metadata_json?: string;
}

/** 更新员工输入 */
export interface UpdateEmployeeInput {
  name?: string;
  nickname?: string;
  avatar?: string;
  role?: string;
  personality?: PersonalityTraits;
  backstory?: string;
  model?: string;
  system_prompt?: string;
  base_personality?: string;
  temperature?: number;
  status?: EmployeeStatus;
  current_task?: string;
  current_mood?: EmployeeMood;
  last_active?: number;
  score?: number;
  completed_tasks?: number;
  failed_tasks?: number;
  average_quality?: number;
  total_earnings?: number;
  level?: number;
  total_hours?: number;
  favorite_tasks?: string[];
  weaknesses?: string[];
  strengths?: string[];
  human_id?: string;     // 关联的人类档案 ID
  display_name?: string;  // 显示名称（来自人类档案）
}

/** 创建任务输入 */
export interface CreateTaskInput {
  type: string;
  description: string;
  work_dir?: string;                // 工作目录（可选，默认自动生成）
  priority: TaskPriority;
  requested_by: TaskRequestedBy;
  owner_id?: string;
  parent_task_id?: string;
  estimated_duration?: number;
  context?: TaskContext;
  plan_file_path?: string;
  branch_name?: string;
  due_date?: number;
  acceptance_criteria?: string;
  status?: TaskStatus;
}

export interface CreateGoalInput {
  type: string;
  title: string;
  description?: string;
  owner_id?: string;
  parent_goal_id?: string;
  due_date?: number;
  acceptance_criteria?: string;
  status?: GoalStatus;
}

/** 创建记忆输入 */
export interface CreateMemoryInput {
  employee_id: string;
  type: MemoryType;
  content: string;
  task_id?: string;
  importance?: number;
  embedding?: Buffer;
}

/** 创建交付物输入（已废弃） */
export interface CreateDeliverableInput {
  task_id: string;
  type: 'code' | 'document' | 'analysis' | 'other';
  title: string;
  description?: string;
  content: string;
  file_path?: string;
  employee_id?: string;
}

// ============================================================================
// 执行状态管理类型
// ============================================================================

/** 执行状态类型 */
export type ExecutionStatus =
  | 'pending'        // 待开始
  | 'queued'         // 已排队
  | 'running'        // 执行中
  | 'waiting'        // 等待外部输入
  | 'paused'         // 暂停
  | 'completed'      // 成功完成
  | 'failed'         // 失败
  | 'cancelled'      // 已取消
  | 'timeout'        // 超时
  | 'stuck'          // 卡住
  | 'retry_pending'  // 等待重试
  | 'delivery_failed'; // 消息投递失败

/** 交互类型 */
export type InteractionType = 'confirm' | 'select' | 'input' | 'none';

/** 渠道类型 */
export type ChannelType = 'telegram' | 'cli' | 'web';

/** 超时动作 */
export type TimeoutAction = 'cancel' | 'proceed' | 'retry';

/** 执行状态 */
export interface ExecutionState {
  id: string;
  type: string; // 'task' | 'workflow' | 'cron' | 'automation'
  entity_id: string;
  status: ExecutionStatus;
  current_step?: string;
  total_steps?: number;
  context_json?: string;
  input_params?: string;
  result_json?: string;
  awaiting_interaction: number;
  interaction_type?: InteractionType;
  interaction_timeout?: number;
  interaction_sent_at?: number;
  interaction_expires_at?: number;
  delivery_status?: 'pending' | 'sent' | 'delivered' | 'failed';
  delivery_attempts?: number;
  last_delivery_error?: string;
  error?: string;
  error_code?: string;
  retry_count?: number;
  max_retries?: number;
  next_retry_at?: number;
  created_at: number;
  updated_at: number;
  completed_at?: number;
  parent_execution_id?: string;
  workflow_id?: string;
}

/** 交互记录 */
export interface Interaction {
  id: string;
  execution_id: string;
  correlation_id: string;
  type: InteractionType;
  question: string;
  options_json?: string;
  selected_option?: string;
  user_input?: string;
  resume_handler: string;
  resume_context_json: string;
  channel: ChannelType;
  channel_user_id: string;
  channel_message_id?: string;
  delivery_status?: 'pending' | 'sent' | 'delivered' | 'failed';
  delivery_attempts?: number;
  last_delivery_error?: string;
  created_at: number;
  answered_at?: number;
  expires_at: number;
  timeout_action?: TimeoutAction;
}

export interface CreateChatMessageInput {
  session_id?: string;
  content: string;
  source: ChatSource;
  direction: ChatDirection;
  message_type?: string;
  external_message_id?: string;
  external_chat_id?: string;
  external_user_id?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  payload_json?: string;
  metadata_json?: string;
}

// ============================================================================
// Claude 相关类型
// ============================================================================

/** Claude 消息 */
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Claude 响应 */
export interface ClaudeResponse {
  content: string;
  stopReason?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/** Claude 配置 */
export interface ClaudeConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

// ============================================================================
// Claude Function Calling 相关类型
// ============================================================================

/** JSON Schema 属性定义 */
export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  description: string;
  enum?: (string | number)[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  default?: any;
}

/** JSON Schema 对象定义 */
export interface JSONSchemaObject {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/** Claude 工具定义 */
export interface ClaudeToolDefinition {
  name: string;
  description: string;
  input_schema: JSONSchemaObject;
}

/** Claude 工具调用块 */
export interface ClaudeToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

/** Claude 内容块 */
export interface ClaudeContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  tool_use?: ClaudeToolUseBlock;
  tool_result?: {
    tool_use_id: string;
    content: string;
    is_error?: boolean;
  };
}

// ============================================================================
// 生成器相关类型（动态生成，不使用枚举）
// ============================================================================

/** 生成的员工性格 */
export interface GeneratedPersonality {
  name: string;
  nickname?: string;
  avatar: string;
  traits: string[];
  style: string;
  backstory: string;
  speakingStyle: string;
  quirks: string[];
  motivations: string[];
  fears: string[];
  collaborationStyle: string;
}

/** 生成选项 */
export interface GenerationOptions {
  /** 是否随机生成名字（从姓氏池+名字池） */
  randomName?: boolean;
  /** 是否随机生成性格 */
  randomPersonality?: boolean;
  /** 指定姓氏 */
  surname?: string;
  /** 指定性格风格 */
  style?: string;
}

// ============================================================================
// Tool System 相关类型（从 core/tools/types.ts 重新导出）
// ============================================================================

// Re-export key types from the tool system
export type {
  ToolCategory,
  ToolContext,
  ToolResult,
  Tool,
  ToolStats,
  IntentAnalysisResult,
} from '../core/tools/types.js';
