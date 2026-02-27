-- AI Company v2 - Database Schema
-- 简化版，只保留必要的表

-- ============================================================================
-- config (配置表) - 使用 namespace + JSON 存储
-- ============================================================================
CREATE TABLE IF NOT EXISTS config (
  namespace TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TRIGGER IF NOT EXISTS config_updated_at
AFTER UPDATE ON config
BEGIN
  UPDATE config SET updated_at = (strftime('%s', 'now') * 1000) WHERE rowid = NEW.rowid;
END;

-- ============================================================================
-- 员工表
-- ============================================================================
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  system_prompt TEXT NOT NULL,
  model TEXT NOT NULL,
  temperature REAL NOT NULL DEFAULT 0.7,

  -- 统计信息
  total_tasks INTEGER DEFAULT 0,
  completed_tasks INTEGER DEFAULT 0,
  failed_tasks INTEGER DEFAULT 0,

  -- 积分系统
  points INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,

  -- 满意度 (0-100)
  satisfaction INTEGER DEFAULT 80,

  -- 当前状态 (idle, busy, error, offline)
  current_state TEXT DEFAULT 'idle',

  -- 最后活动时间
  last_activity_at INTEGER,

  created_at INTEGER NOT NULL
);

-- ============================================================================
-- 目标表
-- ============================================================================
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending_owner',
  acceptance_criteria TEXT,
  due_date INTEGER,
  parent_goal_id TEXT,
  recurring TEXT,  -- JSON string
  owner_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (parent_goal_id) REFERENCES goals(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_owner ON goals(owner_id);

-- ============================================================================
-- 目标计划表
-- ============================================================================
CREATE TABLE IF NOT EXISTS goal_plans (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_goal_plans_goal ON goal_plans(goal_id);

-- ============================================================================
-- 任务表
-- ============================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  goal_id TEXT,
  work_dir TEXT,
  assigned_to TEXT,
  requested_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  output TEXT,
  error TEXT,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_goal ON tasks(goal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);

-- ============================================================================
-- 定时任务表
-- ============================================================================
CREATE TABLE IF NOT EXISTS crontab (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  command TEXT NOT NULL,
  args_json TEXT,
  cron_rule TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  goal_id TEXT,
  timeout INTEGER DEFAULT 300000,
  working_dir TEXT,
  env_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_run INTEGER,
  next_run INTEGER,
  run_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  last_output TEXT,
  last_error TEXT,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_crontab_enabled ON crontab(enabled);
CREATE INDEX IF NOT EXISTS idx_crontab_next_run ON crontab(next_run);
CREATE INDEX IF NOT EXISTS idx_crontab_goal ON crontab(goal_id);

-- ============================================================================
-- Cron执行记录
-- ============================================================================
CREATE TABLE IF NOT EXISTS cron_executions (
  id TEXT PRIMARY KEY,
  cron_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  exit_code INTEGER,
  output TEXT,
  error TEXT,
  timeout INTEGER DEFAULT 0,
  FOREIGN KEY (cron_id) REFERENCES crontab(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cron_executions_cron ON cron_executions(cron_id);

-- ============================================================================
-- 目标与Cron关联表
-- ============================================================================
CREATE TABLE IF NOT EXISTS goal_cron_mapping (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  cron_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
  FOREIGN KEY (cron_id) REFERENCES crontab(id) ON DELETE CASCADE,
  UNIQUE(goal_id, cron_id)
);

CREATE INDEX IF NOT EXISTS idx_goal_cron_goal ON goal_cron_mapping(goal_id);

-- ============================================================================
-- 活动日志
-- ============================================================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  context_json TEXT,
  result_json TEXT,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_event_type ON activity_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_logs(timestamp);

-- ============================================================================
-- 里程碑报告
-- ============================================================================
CREATE TABLE IF NOT EXISTS milestone_reports (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  chat_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_milestone_status ON milestone_reports(status);

-- ============================================================================
-- 意图日志（保留）
-- ============================================================================
CREATE TABLE IF NOT EXISTS intent_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  source TEXT NOT NULL,
  user_input TEXT NOT NULL,
  ai_raw_response TEXT,
  parsed_tool TEXT,
  parsed_input TEXT,
  tool_result TEXT,
  execution_status TEXT,
  chat_history_count INTEGER,
  latency INTEGER,
  timestamps INTEGER NOT NULL
);

-- ============================================================================
-- 聊天消息
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  direction TEXT NOT NULL,
  employee_id TEXT,           -- AI 员工 ID (direction=out 时使用)
  external_chat_id TEXT,
  external_user_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_employee ON chat_messages(employee_id);

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

-- Humans 索引
CREATE INDEX IF NOT EXISTS idx_humans_gender ON humans(gender);
CREATE INDEX IF NOT EXISTS idx_humans_location ON humans(location);
CREATE INDEX IF NOT EXISTS idx_humans_name ON humans(name);
CREATE INDEX IF NOT EXISTS idx_humans_search ON humans(name, location, skills, notes);

-- Humans updated_at 自动更新触发器
CREATE TRIGGER IF NOT EXISTS humans_updated_at
AFTER UPDATE ON humans
BEGIN
  UPDATE humans SET updated_at = (strftime('%s', 'now') * 1000) WHERE rowid = NEW.rowid;
END;
