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

  -- 能力列表 (JSON 数组，如 '["coding", "analysis", "planning"]')
  capabilities TEXT NOT NULL DEFAULT '[]',

  -- 绑定到人类档案
  human_id TEXT,

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

  created_at INTEGER NOT NULL,

  FOREIGN KEY (human_id) REFERENCES humans(id)
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
-- 任务会话表 (Task Sessions - 用于 PTY 会话状态持久化)
-- ============================================================================
CREATE TABLE IF NOT EXISTS task_sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  session_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'starting',
  workspace_dir TEXT,
  pid INTEGER,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  output_count INTEGER DEFAULT 0,
  last_output TEXT,
  last_heartbeat INTEGER,
  state_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_sessions_task ON task_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_sessions_status ON task_sessions(status);
CREATE INDEX IF NOT EXISTS idx_task_sessions_heartbeat ON task_sessions(last_heartbeat);

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

-- ============================================================================
-- circuit_breaker_states (熔断器状态持久化)
-- ============================================================================
CREATE TABLE IF NOT EXISTS circuit_breaker_states (
  provider_type TEXT PRIMARY KEY,
  state TEXT NOT NULL,                  -- 'CLOSED', 'OPEN', 'HALF_OPEN'
  failure_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  last_failure_time INTEGER,
  last_state_change INTEGER NOT NULL,
  half_open_calls INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_circuit_breaker_state ON circuit_breaker_states(state);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_updated ON circuit_breaker_states(updated_at);

-- ============================================================================
-- employee_agents (员工 Agent 缓存表)
-- ============================================================================
-- 存储每个员工针对不同任务类型的 Agent 提示词缓存
-- 用于决策：使用已验证的 Agent 还是创建新的
CREATE TABLE IF NOT EXISTS employee_agents (
  id TEXT PRIMARY KEY,

  -- 关联员工
  employee_id TEXT NOT NULL,

  -- Agent 分类
  task_type TEXT NOT NULL,           -- 如: 'code', 'writing', 'analysis'
  task_subtype TEXT,                -- 如: 'python', 'novel', 'research'

  -- Agent 内容
  agent_name TEXT NOT NULL,         -- Agent 名称 (对应文件名)
  agent_file TEXT NOT NULL,         -- Claude agent 文件路径 (~/.claude/agents/xxx.md)
  prompt_content TEXT NOT NULL,     -- Agent 提示词内容

  -- 效果统计
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0,       -- 成功率 (0-1)
  avg_performance_score REAL DEFAULT 0,  -- 平均质量评分 (0-10)

  -- 使用统计
  usage_count INTEGER DEFAULT 0,
  last_used_at INTEGER,
  last_success_at INTEGER,

  -- 元数据
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE(employee_id, task_type, task_subtype)
);

CREATE INDEX IF NOT EXISTS idx_employee_agents_employee ON employee_agents(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_agents_type ON employee_agents(task_type, task_subtype);
CREATE INDEX IF NOT EXISTS idx_employee_agents_success_rate ON employee_agents(success_rate);
CREATE INDEX IF NOT EXISTS idx_employee_agents_updated ON employee_agents(updated_at);

-- 熔断器状态 updated_at 自动更新触发器
CREATE TRIGGER IF NOT EXISTS circuit_breaker_updated_at
AFTER UPDATE ON circuit_breaker_states
BEGIN
  UPDATE circuit_breaker_states SET updated_at = (strftime('%s', 'now') * 1000) WHERE rowid = NEW.rowid;
END;

-- ============================================================================
-- 记忆系统表 (Memory System)
-- ============================================================================
-- L2: Episodic Memory - 完整任务记录与反思
CREATE TABLE IF NOT EXISTS episodic_memories (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_type TEXT NOT NULL,             -- 'query' | 'task' | 'goal' | 'script'
  task_description TEXT NOT NULL,
  user_input TEXT NOT NULL,            -- 用户原始输入
  assigned_cxo TEXT,                   -- 分配的 CXO
  agent_id TEXT,                       -- 执行的 Agent ID
  tools_used TEXT,                     -- JSON array of tool names
  status TEXT NOT NULL,                -- 'success' | 'failure' | 'partial'
  output TEXT,                         -- 执行结果
  artifacts TEXT,                      -- JSON - 产物列表
  reflection_json TEXT,                -- JSON - 反思结果
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_episodic_task_type ON episodic_memories(task_type);
CREATE INDEX IF NOT EXISTS idx_episodic_status ON episodic_memories(status);
CREATE INDEX IF NOT EXISTS idx_episodic_created ON episodic_memories(created_at);
CREATE INDEX IF NOT EXISTS idx_episodic_search ON episodic_memories(task_description);

-- ============================================================================
-- L3: Semantic Memory - 模式/规则/技能
-- ============================================================================
CREATE TABLE IF NOT EXISTS semantic_memories (
  id TEXT PRIMARY KEY,
  memory_type TEXT NOT NULL,           -- 'pattern' | 'rule' | 'skill' | 'concept'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  content_json TEXT NOT NULL,          -- JSON - 记忆内容
  derived_from TEXT,                   -- episodic_memory_id
  tags TEXT,                           -- JSON array
  confidence REAL DEFAULT 1.0,         -- 置信度 (0-1)
  usage_count INTEGER DEFAULT 0,       -- 使用次数
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_semantic_type ON semantic_memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_semantic_confidence ON semantic_memories(confidence);
CREATE INDEX IF NOT EXISTS idx_semantic_usage ON semantic_memories(usage_count);
CREATE INDEX IF NOT EXISTS idx_semantic_tags ON semantic_memories(tags);

-- ============================================================================
-- L4: Procedural Memory - Agent Prompt 进化
-- ============================================================================
CREATE TABLE IF NOT EXISTS procedural_memories (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  version INTEGER NOT NULL,
  is_active INTEGER DEFAULT 0,         -- 1 = 当前活跃版本
  system_prompt TEXT NOT NULL,
  few_shot_examples TEXT,              -- JSON array
  change_summary TEXT,
  performance_delta REAL,              -- 性能变化
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_procedural_employee ON procedural_memories(employee_id);
CREATE INDEX IF NOT EXISTS idx_procedural_type ON procedural_memories(task_type);
CREATE INDEX IF NOT EXISTS idx_procedural_active ON procedural_memories(is_active);

-- ============================================================================
-- Memory Associations - 记忆关联
-- ============================================================================
CREATE TABLE IF NOT EXISTS memory_associations (
  source_type TEXT NOT NULL,           -- 'episodic' | 'semantic' | 'procedural'
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL,           -- 'episodic' | 'semantic' | 'procedural'
  target_id TEXT NOT NULL,
  association_type TEXT NOT NULL,      -- 'derived_from' | 'related_to' | 'updated_by'
  created_at INTEGER NOT NULL,
  UNIQUE(source_type, source_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_assoc_source ON memory_associations(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_memory_assoc_target ON memory_associations(target_type, target_id);

-- ============================================================================
-- updated_at 自动更新触发器
-- ============================================================================
CREATE TRIGGER IF NOT EXISTS semantic_memories_updated_at
AFTER UPDATE ON semantic_memories
BEGIN
  UPDATE semantic_memories SET updated_at = (strftime('%s', 'now') * 1000) WHERE rowid = NEW.rowid;
END;

-- ============================================================================
-- 小红书运营表
-- ============================================================================

-- 小红书账号
CREATE TABLE IF NOT EXISTS xiaohongshu_accounts (
  id TEXT PRIMARY KEY,
  account_name TEXT NOT NULL UNIQUE,
  account_id TEXT,                    -- 小红书账号 ID
  followers_count INTEGER DEFAULT 0,
  niche TEXT,                         -- 账号领域
  status TEXT DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 运营目标
CREATE TABLE IF NOT EXISTS xiaohongshu_goals (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  target_followers INTEGER NOT NULL,
  current_followers INTEGER DEFAULT 0,
  start_date INTEGER NOT NULL,
  end_date INTEGER NOT NULL,
  status TEXT DEFAULT 'active',       -- 'active' | 'completed' | 'failed'
  niche TEXT,
  target_audience TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES xiaohongshu_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_xhs_goals_status ON xiaohongshu_goals(status);
CREATE INDEX IF NOT EXISTS idx_xhs_goals_account ON xiaohongshu_goals(account_id);

-- 内容计划
CREATE TABLE IF NOT EXISTS xiaohongshu_content_plans (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  content_type TEXT DEFAULT 'note',   -- 'note' | 'video' | 'live'
  keywords TEXT,                      -- JSON array
  scheduled_time INTEGER NOT NULL,
  status TEXT DEFAULT 'planned',      -- 'planned' | 'writing' | 'ready' | 'published'
  performance_json TEXT,              -- JSON: {views, likes, collects, comments, newFollowers}
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES xiaohongshu_goals(id)
);

CREATE INDEX IF NOT EXISTS idx_xhs_plans_goal ON xiaohongshu_content_plans(goal_id);
CREATE INDEX IF NOT EXISTS idx_xhs_plans_status ON xiaohongshu_content_plans(status);

-- 笔记内容
CREATE TABLE IF NOT EXISTS xiaohongshu_contents (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT,                          -- JSON array
  cover_idea TEXT,
  status TEXT DEFAULT 'draft',
  published_note_id TEXT,             -- 发布后的小红书笔记 ID
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (plan_id) REFERENCES xiaohongshu_content_plans(id)
);

CREATE INDEX IF NOT EXISTS idx_xhs_contents_plan ON xiaohongshu_contents(plan_id);

-- 发布记录
CREATE TABLE IF NOT EXISTS xiaohongshu_posts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  published_at INTEGER NOT NULL,
  status TEXT DEFAULT 'published',
  note_id TEXT,                       -- 小红书笔记 ID
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES xiaohongshu_accounts(id),
  FOREIGN KEY (plan_id) REFERENCES xiaohongshu_content_plans(id)
);

CREATE INDEX IF NOT EXISTS idx_xhs_posts_account ON xiaohongshu_posts(account_id);

-- 触发器
CREATE TRIGGER IF NOT EXISTS xiaohongshu_accounts_updated_at
AFTER UPDATE ON xiaohongshu_accounts
BEGIN
  UPDATE xiaohongshu_accounts SET updated_at = (strftime('%s', 'now') * 1000) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS xiaohongshu_goals_updated_at
AFTER UPDATE ON xiaohongshu_goals
BEGIN
  UPDATE xiaohongshu_goals SET updated_at = (strftime('%s', 'now') * 1000) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS xiaohongshu_content_plans_updated_at
AFTER UPDATE ON xiaohongshu_content_plans
BEGIN
  UPDATE xiaohongshu_content_plans SET updated_at = (strftime('%s', 'now') * 1000) WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS xiaohongshu_contents_updated_at
AFTER UPDATE ON xiaohongshu_contents
BEGIN
  UPDATE xiaohongshu_contents SET updated_at = (strftime('%s', 'now') * 1000) WHERE rowid = NEW.rowid;
END;
