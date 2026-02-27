-- AI Company - Database Schema
-- 生成时间: 2025-02-25

-- ============================================================================
-- config (配置表)
-- ============================================================================
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  type TEXT DEFAULT 'string' NOT NULL,
  category TEXT DEFAULT 'general' NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_config_category ON config(category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_config_key_category ON config(key, category);

-- ============================================================================
-- humans (人类档案表)
-- ============================================================================
CREATE TABLE IF NOT EXISTS humans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT,
  location TEXT,
  birthday TEXT,
  appearance TEXT,
  personality_traits TEXT,
  hobbies TEXT,
  work_preferences TEXT,
  skills TEXT,
  weaknesses TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ============================================================================
-- employees (员工表)
-- ============================================================================
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  nickname TEXT,
  avatar TEXT,
  role TEXT NOT NULL,
  personality TEXT,
  backstory TEXT,
  hire_date INTEGER NOT NULL,
  birth_date INTEGER NOT NULL,
  age INTEGER,
  model TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  base_personality TEXT,
  temperature REAL DEFAULT 0.7,
  status TEXT NOT NULL,
  current_task TEXT,
  current_mood TEXT,
  last_active INTEGER NOT NULL,
  score INTEGER DEFAULT 50,
  completed_tasks INTEGER DEFAULT 0,
  failed_tasks INTEGER DEFAULT 0,
  average_quality REAL DEFAULT 50,
  total_earnings REAL DEFAULT 0,
  level INTEGER DEFAULT 1,
  total_hours REAL DEFAULT 0,
  favorite_tasks TEXT,
  weaknesses TEXT,
  strengths TEXT,
  human_id TEXT,
  display_name TEXT,
  unavailable_until INTEGER
);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_last_active ON employees(last_active);
CREATE INDEX IF NOT EXISTS idx_employees_human_id ON employees(human_id);

-- ============================================================================
-- employee_agents (员工-Agent 映射表)
-- ============================================================================
CREATE TABLE IF NOT EXISTS employee_agents (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  scope TEXT NOT NULL,
  config_path TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE(employee_id),
  UNIQUE(agent_name, scope, config_path)
);
CREATE INDEX IF NOT EXISTS idx_employee_agents_employee ON employee_agents(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_agents_status ON employee_agents(status);

-- ============================================================================
-- skills (技能表) - 暂时保留，用于技能定义
-- ============================================================================
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  examples TEXT,
  requirements TEXT,
  version TEXT NOT NULL,
  author TEXT,
  cached_at INTEGER NOT NULL,
  usage_count INTEGER DEFAULT 0
);

-- employee_skills 已删除 - 员工技能直接存储在 employees.strengths (JSON) 字段中

-- ============================================================================
-- tasks (任务表)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  work_dir TEXT,
  plan_file_path TEXT,
  branch_name TEXT,
  session_id TEXT,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  estimated_duration INTEGER,
  requested_by TEXT NOT NULL,
  owner_id TEXT,
  parent_task_id TEXT,
  assigned_to TEXT,
  assigned_at INTEGER,
  due_date INTEGER,
  acceptance_criteria TEXT,
  owner_feedback TEXT,
  context_json TEXT,
  context_checkpoint_id TEXT,
  artifacts_json TEXT,
  result_signal TEXT,
  last_error TEXT,
  token_usage INTEGER,
  quality INTEGER,
  output TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_work_dir ON tasks(work_dir);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id);

-- ============================================================================
-- task_employees (任务员工关联表)
-- ============================================================================
CREATE TABLE IF NOT EXISTS task_employees (
  task_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  assigned_part TEXT,
  assigned_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_task_employees_task ON task_employees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_employees_employee ON task_employees(employee_id);

-- ============================================================================
-- goals (目标表)
-- ============================================================================
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  owner_id TEXT,
  parent_goal_id TEXT,
  due_date INTEGER,
  acceptance_criteria TEXT,
  owner_feedback TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_owner ON goals(owner_id);
CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_goal_id);

-- ============================================================================
-- goal_plans (目标计划表)
-- ============================================================================
CREATE TABLE IF NOT EXISTS goal_plans (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  owner_feedback TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_goal_plans_goal ON goal_plans(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_plans_status ON goal_plans(status);

-- ============================================================================
-- task_executions (任务执行记录表)
-- ============================================================================
CREATE TABLE IF NOT EXISTS task_executions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  duration INTEGER,
  input_prompt TEXT NOT NULL,
  input_context TEXT,
  output_raw TEXT NOT NULL,
  output_parsed TEXT,
  quality INTEGER,
  success INTEGER NOT NULL,
  tokens_used INTEGER,
  model_used TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_executions_task ON task_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_executions_employee ON task_executions(employee_id);
CREATE INDEX IF NOT EXISTS idx_executions_started ON task_executions(started_at);

-- ============================================================================
-- task_interactions (任务交互记录表)
-- ============================================================================
CREATE TABLE IF NOT EXISTS task_interactions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  type TEXT NOT NULL,
  question TEXT NOT NULL,
  options_json TEXT,
  selected_option TEXT,
  user_input TEXT,
  status TEXT NOT NULL,
  channel TEXT NOT NULL,
  channel_user_id TEXT,
  channel_id TEXT,
  delivery_status TEXT,
  delivery_attempts INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  answered_at INTEGER,
  expires_at INTEGER,
  timeout_action TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_task_interactions_task ON task_interactions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_interactions_status ON task_interactions(status);
CREATE INDEX IF NOT EXISTS idx_task_interactions_expires ON task_interactions(expires_at);
CREATE INDEX IF NOT EXISTS idx_task_interactions_channel ON task_interactions(channel, channel_user_id);

-- ============================================================================
-- memories (记忆表)
-- ============================================================================
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  task_id TEXT,
  importance REAL DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  embedding TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_employee_type ON memories(employee_id, type);
CREATE INDEX IF NOT EXISTS idx_memories_task ON memories(task_id);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);

-- ============================================================================
-- conversations (对话表)
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  context_json TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_conversations_employee_session ON conversations(employee_id, session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);

-- ============================================================================
-- chat_messages (用户与公司对话表)
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  direction TEXT NOT NULL,
  message_type TEXT,
  external_message_id TEXT,
  external_chat_id TEXT,
  external_user_id TEXT,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  payload_json TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_source ON chat_messages(source);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_external_chat ON chat_messages(external_chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_external_message ON chat_messages(external_message_id);

-- ============================================================================
-- crontab (定时任务表)
-- ============================================================================
CREATE TABLE IF NOT EXISTS crontab (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  command TEXT NOT NULL,
  args_json TEXT,
  cron_rule TEXT,
  enabled INTEGER DEFAULT 1,
  next_run INTEGER,
  last_run INTEGER,
  last_running_at INTEGER,
  run_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  last_output TEXT,
  last_error TEXT,
  timeout INTEGER DEFAULT 300,
  working_dir TEXT,
  env_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crontab_enabled ON crontab(enabled);
CREATE INDEX IF NOT EXISTS idx_crontab_next_run ON crontab(next_run);
CREATE INDEX IF NOT EXISTS idx_crontab_name ON crontab(name);
CREATE INDEX IF NOT EXISTS idx_crontab_task_id ON crontab(task_id);
CREATE INDEX IF NOT EXISTS idx_crontab_cron_rule ON crontab(cron_rule);

-- ============================================================================
-- cron_executions (定时任务执行记录表)
-- ============================================================================
CREATE TABLE IF NOT EXISTS cron_executions (
  id TEXT PRIMARY KEY,
  cron_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  exit_code INTEGER,
  signal INTEGER,
  output TEXT,
  error TEXT,
  timeout INTEGER DEFAULT 0,
  FOREIGN KEY (cron_id) REFERENCES crontab(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cron_executions_cron ON cron_executions(cron_id);
CREATE INDEX IF NOT EXISTS idx_cron_executions_started ON cron_executions(started_at);
