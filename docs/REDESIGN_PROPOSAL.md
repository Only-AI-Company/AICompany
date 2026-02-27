# AI Company - 重新设计方案

## 一、当前架构的本质问题

### 1.1 当前模式

```
用户输入 → Orchestrator → 执行 → 返回结果
```

**这是"工具模式"，不是"公司模式"**：
- ❌ 系统是被动响应的，没有主动思考
- ❌ 每次任务独立，没有整体规划
- ❌ 没有记忆和学习，不会越做越好
- ❌ 没有目标感，只是执行指令

### 1.2 应该是什么

**公司 = 持续运行的组织**
- ✅ 有愿景和长期目标
- ✅ 主动发现机会和问题
- ✅ 统筹资源（人、时间、预算）
- ✅ 持续学习和进化
- ✅ 不需要人工介入也能运转

---

## 二、重新设计的核心架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        愿景层 (Vision)                          │
│  公司愿景、长期目标、价值观                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      感知层 (Perception)                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │ 环境感知    │ │ 用户需求    │ │ 内部状态    │               │
│  │ 时间/时机   │ │ 主动/被动   │ │ 资源/负载   │               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      思考层 (Cognition)                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │ 目标分解    │ │ 资源规划    │ │ 优先级决策  │               │
│  │ GoalPlanner │ │ ResourceMgr │ │ Prioritizer  │               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      决策层 (Decision)                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │ 做什么      │ │ 谁来做      │ │ 何时做      │               │
│  │ WhatDecider │ │ WhoDecider  │ │ WhenDecider  │               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      执行层 (Execution)                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │ 任务编排    │ │ Agent协作   │ │ 进度监控    │               │
│  │ Orchestrator│ │ Swarm       │ │ Monitor     │               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      记忆与进化层 (Memory & Evolution)           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │ 经验积累    │ │ 模式识别    │ │ 自我优化    │               │
│  │ Experience  │ │ PatternRecog │ │ SelfOptimize │               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 核心心智模型

```typescript
// 公司的"大脑" - 持续运行的主循环
class CompanyBrain {
  async run(): Promise<never> {
    while (true) {
      // 1. 感知：扫描内外部环境
      const perception = await this.perceive();

      // 2. 思考：分析现状，找出机会/问题
      const thoughts = await this.think(perception);

      // 3. 决策：确定下一步行动
      const decisions = await this.decide(thoughts);

      // 4. 执行：落实决策
      const results = await this.execute(decisions);

      // 5. 反思：学习经验
      await this.reflect(results);

      // 6. 等待下一个思考周期
      await this.sleep(this.thinkingInterval);
    }
  }
}
```

---

## 三、重新设计的数据模型

### 3.1 新增核心概念

#### 愿景与目标系统

```sql
-- 公司愿景
CREATE TABLE company_vision (
    id TEXT PRIMARY KEY,
    vision_statement TEXT NOT NULL,      -- 愿景陈述
    mission TEXT,                        -- 使命
    values JSON,                         -- 价值观
    time_horizon TEXT,                   -- 时间范围 (1年/3年/10年)
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 战略目标（长期）
CREATE TABLE strategic_goals (
    id TEXT PRIMARY KEY,
    vision_id TEXT REFERENCES company_vision(id),
    title TEXT NOT NULL,
    description TEXT,
    success_criteria JSON,               -- 成功标准
    time_frame TEXT,                     -- Q1/Q2/Q3/Q4 或 2026/2027
    priority REAL,                       -- 优先级 0-1
    status TEXT,                         -- drafting/active/paused/completed
    progress REAL DEFAULT 0,             -- 进度 0-1
    parent_goal_id TEXT REFERENCES strategic_goals(id),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 机会/问题（主动发现的）
CREATE TABLE opportunities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,                  -- opportunity/problem/risk
    title TEXT NOT NULL,
    description TEXT,
    source TEXT,                         -- 内部发现/用户反馈/市场观察
    potential_value REAL,                -- 潜在价值
    urgency REAL,                        -- 紧迫程度 0-1
    feasibility REAL,                    -- 可行性 0-1
    status TEXT,                         -- identified/analyzing/prioritized/dismissed
    created_at INTEGER NOT NULL
);

-- 行动计划
CREATE TABLE action_plans (
    id TEXT PRIMARY KEY,
    goal_id TEXT REFERENCES strategic_goals(id),
    opportunity_id TEXT REFERENCES opportunities(id),
    title TEXT NOT NULL,
    description TEXT,
    steps JSON,                          -- 步骤列表
    resource_requirements JSON,          -- 资源需求
    estimated_duration INTEGER,
    expected_outcome TEXT,
    status TEXT,
    created_at INTEGER NOT NULL
);
```

#### 资源管理系统

```sql
-- 资源池（统一管理所有资源）
CREATE TABLE resource_pools (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,                  -- employee/time/budget/tool
    name TEXT NOT NULL,
    capacity INTEGER,                    -- 总容量
    used INTEGER DEFAULT 0,              -- 已使用
    available INTEGER,                   -- 可用（计算）
    unit TEXT,                          -- 单位（小时/次数/金额）
    attributes JSON,                     -- 额外属性
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 资源分配记录
CREATE TABLE resource_allocations (
    id TEXT PRIMARY KEY,
    resource_id TEXT REFERENCES resource_pools(id),
    task_id TEXT REFERENCES tasks(id),
    goal_id TEXT REFERENCES strategic_goals(id),
    quantity REAL NOT NULL,
    allocated_at INTEGER NOT NULL,
    released_at INTEGER,
    purpose TEXT,
    status TEXT
);
```

#### 经验与知识系统

```sql
-- 经验库（从历史中学习）
CREATE TABLE experiences (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,                  -- success/failure/insight
    context JSON NOT NULL,               -- 上下文
    action_taken TEXT,                   -- 采取的行动
    result TEXT,                         -- 结果
    lessons_learned TEXT,                -- 学到的经验
    confidence REAL DEFAULT 0.5,         -- 置信度
    created_at INTEGER NOT NULL
);

-- 模式识别结果
CREATE TABLE patterns (
    id TEXT PRIMARY KEY,
    pattern_type TEXT NOT NULL,          -- workflow/behavior/market/etc
    description TEXT NOT NULL,
    conditions JSON,                     -- 触发条件
    consequences JSON,                   -- 预期后果
    confidence REAL DEFAULT 0.5,
    support_count INTEGER DEFAULT 1,     -- 支持案例数
    last_seen INTEGER,
    created_at INTEGER NOT NULL
);

-- 知识图谱节点
CREATE TABLE knowledge_nodes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,                  -- concept/skill/tool/domain
    name TEXT NOT NULL,
    attributes JSON,
    embedding TEXT,                      -- 向量嵌入（用于相似度搜索）
    created_at INTEGER NOT NULL
);

-- 知识图谱关系
CREATE TABLE knowledge_edges (
    id TEXT PRIMARY KEY,
    source_id TEXT REFERENCES knowledge_nodes(id),
    target_id TEXT REFERENCES knowledge_nodes(id),
    relation_type TEXT NOT NULL,         -- related_to/prerequisite_for/similar_to
    weight REAL DEFAULT 1.0,
    created_at INTEGER NOT NULL
);
```

#### 决策与执行追踪

```sql
-- 决策记录（为什么会这样决策）
CREATE TABLE decisions (
    id TEXT PRIMARY KEY,
    context JSON NOT NULL,               -- 决策时的上下文
    options JSON,                        -- 考虑过的选项
    selected_option TEXT,                -- 最终选择
    reasoning TEXT,                      -- 推理过程
    expected_outcome TEXT,               -- 预期结果
    actual_outcome TEXT,                 -- 实际结果
    outcome_score REAL,                  -- 结果评分
    created_at INTEGER NOT NULL,
    realized_at INTEGER
);

-- 思考周期（公司大脑的每次思考）
CREATE TABLE thinking_cycles (
    id TEXT PRIMARY KEY,
    cycle_number INTEGER NOT NULL,
    perception_summary TEXT,             -- 感知到什么
    thoughts TEXT,                       -- 想了什么
    decisions_made JSON,                 -- 做了什么决策
    actions_taken JSON,                  -- 采取了什么行动
    outcomes TEXT,                       -- 结果如何
    insights TEXT,                       -- 有什么洞察
    duration_ms INTEGER,
    created_at INTEGER NOT NULL
);
```

### 3.2 数据流图

```
┌─────────────────────────────────────────────────────────────┐
│                       数据流                                │
└─────────────────────────────────────────────────────────────┘

感知 → 思考 → 决策 → 执行 → 反思
  ↓      ↓      ↓      ↓      ↓
环境  上下文  行动  结果  经验
机会  选项    计划  数据  模式
资源  评估    分配  日志  知识
```

---

## 四、重新设计的核心组件

### 4.1 公司大脑（CompanyBrain）

```typescript
class CompanyBrain {
  private perception: PerceptionSystem;
  private cognition: CognitionSystem;
  private decision: DecisionSystem;
  private execution: ExecutionSystem;
  private memory: MemorySystem;

  /**
   * 主思考循环
   */
  async thinkCycle(): Promise<void> {
    const cycleId = generateId();
    const startTime = Date.now();

    // 1. 感知环境
    const perception = await this.perception.scan({
      external: true,   // 外部环境（时间、市场、用户）
      internal: true,   // 内部状态（任务、员工、资源）
      history: true,    // 历史数据
    });

    // 2. 分析与思考
    const analysis = await this.cognition.analyze({
      perception,
      goals: await this.getActiveGoals(),
      resources: await this.getResourceStatus(),
      experiences: await this.getRelevantExperiences(perception),
    });

    // 3. 生成决策
    const decisions = await this.decision.make({
      analysis,
      options: await this.generateOptions(analysis),
      constraints: await this.getConstraints(),
    });

    // 4. 执行决策
    const results = await this.execution.executeBatch(decisions.actions);

    // 5. 反思与学习
    const insights = await this.memory.reflect({
      cycle: { perception, analysis, decisions, results },
      outcomes: results,
    });

    // 6. 记录思考周期
    await this.db.createThinkingCycle({
      id: cycleId,
      cycle_number: await this.getNextCycleNumber(),
      perception_summary: perception.summary,
      thoughts: analysis.reasoning,
      decisions_made: decisions,
      actions_taken: results.actions,
      outcomes: results.summary,
      insights: insights.summary,
      duration_ms: Date.now() - startTime,
    });

    return insights;
  }
}
```

### 4.2 感知系统（PerceptionSystem）

```typescript
class PerceptionSystem {
  /**
   * 扫描环境
   */
  async scan(options: ScanOptions): Promise<Perception> {
    const perception: Perception = {
      timestamp: Date.now(),
      opportunities: [],
      risks: [],
      status: {},
    };

    // 1. 时间感知
    perception.time = {
      now: Date.now(),
      hour: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
      isWorkingHours: this.isWorkingHours(),
      isBusinessDay: this.isBusinessDay(),
    };

    // 2. 目标感知
    perception.goals = await this.scanGoals({
      behindSchedule: true,
      atRisk: true,
      upcomingDeadlines: true,
    });

    // 3. 资源感知
    perception.resources = await this.scanResources({
      employees: { status: 'idle', utilization: '< 0.5' },
      budget: { remaining: '< 0.2' },
      time: { upcomingDeadlines: true },
    });

    // 4. 任务感知
    perception.tasks = await this.scanTasks({
      stuck: true,
      overdue: true,
      needsAttention: true,
    });

    // 5. 用户需求感知
    if (options.external) {
      perception.userInputs = await this.scanUserInputs({
        unprocessed: true,
        urgent: true,
      });
    }

    // 6. 模式感知
    perception.patterns = await this.recognizePatterns(perception);

    return perception;
  }

  /**
   * 模式识别
   */
  async recognizePatterns(perception: Perception): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    // 从历史数据中识别模式
    const history = await this.db.getRecentHistory({
      days: 30,
      includeTasks: true,
      includeDecisions: true,
      includeOutcomes: true,
    });

    // 使用 AI 识别模式
    const prompt = this.buildPatternRecognitionPrompt(history, perception);

    const aiResponse = await this.claude.prompt(prompt, {
      outputFormat: 'json',
    });

    return aiResponse.patterns;
  }
}
```

### 4.3 认知系统（CognitionSystem）

```typescript
class CognitionSystem {
  /**
   * 分析现状并生成洞察
   */
  async analyze(input: AnalysisInput): Promise<Analysis> {
    const analysis: Analysis = {
      situation: '',      // 当前情况描述
      opportunities: [],   // 机会列表
      problems: [],        // 问题列表
      priorities: [],      // 优先级排序
      recommendations: [], // 建议
      reasoning: '',       // 推理过程
    };

    // 1. 情况评估
    analysis.situation = await this.assessSituation(input);

    // 2. 识别机会
    analysis.opportunities = await this.identifyOpportunities({
      perception: input.perception,
      goals: input.goals,
      resources: input.resources,
    });

    // 3. 识别问题
    analysis.problems = await this.identifyProblems({
      perception: input.perception,
      goals: input.goals,
    });

    // 4. 优先级排序
    analysis.priorities = await this.prioritize({
      opportunities: analysis.opportunities,
      problems: analysis.problems,
      goals: input.goals,
      resources: input.resources,
    });

    // 5. 生成建议
    analysis.recommendations = await this.generateRecommendations({
      priorities: analysis.priorities,
      constraints: input.constraints,
      experiences: input.experiences,
    });

    // 6. 推理过程
    analysis.reasoning = await this.generateReasoning(analysis);

    return analysis;
  }

  /**
   * 优先级排序
   */
  async prioritize(input: PrioritizeInput): Promise<Priority[]> {
    // 使用多因素排序
    const items = [...input.opportunities, ...input.problems];

    const scored = items.map(item => ({
      ...item,
      score: this.calculateScore(item, {
        value: item.potentialValue || 0,
        urgency: item.urgency || 0.5,
        feasibility: item.feasibility || 0.5,
        alignment: this.calculateGoalAlignment(item, input.goals),
        resourceAvailability: this.checkResourceAvailability(item, input.resources),
      }),
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 10); // Top 10
  }

  /**
   * 计算综合评分
   */
  private calculateScore(item: any, factors: ScoreFactors): number {
    return (
      factors.value * 0.3 +
      factors.urgency * 0.25 +
      factors.feasibility * 0.2 +
      factors.alignment * 0.15 +
      factors.resourceAvailability * 0.1
    );
  }
}
```

### 4.4 决策系统（DecisionSystem）

```typescript
class DecisionSystem {
  /**
   * 做出决策
   */
  async make(input: DecisionInput): Promise<Decision> {
    const decision: Decision = {
      what: null,        // 做什么
      why: '',           // 为什么
      who: [],           // 谁来做
      when: null,        // 何时做
      how: [],           // 怎么做
      expectedOutcome: '', // 预期结果
      confidence: 0,    // 置信度
    };

    // 1. 决定做什么（从优先级列表中选择）
    decision.what = this.selectWhatToDo(input.analysis.priorities);

    // 2. 生成理由
    decision.why = await this.explainWhy(decision.what, input);

    // 3. 决定谁来做
    decision.who = await this.selectWho(decision.what, {
      availableEmployees: input.resources.employees,
      requiredSkills: decision.what.requiredSkills,
      workload: input.analysis.workload,
    });

    // 4. 决定何时做
    decision.when = await this.selectWhen(decision.what, {
      urgency: decision.what.urgency,
      dependencies: decision.what.dependencies,
      resourceAvailability: input.resources,
    });

    // 5. 决定怎么做
    decision.how = await this.planHow(decision.what, {
      who: decision.who,
      constraints: input.constraints,
      experiences: input.experiences,
    });

    // 6. 预期结果
    decision.expectedOutcome = await this.predictOutcome(decision);

    // 7. 置信度
    decision.confidence = this.calculateConfidence(decision, input);

    // 8. 记录决策
    await this.db.createDecision({
      context: input,
      options: input.analysis.priorities,
      selected_option: decision.what,
      reasoning: decision.why,
      expected_outcome: decision.expectedOutcome,
    });

    return decision;
  }
}
```

### 4.5 记忆与进化系统（MemorySystem）

```typescript
class MemorySystem {
  /**
   * 反思与学习
   */
  async reflect(input: ReflectionInput): Promise<Insights> {
    const insights: Insights = {
      whatWorked: [],
      whatDidntWork: [],
      patternsDiscovered: [],
      lessonsLearned: [],
      improvements: [],
    };

    const { cycle, outcomes } = input;

    // 1. 分析什么有效
    insights.whatWorked = await this.analyzeWhatWorked(outcomes);

    // 2. 分析什么无效
    insights.whatDidntWork = await this.analyzeWhatDidntWork(outcomes);

    // 3. 发现模式
    insights.patternsDiscovered = await this.discoverPatterns(cycle);

    // 4. 提取经验
    insights.lessonsLearned = await this.extractLessons(cycle, outcomes);

    // 5. 生成改进建议
    insights.improvements = await this.suggestImprovements(insights);

    // 6. 更新经验库
    await this.updateExperienceLibrary(insights);

    // 7. 更新模式库
    await this.updatePatternLibrary(insights.patternsDiscovered);

    // 8. 更新知识图谱
    await this.updateKnowledgeGraph(insights);

    return insights;
  }

  /**
   * 发现模式
   */
  async discoverPatterns(cycle: ThinkingCycle): Promise<Pattern[]> {
    // 使用 AI 从历史数据中发现模式
    const history = await this.db.getRecentThinkingCycles({ count: 100 });

    const prompt = `
你是一个模式识别专家。请分析以下数据，发现其中的模式。

历史思考周期数据：
${JSON.stringify(history, null, 2)}

当前思考周期：
${JSON.stringify(cycle, null, 2)}

请识别：
1. 成功模式（什么条件下会有好的结果）
2. 失败模式（什么条件下会有坏的结果）
3. 效率模式（什么方式更高效）
4. 资源模式（资源如何分配最优）

返回 JSON 格式的模式列表。
`;

    const response = await this.claude.prompt(prompt, {
      outputFormat: 'json',
    });

    return response.patterns;
  }

  /**
   * 更新知识图谱
   */
  async updateKnowledgeGraph(insights: Insights): Promise<void> {
    // 1. 提取新概念
    const concepts = await this.extractConcepts(insights);

    // 2. 提取关系
    const relations = await this.extractRelations(insights);

    // 3. 更新/创建节点
    for (const concept of concepts) {
      await this.db.upsertKnowledgeNode(concept);
    }

    // 4. 更新/创建关系
    for (const relation of relations) {
      await this.db.upsertKnowledgeEdge(relation);
    }
  }
}
```

---

## 五、重新设计的运行模式

### 5.1 守护进程（Daemon）

```typescript
class CompanyDaemon {
  private brain: CompanyBrain;
  private running = false;
  private thinkingInterval = 60000; // 1分钟思考一次

  async start(): Promise<void> {
    this.running = true;

    console.log('🏢 AI Company 正在启动...');
    console.log(`💭 思考周期: ${this.thinkingInterval / 1000}秒`);

    // 启动思考循环
    this.thinkingLoop();

    // 同时处理即时请求
    this.startRequestHandler();
  }

  private async thinkingLoop(): Promise<void> {
    while (this.running) {
      try {
        const insights = await this.brain.thinkCycle();

        // 根据洞察调整思考间隔
        if (insights.urgency > 0.8) {
          this.thinkingInterval = 30000; // 紧急：30秒
        } else if (insights.calmness > 0.8) {
          this.thinkingInterval = 300000; // 平静：5分钟
        } else {
          this.thinkingInterval = 60000; // 正常：1分钟
        }

        await this.sleep(this.thinkingInterval);
      } catch (error) {
        console.error('思考循环错误:', error);
        await this.sleep(60000); // 出错后等待1分钟再试
      }
    }
  }

  private async startRequestHandler(): Promise<void> {
    // 同时响应用户的即时请求
    // 这不会打断思考循环，而是插入事件队列
  }
}
```

### 5.2 启动命令

```bash
# 启动公司（守护进程）
ai-company start

# 查看公司状态
ai-company status

# 查看思考历史
ai-company thoughts

# 查看当前目标
ai-company goals

# 查看资源状态
ai-company resources

# 查看待办事项（公司自己安排的）
ai-company todo

# 用户主动输入（插入事件队列）
ai-company tell "帮我做某事"

# 停止公司
ai-company stop
```

---

## 六、与当前架构的对比

| 方面 | 当前架构 | 重新设计 |
|------|----------|----------|
| **运行模式** | 请求-响应 | 持续运行的守护进程 |
| **主动性** | 被动等待 | 主动发现机会 |
| **目标感** | 无 | 有愿景和战略目标 |
| **资源管理** | 简单的任务-员工匹配 | 统一的资源池管理 |
| **学习能力** | 无 | 从经验中学习，识别模式 |
| **决策能力** | 简单的规则 | 多因素决策，记录推理 |
| **记忆系统** | 简单的 memories 表 | 知识图谱 + 经验库 |
| **思考周期** | 无 | 有，可观察 |

---

## 七、实施路线图

### Phase 1: 核心框架（2周）

- [ ] CompanyBrain 骨架
- [ ] PerceptionSystem
- [ ] CognitionSystem 基础
- [ ] DecisionSystem 基础
- [ ] 数据库新表

### Phase 2: 思考循环（2周）

- [ ] 完整的 thinkCycle
- [ ] 模式识别基础
- [ ] 经验积累
- [ ] 守护进程

### Phase 3: 目标与资源（2周）

- [ ] 战略目标系统
- [ ] 资源池管理
- [ ] 优先级排序
- [ ] 机会识别

### Phase 4: 记忆与进化（2周）

- [ ] 知识图谱
- [ ] 经验库
- [ ] 模式库
- [ ] 自我优化

### Phase 5: 完善与集成（1周）

- [ ] Web Dashboard
- [ ] CLI 命令完善
- [ ] 监控与告警

---

## 八、总结

### 核心理念转变

**从"工具"到"组织"**

当前：用户说做什么 → 系统做什么 → 返回结果
重新设计：公司有自己的目标和思考 → 主动规划 → 执行 → 学习进化

### 关键差异

1. **主动性**：不是等待指令，而是主动发现机会
2. **持续性**：不是一次性执行，而是持续运行
3. **目标感**：有愿景和战略，不是盲目执行
4. **学习能力**：从经验中学习，越来越聪明
5. **可观察性**：可以看到公司的思考过程

这才是真正的"AI 公司"。
