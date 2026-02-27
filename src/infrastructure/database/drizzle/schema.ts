/**
 * AI Company - Drizzle ORM Schema
 *
 * Drizzle ORM schema definitions for core tables
 */

import { integer, sqliteTable, text, real, index, uniqueIndex, primaryKey, foreignKey } from 'drizzle-orm/sqlite-core';

// ============================================================================
// humans (人类档案表)
// ============================================================================
export const humans = sqliteTable('humans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  gender: text('gender', { enum: ['male', 'female', 'other'] }),
  location: text('location'),
  birthday: text('birthday'),
  appearance: text('appearance'),
  personalityTraits: text('personality_traits'),
  hobbies: text('hobbies'),
  workPreferences: text('work_preferences'),
  skills: text('skills'),
  weaknesses: text('weaknesses'),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// ============================================================================
// employees (员工表)
// ============================================================================
export const employees = sqliteTable('employees', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  nickname: text('nickname'),
  avatar: text('avatar'),
  role: text('role').notNull(),
  personality: text('personality'),
  gender: text('gender'),
  backstory: text('backstory'),
  age: integer('age'),
  birthDate: integer('birth_date').notNull(),
  traits: text('traits'),              // 性格特质 (JSON)
  communicationStyle: text('communication_style'),
  workPreference: text('work_preference'),
  currentMood: text('current_mood'),
  motivation: text('motivation'),      // 工作动力
  fears: text('fears'),                // 害怕什么 (JSON)
  quirks: text('quirks'),              // 小怪癖/习惯 (JSON)
  expertise: text('expertise'),        // 精通领域 (JSON)
  weaknesses: text('weaknesses'),
  strengths: text('strengths'),
  hireDate: integer('hire_date').notNull(),
  model: text('model').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  basePersonality: text('base_personality'),
  temperature: real('temperature').default(0.7),
  status: text('status').notNull(),
  currentTask: text('current_task'),
  lastActive: integer('last_active').notNull(),
  score: integer('score').default(50),
  completedTasks: integer('completed_tasks').default(0),
  failedTasks: integer('failed_tasks').default(0),
  averageQuality: real('average_quality').default(50),
  totalEarnings: real('total_earnings').default(0),
  level: integer('level').default(1),
  totalHours: real('total_hours').default(0),
  favoriteTasks: text('favorite_tasks'),
  humanId: text('human_id'),
  displayName: text('display_name'),
  unavailableUntil: integer('unavailable_until'),
}, (table) => ({
  statusIdx: index('idx_employees_status').on(table.status),
  lastActiveIdx: index('idx_employees_last_active').on(table.lastActive),
  humanIdIdx: index('idx_employees_human_id').on(table.humanId),
}));

export const employeeAgents = sqliteTable('employee_agents', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  agentName: text('agent_name').notNull(),
  scope: text('scope').notNull(),
  configPath: text('config_path').notNull(),
  status: text('status').notNull(),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  employeeIdx: uniqueIndex('idx_employee_agents_employee').on(table.employeeId),
  agentIdx: uniqueIndex('idx_employee_agents_agent').on(table.agentName, table.scope, table.configPath),
  statusIdx: index('idx_employee_agents_status').on(table.status),
}));

// ============================================================================
// skills (技能表) - 暂时保留，用于技能定义
// TODO: 评估是否需要，如果不需要则删除
// ============================================================================
export const skills = sqliteTable('skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  description: text('description').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  examples: text('examples'),
  requirements: text('requirements'),
  version: text('version').notNull(),
  author: text('author'),
  cachedAt: integer('cached_at').notNull(),
  usageCount: integer('usage_count').default(0),
});

// employee_skills 已删除 - 员工技能直接存储在 employees.strengths (JSON) 字段中

// ============================================================================
// tasks (任务表)
// ============================================================================
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  description: text('description').notNull(),
  workDir: text('work_dir'),
  planFilePath: text('plan_file_path'),
  branchName: text('branch_name'),
  sessionId: text('session_id'),
  priority: text('priority').notNull(),
  status: text('status').notNull(),
  createdAt: integer('created_at').notNull(),
  startedAt: integer('started_at'),
  completedAt: integer('completed_at'),
  estimatedDuration: integer('estimated_duration'),
  requestedBy: text('requested_by').notNull(),
  ownerId: text('owner_id'),
  parentTaskId: text('parent_task_id'),
  assignedTo: text('assigned_to'),
  assignedAt: integer('assigned_at'),
  dueDate: integer('due_date'),
  acceptanceCriteria: text('acceptance_criteria'),
  ownerFeedback: text('owner_feedback'),
  contextJson: text('context_json'),
  contextCheckpointId: text('context_checkpoint_id'),
  artifactsJson: text('artifacts_json'),
  resultSignal: text('result_signal'),
  lastError: text('last_error'),
  output: text('output'),
  quality: integer('quality'),
  tokenUsage: integer('token_usage'),
}, (table) => ({
  statusIdx: index('idx_tasks_status').on(table.status),
  workDirIdx: index('idx_tasks_work_dir').on(table.workDir),
  assignedToIdx: index('idx_tasks_assigned_to').on(table.assignedTo),
  parentIdx: index('idx_tasks_parent').on(table.parentTaskId),
  createdAtIdx: index('idx_tasks_created_at').on(table.createdAt),
  sessionIdIdx: index('idx_tasks_session_id').on(table.sessionId),
  ownerIdIdx: index('idx_tasks_owner_id').on(table.ownerId),
}));

export const taskEmployees = sqliteTable('task_employees', {
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  assignedPart: text('assigned_part'),
  assignedAt: integer('assigned_at').notNull(),
}, (table) => ({
  taskIdx: index('idx_task_employees_task').on(table.taskId),
  employeeIdx: index('idx_task_employees_employee').on(table.employeeId),
}));

export const goals = sqliteTable('goals', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull(),
  ownerId: text('owner_id'),
  parentGoalId: text('parent_goal_id'),
  dueDate: integer('due_date'),
  acceptanceCriteria: text('acceptance_criteria'),
  ownerFeedback: text('owner_feedback'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  statusIdx: index('idx_goals_status').on(table.status),
  ownerIdx: index('idx_goals_owner').on(table.ownerId),
  parentIdx: index('idx_goals_parent').on(table.parentGoalId),
}));

export const goalPlans = sqliteTable('goal_plans', {
  id: text('id').primaryKey(),
  goalId: text('goal_id').notNull().references(() => goals.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  content: text('content').notNull(),
  status: text('status').notNull(),
  ownerFeedback: text('owner_feedback'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  goalIdx: index('idx_goal_plans_goal').on(table.goalId),
  statusIdx: index('idx_goal_plans_status').on(table.status),
}));

// ============================================================================
// task_executions (任务执行记录表)
// ============================================================================
export const taskExecutions = sqliteTable('task_executions', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  startedAt: integer('started_at').notNull(),
  completedAt: integer('completed_at'),
  duration: integer('duration'),
  inputPrompt: text('input_prompt').notNull(),
  inputContext: text('input_context'),
  outputRaw: text('output_raw').notNull(),
  outputParsed: text('output_parsed'),
  quality: integer('quality'),
  success: integer('success').notNull(), // SQLite doesn't have boolean, use integer
  tokensUsed: integer('tokens_used'),
  modelUsed: text('model_used'),
}, (table) => ({
  taskIdx: index('idx_executions_task').on(table.taskId),
  employeeIdx: index('idx_executions_employee').on(table.employeeId),
  startedIdx: index('idx_executions_started').on(table.startedAt),
}));

// ============================================================================
// task_interactions (任务交互记录表)
// ============================================================================
// 用途：记录任务执行过程中需要用户交互的事件
// 例如：任务需要用户确认、选择、输入等
export const taskInteractions = sqliteTable('task_interactions', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'confirm' | 'select' | 'input'
  question: text('question').notNull(),
  optionsJson: text('options_json'),      // 选项列表（JSON）
  selectedOption: text('selected_option'), // 用户选择的选项
  userInput: text('user_input'),        // 用户输入的内容
  status: text('status').notNull(),     // 'pending' | 'answered' | 'expired' | 'cancelled'
  channel: text('channel').notNull(),  // 'telegram' | 'cli' | 'web'
  channelUserId: text('channel_user_id'),
  channelId: text('channel_id'),       // 渠道消息 ID
  deliveryStatus: text('delivery_status'), // 'pending' | 'sent' | 'delivered' | 'failed'
  deliveryAttempts: integer('delivery_attempts').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  answeredAt: integer('answered_at'),
  expiresAt: integer('expires_at'),
  timeoutAction: text('timeout_action'), // 'cancel' | 'proceed' | 'retry'
}, (table) => ({
  taskIdx: index('idx_task_interactions_task').on(table.taskId),
  statusIdx: index('idx_task_interactions_status').on(table.status),
  expiresIdx: index('idx_task_interactions_expires').on(table.expiresAt),
  channelIdx: index('idx_task_interactions_channel').on(table.channel, table.channelUserId),
}));

// ============================================================================
// memories (记忆表)
// ============================================================================
export const memories = sqliteTable('memories', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  content: text('content').notNull(),
  timestamp: integer('timestamp').notNull(),
  taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  importance: real('importance').default(0.5),
  accessCount: integer('access_count').default(0),
  embedding: text('embedding'), // BLOB stored as base64 text
}, (table) => ({
  employeeTypeIdx: index('idx_memories_employee_type').on(table.employeeId, table.type),
  taskIdx: index('idx_memories_task').on(table.taskId),
  importanceIdx: index('idx_memories_importance').on(table.importance),
}));

// ============================================================================
// conversations (对话表)
// ============================================================================
export const conversations = sqliteTable('conversations', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  timestamp: integer('timestamp').notNull(),
  contextJson: text('context_json'),
}, (table) => ({
  employeeSessionIdx: index('idx_conversations_employee_session').on(table.employeeId, table.sessionId),
  timestampIdx: index('idx_conversations_timestamp').on(table.timestamp),
}));

// ============================================================================
// chat_messages (用户与公司对话表)
// ============================================================================
export const chatMessages = sqliteTable('chat_messages', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  sessionId: text('session_id'),
  content: text('content').notNull(),
  source: text('source').notNull(),
  direction: text('direction').notNull(),
  messageType: text('message_type'),
  externalMessageId: text('external_message_id'),
  externalChatId: text('external_chat_id'),
  externalUserId: text('external_user_id'),
  username: text('username'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  payloadJson: text('payload_json'),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at').notNull(),
}, (table) => ({
  sourceIdx: index('idx_chat_messages_source').on(table.source),
  createdAtIdx: index('idx_chat_messages_created_at').on(table.createdAt),
  sessionIdx: index('idx_chat_messages_session').on(table.sessionId),
  externalChatIdx: index('idx_chat_messages_external_chat').on(table.externalChatId),
  externalMessageIdx: index('idx_chat_messages_external_message').on(table.externalMessageId),
}));

// ============================================================================
// Type exports
// ============================================================================
export type Human = typeof humans.$inferSelect;
export type NewHuman = typeof humans.$inferInsert;

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;

export type EmployeeAgent = typeof employeeAgents.$inferSelect;
export type NewEmployeeAgent = typeof employeeAgents.$inferInsert;

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;

// employee_skills 已删除 - 员工技能直接存储在 employees.strengths (JSON) 字段中

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type TaskEmployee = typeof taskEmployees.$inferSelect;
export type NewTaskEmployee = typeof taskEmployees.$inferInsert;

export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;

export type GoalPlan = typeof goalPlans.$inferSelect;
export type NewGoalPlan = typeof goalPlans.$inferInsert;

export type TaskExecution = typeof taskExecutions.$inferSelect;
export type NewTaskExecution = typeof taskExecutions.$inferInsert;

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

export type TaskInteraction = typeof taskInteractions.$inferSelect;
export type NewTaskInteraction = typeof taskInteractions.$inferInsert;

// ============================================================================
// crontab (定时任务表)
// ============================================================================
export const crontab = sqliteTable('crontab', {
  id: text('id').primaryKey(),
  taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  command: text('command').notNull(),
  argsJson: text('args_json'),
  cronRule: text('cron_rule'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  nextRun: integer('next_run'),
  lastRun: integer('last_run'),
  lastRunningAt: integer('last_running_at'),
  runCount: integer('run_count').default(0),
  failCount: integer('fail_count').default(0),
  lastOutput: text('last_output'),
  lastError: text('last_error'),
  timeout: integer('timeout').default(300),
  workingDir: text('working_dir'),
  envJson: text('env_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  enabledIdx: index('idx_crontab_enabled').on(table.enabled),
  nextRunIdx: index('idx_crontab_next_run').on(table.nextRun),
  nameIdx: index('idx_crontab_name').on(table.name),
  taskIdIdx: index('idx_crontab_task_id').on(table.taskId),
  cronRuleIdx: index('idx_crontab_cron_rule').on(table.cronRule),
}));

// ============================================================================
// cron_executions (定时任务执行记录表)
// ============================================================================
export const cronExecutions = sqliteTable('cron_executions', {
  id: text('id').primaryKey(),
  cronId: text('cron_id').notNull().references(() => crontab.id, { onDelete: 'cascade' }),
  startedAt: integer('started_at').notNull(),
  completedAt: integer('completed_at'),
  exitCode: integer('exit_code'),
  signal: integer('signal'),
  output: text('output'),
  error: text('error'),
  timeout: integer('timeout', { mode: 'boolean' }).default(false),
}, (table) => ({
  cronIdx: index('idx_cron_executions_cron').on(table.cronId),
  startedIdx: index('idx_cron_executions_started').on(table.startedAt),
}));

// ============================================================================
// config (配置表)
// ============================================================================
export const config = sqliteTable('config', {
  key: text('key').notNull(),
  value: text('value').notNull(),
  type: text('type').notNull().default('string'),
  category: text('category').notNull().default('general'),
  description: text('description'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  categoryIdx: index('idx_config_category').on(table.category),
  keyCategoryIdx: uniqueIndex('idx_config_key_category').on(table.key, table.category),
}));

// ============================================================================
// intent_logs (意图理解日志表)
// ============================================================================
export const intentLogs = sqliteTable('intent_logs', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  source: text('source').notNull(),
  userInput: text('user_input').notNull(),
  aiRawResponse: text('ai_raw_response'),
  parsedTool: text('parsed_tool'),
  parsedInput: text('parsed_input'),
  toolResult: text('tool_result'),
  executionStatus: text('execution_status'),
  chatHistoryCount: integer('chat_history_count'),
  latency: integer('latency'),
  timestamps: integer('timestamps').notNull(),
}, (table) => ({
  sessionIdx: index('idx_intent_logs_session').on(table.sessionId),
  timestampIdx: index('idx_intent_logs_timestamp').on(table.timestamps),
  toolIdx: index('idx_intent_logs_tool').on(table.parsedTool),
}));

// ============================================================================
// 新增类型导出
// ============================================================================
export type Crontab = typeof crontab.$inferSelect;
export type NewCrontab = typeof crontab.$inferInsert;

export type CronExecution = typeof cronExecutions.$inferSelect;
export type NewCronExecution = typeof cronExecutions.$inferInsert;

export type Config = typeof config.$inferSelect;
export type NewConfig = typeof config.$inferInsert;

export type IntentLog = typeof intentLogs.$inferSelect;
export type NewIntentLog = typeof intentLogs.$inferInsert;
