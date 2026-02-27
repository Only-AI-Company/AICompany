# AI Company - 渐进式实施方案

## 实施原则

1. **不推翻重写** - 在现有代码基础上逐步演进
2. **每步可验证** - 每个阶段都有明确的产出和验证方式
3. **向后兼容** - 不破坏现有功能
4. **增量交付** - 每个阶段都能产生价值

---

## 实施路线图

### Stage 0: 验证核心想法（1-2 天）

**目标**：验证"持续思考循环"是否可行，是否有价值

**实施**：
```typescript
// src/core/brain/ThinkingLoop.ts（新建）

export class ThinkingLoop {
  async runOneCycle(): Promise<ThinkingResult> {
    const startTime = Date.now();

    // 1. 扫描：有什么需要关注的？
    const scan = await this.scan();

    // 2. 分析：什么是重要的？
    const analysis = await this.analyze(scan);

    // 3. 决策：要做什么？
    const decisions = await this.decide(analysis);

    // 4. 执行
    const results = await this.execute(decisions);

    return {
      scan,
      analysis,
      decisions,
      results,
      duration: Date.now() - startTime,
    };
  }
}
```

**验证方式**：
```bash
# 新增命令
ai-company think          # 执行一次思考循环，显示结果
ai-company think --watch  # 持续运行，每次显示结果
```

**产出**：
- 看到系统"思考"的过程
- 验证是否能发现有价值的事情
- 验证决策是否合理

---

### Stage 1: 扫描系统（2-3 天）

**目标**：让系统能够主动发现需要关注的事情

**实施**：

#### 1.1 创建 Scanner 接口

```typescript
// src/core/brain/scanners/Scanner.ts（新建）

export interface Scanner {
  name: string;
  scan(): Promise<ScanResult>;
}

export interface ScanResult {
  scanner: string;
  items: ScanItem[];
  timestamp: number;
}

export interface ScanItem {
  type: 'opportunity' | 'problem' | 'info';
  title: string;
  description: string;
  urgency: number;      // 0-1
  importance: number;   // 0-1
  data: any;            // 原始数据
}
```

#### 1.2 实现具体 Scanner

```typescript
// src/core/brain/scanners/TaskScanner.ts
// 扫描：卡住的任务、超期的任务、高优先级任务

// src/core/brain/scanners/EmployeeScanner.ts
// 扫描：空闲员工、过载员工、绩效下降

// src/core/brain/scanners/GoalScanner.ts
// 扫描：滞后的目标、即将到期的目标

// src/core/brain/scanners/TimeScanner.ts
// 扫描：工作时间、周末、月末（影响任务安排）
```

#### 1.3 集成到 ThinkingLoop

```typescript
class ThinkingLoop {
  private scanners: Scanner[] = [
    new TaskScanner(db),
    new EmployeeScanner(db),
    new GoalScanner(db),
    new TimeScanner(),
  ];

  async scan(): Promise<ScanResult[]> {
    const results = await Promise.all(
      this.scanners.map(s => s.scan())
    );
    return results;
  }
}
```

**验证方式**：
```bash
ai-company scan          # 显示所有扫描结果
ai-company scan --task   # 只显示任务扫描结果
```

**产出**：
- 一套可扩展的扫描器
- 能主动发现需要关注的事项

---

### Stage 2: 分析系统（2-3 天）

**目标**：对扫描结果进行分析，确定优先级

**实施**：

#### 2.1 创建 Analyzer

```typescript
// src/core/brain/analyzer/Analyzer.ts

export class Analyzer {
  async analyze(scanResults: ScanResult[]): Promise<Analysis> {
    // 1. 聚合扫描结果
    const items = this.aggregateItems(scanResults);

    // 2. 去重和合并
    const merged = this.mergeDuplicates(items);

    // 3. 评分和排序
    const scored = await this.scoreItems(merged);

    // 4. 生成分析报告
    return this.generateReport(scored);
  }

  private async scoreItems(items: ScanItem[]): Promise<ScoredItem[]> {
    return items.map(item => ({
      ...item,
      score: this.calculateScore(item),
      reason: this.explainScore(item),
    }));
  }

  private calculateScore(item: ScanItem): number {
    return (
      item.urgency * 0.4 +
      item.importance * 0.4 +
      this.getTimeFactor(item) * 0.2
    );
  }
}
```

**验证方式**：
```bash
ai-company analyze       # 显示分析结果
ai-company analyze --top 10  # 只显示 top 10
```

---

### Stage 3: 决策系统（3-4 天）

**目标**：根据分析结果，决定做什么

**实施**：

#### 3.1 创建 Decider

```typescript
// src/core/brain/decider/Decider.ts

export class Decider {
  async decide(analysis: Analysis): Promise<Decision[]> {
    const decisions: Decision[] = [];

    for (const item of analysis.topItems) {
      // 跳过已经在处理的
      if (await this.isBeingHandled(item)) {
        continue;
      }

      // 决定是否处理
      const shouldHandle = await this.shouldHandle(item);
      if (!shouldHandle) {
        continue;
      }

      // 决定如何处理
      const action = await this.decideAction(item);
      decisions.push(action);
    }

    return decisions;
  }

  private async shouldHandle(item: ScoredItem): Promise<boolean> {
    // 规则：分数 > 0.7 才处理
    if (item.score < 0.7) return false;

    // 规则：不是用户触发的不自动处理（保守起见）
    if (item.type !== 'user_request') return false;

    // 更多规则...
    return true;
  }

  private async decideAction(item: ScoredItem): Promise<Decision> {
    return {
      type: this.determineActionType(item),
      item: item,
      description: `处理: ${item.title}`,
      executor: this.selectExecutor(item),
      priority: item.score,
    };
  }
}
```

**验证方式**：
```bash
ai-company decide        # 显示将要做的决策
ai-company decide --dry-run  # 只显示，不执行
```

---

### Stage 4: 执行与反馈（2-3 天）

**目标**：执行决策，并记录结果

**实施**：

#### 4.1 执行器接口

```typescript
// src/core/brain/executors/Executor.ts

export interface Executor {
  name: string;
  canExecute(decision: Decision): boolean;
  execute(decision: Decision): Promise<ExecutionResult>;
}
```

#### 4.2 具体执行器

```typescript
// TaskExecutor - 处理任务相关决策
// EmployeeExecutor - 处理员工相关决策
// NotificationExecutor - 发送通知
// ResourceExecutor - 资源调整
```

#### 4.3 反馈记录

```typescript
// src/core/brain/Feedback.ts

export class Feedback {
  async record(decision: Decision, result: ExecutionResult): Promise<void> {
    // 记录到 thinking_cycles 表
    await this.db.createThinkingCycle({
      scan: decision.scanResult,
      analysis: decision.analysis,
      decision: decision,
      result: result,
      timestamp: Date.now(),
    });
  }
}
```

**验证方式**：
```bash
ai-company execute       # 执行决策
ai-company history       # 查看历史思考记录
```

---

### Stage 5: 守护进程（1-2 天）

**目标**：让系统持续运行

**实施**：

```typescript
// src/core/brain/Daemon.ts

export class Daemon {
  private thinkingLoop: ThinkingLoop;
  private interval = 60000; // 1分钟

  async start(): Promise<void> {
    console.log('🏢 AI Company 正在启动...');
    console.log(`💭 思考间隔: ${this.interval / 1000}秒`);

    while (true) {
      try {
        const result = await this.thinkingLoop.runOneCycle();

        // 显示摘要
        this.printSummary(result);

        // 等待下一个周期
        await this.sleep(this.interval);
      } catch (error) {
        console.error('思考错误:', error);
        await this.sleep(60000);
      }
    }
  }

  private printSummary(result: ThinkingResult): void {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🤔 思考周期 #${result.cycleNumber}`);
    console.log(`⏱️  耗时: ${result.duration}ms`);
    console.log(`🔍 发现: ${result.scan.length} 项`);
    console.log(`📊 分析: ${result.analysis.topItems.length} 项重要`);
    console.log(`✅ 决策: ${result.decisions.length} 个行动`);
    console.log(`📈 执行: ${result.results.success} 成功, ${result.results.failed} 失败`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}
```

**验证方式**：
```bash
ai-company start         # 启动守护进程
ai-company status        # 查看运行状态
ai-company stop          # 停止
```

---

## 完整实施顺序

| Stage | 名称 | 时间 | 产出 | 验证 |
|-------|------|------|------|------|
| 0 | 核心验证 | 1-2天 | ThinkingLoop骨架 | `ai-company think` |
| 1 | 扫描系统 | 2-3天 | 4个Scanner | `ai-company scan` |
| 2 | 分析系统 | 2-3天 | Analyzer | `ai-company analyze` |
| 3 | 决策系统 | 3-4天 | Decider | `ai-company decide` |
| 4 | 执行反馈 | 2-3天 | Executor + Feedback | `ai-company execute` |
| 5 | 守护进程 | 1-2天 | Daemon | `ai-company start` |

**总计**：11-17 天

---

## 每个阶段的详细步骤

### Stage 1: 扫描系统详细步骤

#### Step 1.1: 创建基础文件

```bash
mkdir -p src/core/brain/scanners
touch src/core/brain/scanners/Scanner.ts
touch src/core/brain/scanners/TaskScanner.ts
touch src/core/brain/scanners/EmployeeScanner.ts
touch src/core/brain/scanners/GoalScanner.ts
touch src/core/brain/scanners/TimeScanner.ts
touch src/core/brain/scanners/index.ts
```

#### Step 1.2: 实现 Scanner.ts

```typescript
// src/core/brain/scanners/Scanner.ts
export interface Scanner {
  name: string;
  scan(): Promise<ScanResult>;
}

export interface ScanResult {
  scanner: string;
  items: ScanItem[];
  timestamp: number;
}

export interface ScanItem {
  id: string;
  type: 'opportunity' | 'problem' | 'info';
  title: string;
  description: string;
  urgency: number;
  importance: number;
  data: any;
}
```

#### Step 1.3: 实现 TaskScanner

```typescript
// src/core/brain/scanners/TaskScanner.ts
import type { AIDatabase } from '../../../infrastructure/database/index.js';
import type { Scanner, ScanResult } from './Scanner.js';

export class TaskScanner implements Scanner {
  name = 'TaskScanner';

  constructor(private db: AIDatabase) {}

  async scan(): Promise<ScanResult> {
    const items = [];

    // 1. 查找卡住的任务（in_progress > 2小时）
    const stuckTasks = this.db.prepare(`
      SELECT id, description, status, created_at
      FROM tasks
      WHERE status = 'in_progress'
        AND started_at < ?
    `).all(Date.now() - 2 * 60 * 60 * 1000);

    for (const task of stuckTasks) {
      items.push({
        id: `task-stuck-${task.id}`,
        type: 'problem' as const,
        title: `任务可能卡住: ${task.description.slice(0, 30)}...`,
        description: `任务 ${task.id} 已经运行超过2小时`,
        urgency: 0.7,
        importance: 0.6,
        data: { taskId: task.id },
      });
    }

    // 2. 查找高优先级待处理任务
    const pendingTasks = this.db.prepare(`
      SELECT id, description, priority
      FROM tasks
      WHERE status = 'pending'
        AND priority IN ('high', 'urgent')
      ORDER BY priority DESC
      LIMIT 5
    `).all();

    for (const task of pendingTasks) {
      items.push({
        id: `task-pending-${task.id}`,
        type: 'opportunity' as const,
        title: `待处理任务: ${task.description.slice(0, 30)}...`,
        description: `优先级: ${task.priority}`,
        urgency: task.priority === 'urgent' ? 0.9 : 0.7,
        importance: 0.8,
        data: { taskId: task.id },
      });
    }

    return {
      scanner: this.name,
      items,
      timestamp: Date.now(),
    };
  }
}
```

#### Step 1.4: 添加 CLI 命令

```typescript
// src/cli/commands/think.ts
import { getDatabase } from '../../infrastructure/database/index.js';
import { TaskScanner } from '../../core/brain/scanners/TaskScanner.js';

export const command = 'scan';
export const describe = '扫描系统状态';

export async function handler(args: any): Promise<void> {
  const db = getDatabase();
  const scanner = new TaskScanner(db);

  const result = await scanner.scan();

  console.log(`\n🔍 ${result.scanner} 扫描结果:`);
  console.log(`   发现 ${result.items.length} 项\n`);

  for (const item of result.items) {
    const emoji = item.type === 'problem' ? '⚠️' : '💡';
    console.log(`${emoji} ${item.title}`);
    console.log(`   ${item.description}`);
    console.log(`   紧急度: ${(item.urgency * 100).toFixed(0)}% | 重要度: ${(item.importance * 100).toFixed(0)}%\n`);
  }
}
```

#### Step 1.5: 测试

```bash
npm run build
ai-company scan
```

**预期输出**：
```
🔍 TaskScanner 扫描结果:
   发现 3 项

⚠️ 任务可能卡住: 实现用户登录功能...
   任务 task-123 已经运行超过2小时
   紧急度: 70% | 重要度: 60%

💡 待处理任务: 编写API文档...
   优先级: high
   紧急度: 70% | 重要度: 80%
```

---

## 关键设计决策

### 1. 保守起步

- 第一版只**观察**，不自动执行
- 只处理用户明确请求的任务
- 需要用户确认才执行重要操作

### 2. 可观察性

```bash
ai-company think          # 看到完整的思考过程
ai-company scan           # 看到扫描结果
ai-company analyze        # 看到分析结果
ai-company decide         # 看到决策
ai-company history        # 看到历史记录
```

### 3. 可配置性

```typescript
// config.json
{
  "brain": {
    "thinkingInterval": 60000,
    "autoExecute": false,           // 是否自动执行
    "minScore": 0.7,                // 最低处理分数
    "maxConcurrent": 3,             // 最大并发决策
    "enabledScanners": ["task", "employee", "goal", "time"]
  }
}
```

---

## 总结

这个实施计划：

1. ✅ **具体** - 每个阶段都有明确的文件、代码、命令
2. ✅ **可验证** - 每个阶段都有验证命令
3. ✅ **渐进式** - 不推翻现有代码，增量添加
4. ✅ **有价值** - 每个阶段都能产生实际效用

**下一步**：从 Stage 0 开始，验证核心想法？
