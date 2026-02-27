# AI Company - Python 重构方案

## 一、核心理解修正

### 1.1 之前的误解

❌ **错误理解**：实现固定的业务模块
- 固定的 XiaohongshuPublisher 类
- 固定的 TwitterPublisher 类
- 固定的 ArticleWriter 类

### 1.2 正确理解

✅ **核心是动态 Agent 生成与协作**：
- 根据任务需求**动态分析**需要什么样的能力
- **动态匹配**或**动态招募**具备相应能力的 Agent
- 多个 Agent **协作完成任务**
- **自动验收**并持续改进

### 1.3 完整业务流程（基于 TS 实现）

```
用户需求
    ↓
┌─────────────────────────────────────────────────────────────┐
│  Orchestrator.processRequirement()                           │
│  1. 查询现有资源（cron、类似任务、scripts）                    │
│  2. 创建任务和工作目录                                        │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│  TaskManagerAgent                                            │
│  1. analyzeTask() - 分析任务类型、复杂度、所需技能              │
│  2. findBestEmployee() - 智能匹配最佳员工                     │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│  AgentSwarmManager                                           │
│  1. 招募缺失的员工（RecruitmentService）                      │
│  2. 构建 AgentDefinition（name, description, prompt）        │
│  3. 调用 Claude CLI --agents 触发协作                        │
│  4. 自动验收（ReviewerAgent）                                │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│  输出保存                                                    │
│  work_dir/outputs/deliverable.md                             │
│  work_dir/review-report.md                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、TS 项目核心架构分析

### 2.1 核心组件职责

| 组件 | 职责 | 关键方法 |
|------|------|----------|
| **Orchestrator** | 主流程编排 | processRequirement(), queryExistingResources() |
| **TaskManagerAgent** | 任务分析与员工匹配 | analyzeTask(), findBestEmployee() |
| **AgentSwarmManager** | 多 Agent 协作执行 | executeSwarm(), buildAgentDefinitions() |
| **AutonomousLoopExecutor** | 自主循环执行 | execute() - 分析→计划→执行→检查→改进 |
| **RecruitmentService** | 动态招募员工 | recruit(), generateHumanByAI() |
| **EmployeeAgentService** | Employee→Agent 映射 | ensureEmployeeAgent() |
| **ReviewerAgent** | 质量验收 | reviewStep(), reviewCode() |
| **EmployeeManagerAgent** | 团队优化 | smartRecruit(), optimizeTeam() |

### 2.2 数据流

```
需求描述 → Claude LLM 分析 → 任务拆解 → 员工匹配 → Claude Code CLI 执行 → 输出验收 → 保存结果
```

### 2.3 工作目录结构

```
~/.ai-company/outputs/tasks/{task_id}/
├── deliverable.md          # 最终交付物
├── review-report.md        # 验收报告
├── iteration-{n}.json      # 迭代状态（自主循环模式）
└── {generated files}       # 任务产出的文件
```

---

## 三、Python 版本重构方案

### 3.1 架构设计

```
server/
├── src/
│   ├── core/                    # 核心业务逻辑
│   │   ├── orchestrator/        # 流程编排
│   │   │   └── orchestrator.py
│   │   ├── agents/              # Agent 管理
│   │   │   ├── task_manager.py      # TaskManagerAgent
│   │   │   ├── employee_manager.py  # EmployeeManagerAgent
│   │   │   └── reviewer.py          # ReviewerAgent
│   │   ├── swarm/               # 多 Agent 协作
│   │   │   ├── swarm_manager.py     # AgentSwarmManager
│   │   │   └── autonomous_executor.py
│   │   └── planning/            # 任务规划
│   │       └── task_planner.py
│   │
│   ├── services/                # 业务服务层
│   │   ├── recruitment.py       # RecruitmentService
│   │   ├── employee_agent.py    # EmployeeAgentService
│   │   ├── task.py              # TaskService
│   │   └── human.py             # HumanService
│   │
│   ├── infrastructure/          # 基础设施
│   │   ├── database/            # 数据库
│   │   │   ├── models/          # SQLAlchemy Models
│   │   │   ├── repositories/    # Repository Pattern
│   │   │   └── session.py       # DB Session
│   │   ├── claude/              # Claude 集成
│   │   │   ├── client.py        # API 调用
│   │   │   └── cli_bridge.py    # 与 Claude Code CLI 桥接
│   │   └── config/              # 配置管理
│   │       └── settings.py
│   │
│   └── api/                     # API 层
│       ├── routes/
│       └── dependencies.py
```

### 3.2 核心类设计

#### 3.2.1 Orchestrator（核心编排器）

```python
# src/core/orchestrator/orchestrator.py

from typing import Optional
from datetime import datetime, timedelta

class Orchestrator:
    """主流程编排器 - 协调所有组件完成用户需求"""

    def __init__(
        self,
        db_session: AsyncSession,
        claude_client: ClaudeClient,
        work_dir: Optional[str] = None
    ):
        self.db = db_session
        self.claude = claude_client
        self.work_dir = work_dir or self._get_default_work_dir()
        self.task_manager = TaskManagerAgent(db_session, claude_client)
        self.swarm_manager = AgentSwarmManager(db_session, claude_client)

    async def process_requirement(
        self,
        requirement: str,
        user_id: str,
        options: ProcessOptions = None
    ) -> OrchestrationResult:
        """
        处理用户需求的主入口

        流程：
        1. 查询现有资源（cron、类似任务、scripts）
        2. 分析任务并匹配/招募员工
        3. 执行任务（单 Agent 或 Swarm）
        4. 自动验收
        5. 保存结果
        """
        # Phase 1: 查询现有资源
        existing = await self._query_existing_resources(requirement)

        # Phase 2: 分析任务
        task_analysis = await self.task_manager.analyze_task(requirement)
        task = await self._create_task(requirement, task_analysis, user_id)

        # Phase 3: 执行任务
        if task_analysis.requires_collaboration:
            # 多 Agent 协作
            result = await self.swarm_manager.execute_swarm(task, task_analysis)
        else:
            # 单 Agent 执行
            result = await self._execute_single_agent(task, task_analysis)

        # Phase 4: 返回结果
        return OrchestrationResult(
            task_id=task.id,
            output=result.output,
            review=result.review,
            work_dir=self._get_task_work_dir(task.id)
        )

    async def _query_existing_resources(self, requirement: str) -> ExistingResources:
        """查询现有资源 - 避免重复工作"""
        # 查询类似的已完成任务
        similar_tasks = await self.task_repo.find_similar(requirement, days=7)

        # 查询 cron jobs
        cron_jobs = await self.cron_repo.find_by_keyword(requirement)

        # 查询 scripts
        scripts = await self.script_repo.find_by_keyword(requirement)

        return ExistingResources(
            similar_tasks=similar_tasks,
            cron_jobs=cron_jobs,
            scripts=scripts
        )
```

#### 3.2.2 TaskManagerAgent（任务分析与员工匹配）

```python
# src/core/agents/task_manager.py

class TaskManagerAgent:
    """任务分析与员工匹配"""

    async def analyze_task(self, description: str) -> TaskAnalysis:
        """
        使用 Claude LLM 分析任务

        返回：
        - task_type: 任务类型
        - complexity: 复杂度 (simple/medium/complex)
        - required_skills: 所需技能列表
        - estimated_hours: 预估时间
        - suggested_role: 建议角色
        - requires_collaboration: 是否需要多 Agent 协作
        """
        prompt = self._build_analysis_prompt(description)

        response = await self.claude.prompt(prompt, output_format="json")

        return TaskAnalysis(**response)

    async def find_best_employee(
        self,
        task_analysis: TaskAnalysis
    ) -> Optional[AssignmentSuggestion]:
        """
        智能匹配最佳员工

        使用 Claude LLM 考虑：
        - 技能匹配度
        - 历史绩效
        - 当前工作负载
        - 专业领域
        """
        # 获取所有可用员工
        available_employees = await self.employee_repo.get_available()

        if not available_employees:
            return None

        # 构建匹配提示
        prompt = self._build_matching_prompt(
            task_analysis,
            available_employees
        )

        response = await self.claude.prompt(prompt, output_format="json")

        return AssignmentSuggestion(**response)
```

#### 3.2.3 AgentSwarmManager（多 Agent 协作）

```python
# src/core/swarm/swarm_manager.py

class AgentSwarmManager:
    """多 Agent 协作管理器"""

    async def execute_swarm(
        self,
        task: Task,
        task_analysis: TaskAnalysis,
        config: SwarmConfig
    ) -> SwarmResult:
        """
        执行多 Agent 协作任务

        流程：
        1. 根据执行计划准备所有 Agent
        2. 招募需要的员工
        3. 构建 AgentDefinition
        4. 调用 Claude CLI --agents
        5. 自动验收
        """
        # 1. 创建执行计划
        plan = await self._create_execution_plan(task, task_analysis)

        # 2. 招募缺失的员工
        recruited = []
        for needed in plan.needed_recruits:
            employee = await self.recruitment_service.recruit(needed.role)
            recruited.append(employee)
            plan.assign_employee(employee.id, needed.role)

        # 3. 构建 Agent 定义
        agent_definitions = await self._build_agent_definitions(
            plan.assignments,
            config.work_dir
        )

        # 4. 添加 Reviewer Agent
        reviewer = self._build_reviewer_agent(task, config.acceptance_criteria)
        agent_definitions.append(reviewer)

        # 5. 调用 Claude CLI --agents
        output = await self._execute_with_claude_cli(
            task.description,
            agent_definitions,
            config.work_dir,
            plan.suggested_leader
        )

        # 6. 自动验收
        review = await self._auto_review(task, config.work_dir, output)

        return SwarmResult(
            output=output,
            review=review,
            agents_used=[a.name for a in agent_definitions],
            recruited_employees=recruited
        )

    async def _build_agent_definitions(
        self,
        assignments: List[EmployeeAssignment],
        work_dir: str
    ) -> List[AgentDefinition]:
        """构建 AgentDefinition（用于 Claude CLI --agents）"""
        definitions = []

        for i, assignment in enumerate(assignments):
            employee = await self.employee_repo.get(assignment.employee_id)

            # 构建 Agent prompt
            prompt = self._build_agent_prompt(employee, assignment)

            definitions.append(AgentDefinition(
                name=f"agent-{i+1}-{employee.name.lower().replace(' ', '-')}",
                description=f"{employee.name} ({employee.role}) 负责: {assignment.assigned_part}",
                prompt=prompt
            ))

        return definitions

    async def _execute_with_claude_cli(
        self,
        task_description: str,
        agents: List[AgentDefinition],
        work_dir: str,
        primary_agent: str
    ) -> str:
        """通过 Claude CLI --agents 执行任务"""
        # 构建 agents JSON
        agents_json = {
            agent.name: {
                "description": agent.description,
                "prompt": agent.prompt
            }
            for agent in agents
        }

        # 调用 claude CLI
        swarm_prompt = self._build_swarm_prompt(task_description, agents)

        result = await self.claude_cli.execute(
            prompt=swarm_prompt,
            agent=primary_agent,
            agents=agents_json,
            cwd=work_dir
        )

        return result
```

#### 3.2.4 RecruitmentService（动态招募）

```python
# src/services/recruitment.py

class RecruitmentService:
    """动态招募服务"""

    async def recruit(
        self,
        role: str,
        context: Optional[str] = None
    ) -> Employee:
        """
        招募新员工

        流程：
        1. 查找是否有合适的人类档案
        2. 如果没有，使用 AI 生成
        3. 创建 Employee 记录
        4. 添加技能标签
        """
        # 1. 查找或创建 Human
        human = await self._find_or_create_human(role, context)

        # 2. 创建 Employee
        employee = Employee(
            name=human.name,
            nickname=human.name,
            role=role,
            model="claude-sonnet-4-5-20250929",
            human_id=human.id,
            status=EmployeeStatus.ACTIVE
        )

        self.db.add(employee)
        await self.db.commit()

        # 3. 添加技能
        for skill_name in human.skills:
            await self._add_employee_skill(employee.id, skill_name)

        return employee

    async def _find_or_create_human(
        self,
        role: str,
        context: Optional[str]
    ) -> Human:
        """查找或创建 Human 档案"""
        # 先尝试查找
        human = await self.human_service.find_human(skills=[role])
        if human:
            return human

        # 使用 AI 生成
        human_input = await self._generate_human_by_ai(role, context)

        return await self.human_service.create_human(human_input)

    async def _generate_human_by_ai(
        self,
        role: str,
        context: Optional[str]
    ) -> CreateHumanInput:
        """使用 Claude LLM 生成人类档案"""
        prompt = f"""你是资深招聘专家。

岗位：{role}
招聘要求：{context or '无'}

请生成一个真实可信、能力超预期的人类候选人档案。

输出 JSON：
{{
  "name": "姓名（2-3个字）",
  "gender": "male/female/other",
  "personality_traits": ["特质1","特质2","特质3"],
  "hobbies": ["爱好1","爱好2"],
  "skills": ["技能1","技能2","技能3"],
  "weaknesses": ["弱点1","弱点2"],
  "notes": "一句话补充说明"
}}

要求：
- 姓名真实，不要用张三李四
- 技能与岗位强相关
- 性格特质要体现高潜力与高执行力
"""

        response = await self.claude.prompt(prompt, output_format="json")

        return CreateHumanInput(**response)
```

#### 3.2.5 ReviewerAgent（自动验收）

```python
# src/core/agents/reviewer.py

class ReviewerAgent:
    """自动验收 Agent"""

    async def review_step(
        self,
        requirement: str,
        work_dir: str
    ) -> ReviewResult:
        """
        验收任务产出

        标准：
        - 功能完整性 (30分)
        - 产出质量 (25分)
        - 可用性 (25分)
        - 验证性 (20分)
        """
        # 获取工作目录中的产出
        outputs = self._get_step_outputs(work_dir)

        # 分析任务类型
        task_type = self._analyze_task_type(requirement)

        # 构建验收提示
        prompt = self._build_review_prompt(requirement, task_type, outputs)

        response = await self.claude.prompt(prompt, output_format="json")

        return ReviewResult(**response)

    def _build_review_prompt(
        self,
        requirement: str,
        task_type: str,
        outputs: List[str]
    ) -> str:
        """构建验收提示词"""
        return f"""# AI Company 质量验收系统

## 你的角色
你是 AI Company 的专业验收专家。

## 任务信息
- 需求: {requirement}
- 任务类型: {task_type}

## 产出内容
{chr(10).join(outputs)}

## 验收标准

### A. 功能完整性（30分）
- 完全满足需求的所有要求
- 功能正确，无明显错误

### B. 产出质量（25分）
- 代码结构清晰，命名规范
- 文档内容完整，格式规范

### C. 可用性（25分）
- 产出物可直接使用
- 有明确的使用说明

### D. 验证性（20分）
- 有测试或验证步骤
- 结果可重现

## 评分标准
| 分数 | 等级 | 通过标准 |
|------|------|----------|
| 90-100 | 优秀 | approved |
| 75-89 | 良好 | approved |
| 60-74 | 及格 | needs_revision |
| 0-59 | 不及格 | rejected |

## 输出格式（严格 JSON）
{{
  "overall": "approved|needs_revision|rejected",
  "score": 0-100,
  "feedback": "详细评价",
  "issues": [...],
  "suggestions": [...]
}}

现在进行严格验收。"""
```

---

## 四、数据库表设计调整

### 4.1 保留的核心表

```sql
-- 人类档案（个人属性）
CREATE TABLE humans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    gender TEXT,
    location TEXT,
    birthday TEXT,
    age INTEGER,
    appearance TEXT,
    personality_traits JSON NOT NULL DEFAULT '[]',
    hobbies JSON NOT NULL DEFAULT '[]',
    work_preferences JSON,
    skills JSON NOT NULL DEFAULT '[]',
    weaknesses JSON NOT NULL DEFAULT '[]',
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 员工（公司属性）
CREATE TABLE employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    nickname TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    model TEXT NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
    system_prompt TEXT,
    base_personality TEXT,
    temperature REAL,

    -- 公司背景故事（非个人）
    backstory TEXT,

    -- 统计数据
    completed_tasks INTEGER NOT NULL DEFAULT 0,
    failed_tasks INTEGER NOT NULL DEFAULT 0,
    score INTEGER NOT NULL DEFAULT 50,

    -- 关联 Human
    human_id TEXT REFERENCES humans(id),

    -- 工作 related
    strengths TEXT,  -- JSON: ["战略规划", "商业决策"]
    weaknesses TEXT,  -- JSON: ["有时过于强势"]
    capabilities JSON,

    last_active TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Employee-Agent 映射
CREATE TABLE employee_agents (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'project',
    config_path TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    meta JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id)
);

-- 任务
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    type TEXT,
    complexity TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',

    -- 验收标准
    acceptance_criteria TEXT,

    -- 工作目录
    work_dir TEXT,

    -- 输出
    output_path TEXT,
    review_score INTEGER,

    user_id TEXT,
    assigned_to TEXT REFERENCES employees(id),

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- 任务执行记录
CREATE TABLE task_executions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    employee_id TEXT REFERENCES employees(id),
    agent_name TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    input_prompt TEXT,
    output TEXT,
    error_message TEXT,
    duration_ms INTEGER,
    iteration INTEGER DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- 技能
CREATE TABLE skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category TEXT,
    description TEXT,
    system_prompt TEXT,
    version TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 员工技能关联
CREATE TABLE employee_skills (
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    proficiency_level REAL DEFAULT 0.5,
    verified_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (employee_id, skill_id)
);
```

### 4.2 新增表

```sql
-- 产出记录
CREATE TABLE outputs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id),
    type TEXT NOT NULL,  -- code/article/novel/post/design/other
    title TEXT,
    file_path TEXT,
    content_preview TEXT,
    metadata JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 发布记录
CREATE TABLE publications (
    id TEXT PRIMARY KEY,
    output_id TEXT NOT NULL REFERENCES outputs(id),
    platform TEXT NOT NULL,  -- xiaohongshu/twitter/github/etc
    account_id TEXT,
    platform_post_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    published_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 社交媒体账号
CREATE TABLE social_accounts (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    account_name TEXT,
    credentials_encrypted TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 验收记录
CREATE TABLE reviews (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id),
    overall TEXT NOT NULL,  -- approved/needs_revision/rejected
    score INTEGER NOT NULL,
    feedback TEXT,
    issues JSON,  -- [{severity, category, description, location}]
    suggestions JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 五、关键实现细节

### 5.1 工作目录管理

```python
# src/infrastructure/config/paths.py

from pathlib import Path
from functools import lru_cache

class PathManager:
    """路径管理器"""

    def __init__(self, base_dir: Optional[str] = None):
        self.base_dir = Path(base_dir or Path.home() / ".ai-company")
        self.outputs_dir = self.base_dir / "outputs"

    def get_task_work_dir(self, task_id: str) -> Path:
        """获取任务工作目录"""
        task_dir = self.outputs_dir / "tasks" / task_id
        task_dir.mkdir(parents=True, exist_ok=True)
        return task_dir

    def get_outputs_dir(self, subpath: str = "") -> Path:
        """获取输出目录"""
        if subpath:
            return self.outputs_dir / subpath
        return self.outputs_dir

    def get_agent_file_path(self, scope: str, agent_name: str) -> Path:
        """获取 Agent 配置文件路径"""
        if scope == "user":
            return Path.home() / ".claude" / "agents" / f"{agent_name}.md"
        else:
            return self.base_dir / ".claude" / "agents" / f"{agent_name}.md"
```

### 5.2 Claude CLI 桥接

```python
# src/infrastructure/claude/cli_bridge.py

import asyncio
import json
from pathlib import Path

class ClaudeCLIBridge:
    """与 Claude Code CLI 的桥接层"""

    async def execute(
        self,
        prompt: str,
        agent: str,
        agents: dict[str, dict],
        cwd: str
    ) -> str:
        """
        调用 Claude CLI --agents 执行任务

        Args:
            prompt: 任务描述
            agent: 主 Agent 名称
            agents: Agent 定义 {name: {description, prompt}}
            cwd: 工作目录
        """
        # 保存临时 agents 配置
        agents_file = self._save_agents_config(agents, cwd)

        # 构建命令
        cmd = [
            "claude",
            "--agent", agent,
            "--prompt", prompt,
            "--cwd", cwd
        ]

        # 执行命令
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            raise Exception(f"Claude CLI failed: {stderr.decode()}")

        return stdout.decode()

    def _save_agents_config(self, agents: dict, cwd: str) -> Path:
        """保存 agents 配置到文件"""
        agents_dir = Path(cwd) / ".claude" / "agents"
        agents_dir.mkdir(parents=True, exist_ok=True)

        for name, config in agents.items():
            agent_file = agents_dir / f"{name}.md"
            content = f"""# {config['description']}

{config['prompt']}
"""
            agent_file.write_text(content)

        return agents_dir
```

---

## 六、实施计划

### 阶段 1：核心架构搭建（1-2 周）

- [ ] 创建项目结构
- [ ] 实现数据库模型和 Repository
- [ ] 实现 ClaudeClient（API 调用）
- [ ] 实现 PathManager 和配置管理
- [ ] 实现 RecruitmentService

### 阶段 2：核心 Agent 实现（2-3 周）

- [ ] TaskManagerAgent - 任务分析与员工匹配
- [ ] ReviewerAgent - 自动验收
- [ ] EmployeeManagerAgent - 团队优化
- [ ] AgentSwarmManager - 多 Agent 协作
- [ ] AutonomousLoopExecutor - 自主循环执行

### 阶段 3：主流程实现（1-2 周）

- [ ] Orchestrator - 主流程编排
- [ ] ClaudeCLIBridge - CLI 桥接
- [ ] 产出管理系统
- [ ] 验收报告生成

### 阶段 4：API 与集成（1-2 周）

- [ ] FastAPI 路由
- [ ] WebSocket 实时更新
- [ ] Telegram Bot 集成
- [ ] Webhook 处理

---

## 七、核心差异总结

| 方面 | TS 版本 | Python 版本（重构后） |
|------|---------|----------------------|
| **架构** | 基于文件系统 + SQLite | 基于服务 + SQLite/PostgreSQL |
| **LLM 调用** | Anthropic SDK | Anthropic SDK + HTTP |
| **CLI 集成** | 直接调用 node-pty | 子进程调用 + asyncio |
| **并发** | 单线程 + 异步 | asyncio 异步 |
| **类型** | TypeScript | Python 3.12+ 类型注解 |
| **配置** | ConfigService 类 | Pydantic Settings |

---

## 八、关键设计决策

### 8.1 为什么采用 FastAPI

1. **原生异步** - 与 asyncio 完美集成
2. **自动文档** - OpenAPI 规范
3. **类型验证** - Pydantic 自动校验
4. **WebSocket** - 实时进度推送

### 8.2 为什么保留 SQLite

1. **零配置** - 开发环境友好
2. **可移植** - 单文件数据库
3. **足够快** - 对于 AI Company 的数据量
4. **可升级** - 后期可切换到 PostgreSQL

### 8.3 为什么采用 Repository Pattern

1. **数据访问抽象** - 业务逻辑与数据库解耦
2. **易于测试** - 可 Mock Repository
3. **可扩展** - 未来可切换 ORM

---

## 九、后续扩展

### 9.1 能力中心（可选）

虽然核心是动态 Agent 生成，但可以预定义一些常用能力模板：

```python
# src/capabilities/registry.py

CAPABILITY_TEMPLATES = {
    "xiaohongshu_publisher": {
        "role": "小红书运营专家",
        "skills": ["内容创作", "小红书运营", "图片编辑"],
        "system_prompt": "..."
    },
    "twitter_publisher": {
        "role": "Twitter 运营专家",
        "skills": ["推文写作", "话题营销"],
        "system_prompt": "..."
    },
    # ... 更多模板
}
```

### 9.2 进化机制

基于 ReviewerAgent 的反馈自动优化：

- 识别高绩效员工的特征
- 更新招募提示词模板
- 调整技能匹配权重
- 优化任务分配策略

---

## 十、总结

### 核心要点

1. **不是实现固定业务函数** - 而是动态 Agent 生成与协作
2. **LLM 是核心** - 任务分析、员工匹配、验收都依赖 LLM
3. **Claude Code CLI 是执行器** - 负责实际的代码操作
4. **完整闭环** - 需求→分析→执行→验收→输出
5. **可进化** - 基于反馈持续优化

### 与 TS 版本对齐

- ✅ 相同的数据模型（Human + Employee）
- ✅ 相同的执行流程（Orchestrator → Swarm → Review）
- ✅ 相同的工作目录结构
- ✅ 相同的 Agent 定义格式

### Python 版本优势

- 🚀 更快的 API 响应（FastAPI 异步）
- 🔄 更好的并发处理（asyncio）
- 📊 更丰富的数据处理（pandas, numpy）
- 🔌 更多的集成选项（异步 ORM, WebSocket）
