# AI Company - 改造/重写方案

## 一、核心需求总结

### 1.1 项目愿景
**让 AI 来替我完成所有工作** - 一个自主运行的 AI 驱动公司

### 1.2 业务能力要求
| 业务类型 | 具体功能 | 当前状态 |
|---------|---------|---------|
| **社交媒体运营** | 小红书、Twitter 自动发文 | ❌ 未实现 |
| **内容创作** | 小说、文章、文案 | ❌ 未实现 |
| **代码开发** | 代码仓库管理 | ✅ 部分实现 |
| **方案设计** | 问题解决方案 | ✅ 通过 CEO 对话 |
| **头脑风暴** | 创意发散 | ✅ 通过 CEO 对话 |
| **定时脚本** | Crontab 管理 | ✅ 已实现 |

### 1.3 核心闭环要求
```
需求 → 分析 → 方案 → 执行 → 落地 → 复盘 → 进化
```

### 1.4 产出要求
| 产出类型 | 存放位置 | 当前状态 |
|---------|---------|---------|
| 代码 | `outputs/code/` | ❌ 不存在 |
| 小说 | `outputs/novels/` | ❌ 不存在 |
| 文章 | `outputs/articles/` | ❌ 不存在 |
| 社媒内容 | `outputs/posts/` | ❌ 不存在 |
| 设计 | `outputs/designs/` | ❌ 不存在 |

---

## 二、当前实现与需求差距

### 2.1 架构层面

#### 现状
- **CLI 优先** - 只有命令行界面
- **Telegram 集成** - 已实现但功能有限
- **无 Web UI** - React/Next.js 已安装但未实现
- **Python 后端** - 新建但功能不完整

#### 问题
1. **用户交互单一** - 只能通过 CLI 或 Telegram
2. **无可视化界面** - 无法直观查看任务状态、员工绩效
3. **无实时反馈** - 无法实时看到执行进度
4. **无移动端支持** - 只能电脑操作

### 2.2 业务能力层面

#### 已实现
✅ CEO 对话系统
✅ 员工管理（招募、查询）
✅ 任务管理（创建、查询）
✅ 定时脚本
✅ Telegram Bot 基础集成

#### 缺失
❌ **小红书运营** - 完全缺失
❌ **Twitter 运营** - 完全缺失
❌ **内容创作** - 小说、文章、文案生成
❌ **代码仓库管理** - 无 Git 集成
❌ **产出管理系统** - outputs 目录不存在
❌ **复盘与进化** - 无自动复盘机制
❌ **事件驱动架构** - 仍是固定流程

### 2.3 数据层面

#### 当前数据库表（TS 版本 - 12 表）
- humans, employees, employee_agents
- tasks, task_employees, task_executions
- goals, goal_plans
- memories
- crontab, cron_executions
- conversations
- chat_messages

#### 缺失的关键数据
- **产出记录表** - 无 output_files, articles, novels 等
- **社交媒体账号** - 无 social_accounts 表
- **发布记录** - 无 posts, publications 表
- **复盘记录** - 无 reviews, retrospectives 表
- **事件日志** - 无 events 表

---

## 三、改造方案（推荐：增量式升级）

### 方案选择：增量式改造 vs 全部重写

**推荐：增量式改造**

理由：
1. 保留已有稳定功能（CEO 系统、任务管理、Telegram）
2. 分阶段添加新能力，降低风险
3. 可以边用边改，不影响现有使用
4. 学习成本低，团队容易接受

---

## 四、实施计划

### 阶段 1：补全基础架构（1-2 周）

#### 1.1 创建产出管理系统
```typescript
// src/infrastructure/output/OutputManager.ts
export class OutputManager {
  async saveCode(data: {
    taskId: string;
    content: string;
    language: string;
    description: string;
  }): Promise<string>  // 返回文件路径

  async saveArticle(data: {
    title: string;
    content: string;
    tags: string[];
  }): Promise<string>;

  async saveNovel(data: {
    title: string;
    chapter: number;
    content: string;
  }): Promise<string>;

  async savePost(data: {
    platform: 'xiaohongshu' | 'twitter';
    content: string;
    images?: string[];
  }): Promise<string>;
}
```

#### 1.2 扩展数据库表
```sql
-- 产出记录表
CREATE TABLE outputs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  type TEXT NOT NULL,  -- code/article/novel/post/design
  title TEXT,
  file_path TEXT,
  content_preview TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- 社交媒体账号表
CREATE TABLE social_accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,  -- xiaohongshu/twitter/github
  account_name TEXT,
  credentials_json TEXT,  -- 加密存储
  status TEXT DEFAULT 'active',
  created_at INTEGER NOT NULL
);

-- 发布记录表
CREATE TABLE publications (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  output_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  platform_post_id TEXT,
  status TEXT,  -- pending/published/failed
  published_at INTEGER,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (output_id) REFERENCES outputs(id),
  FOREIGN KEY (account_id) REFERENCES social_accounts(id)
);
```

#### 1.3 初始化 outputs 目录
```bash
mkdir -p outputs/{code,articles,novels,posts,designs,archive}
```

### 阶段 2：实现核心业务能力（2-3 周）

#### 2.1 小红书运营能力
```typescript
// src/capabilities/social/XiaohongshuPublisher.ts
export class XiaohongshuPublisher {
  async publish(data: {
    title: string;
    content: string;
    images?: string[];
    tags?: string[];
  }): Promise<string> {
    // 1. 保存到 outputs/posts/
    // 2. 通过小红书 API 发布
    // 3. 记录发布结果到 publications 表
    // 4. 更新任务状态
  }

  async schedulePost(config: {
    cron: string;
    content: string;
  }): Promise<void> {
    // 创建定时发布任务
  }
}
```

#### 2.2 Twitter 运营能力
```typescript
// src/capabilities/social/TwitterPublisher.ts
export class TwitterPublisher {
  async tweet(data: {
    content: string;  // < 280 字符
    media?: string[];
  }): Promise<string> {
    // 使用 Twitter API v2
  }

  async createThread(tweets: string[]): Promise<string> {
    // 创建推文串
  }
}
```

#### 2.3 内容创作能力
```typescript
// src/capabilities/content/
├── ArticleWriter.ts      // 文章写作
├── Novelist.ts            // 小说创作
├── Copywriter.ts          // 文案写作
└── ScriptWriter.ts        // 脚本写作
```

#### 2.4 Git 仓库管理
```typescript
// src/capabilities/code/RepositoryManager.ts
export class RepositoryManager {
  async createRepo(data: {
    name: string;
    description: string;
    private: boolean;
  }): Promise<string> {
    // 使用 GitHub/GitLab API 创建仓库
  }

  async commit(data: {
    repo: string;
    message: string;
    files: { path: string; content: string }[];
  }): Promise<string> {
    // 提交代码
  }

  async createPR(data: {
    repo: string;
    title: string;
    description: string;
    branch: string;
  }): Promise<string> {
    // 创建 Pull Request
  }
}
```

### 阶段 3：实现 Web Dashboard（2-3 周）

#### 3.1 技术栈选择
```
Frontend: Next.js 14 + shadcn/ui + TailwindCSS
State: Zustand
Data Fetching: TanStack Query
Real-time: WebSocket
Charts: Recharts
```

#### 3.2 核心页面
| 页面 | 功能 | 优先级 |
|------|------|--------|
| Dashboard | 任务概览、系统状态 | HIGH |
| Tasks | 任务列表、详情、操作 | HIGH |
| Employees | 员工列表、绩效、技能 | HIGH |
| Outputs | 产出浏览、下载 | HIGH |
| Socials | 社交媒体账号、发布记录 | MEDIUM |
| Automation | 定时任务管理 | MEDIUM |
| Settings | 配置管理 | LOW |

#### 3.3 实时更新
```typescript
// 通过 WebSocket 推送更新
const socket = io('ws://localhost:8000/ws');
socket.on('task:updated', (task) => {
  queryClient.setQueryData(['tasks', task.id], task);
});
socket.on('employee:busy', (emp) => {
  queryClient.setQueryData(['employees'], (prev) =>
    prev?.map(e => e.id === emp.id ? emp : e)
  );
});
```

### 阶段 4：实现事件驱动架构（3-4 周）

#### 4.1 事件总线
```typescript
// src/core/runtime/EventBus.ts (已存在，需扩展)
export type SystemEvent =
  | { type: 'task.created'; taskId: string }
  | { type: 'task.completed'; taskId: string; output: any }
  | { type: 'output.created'; outputId: string }
  | { type: 'social.published'; platform: string; postId: string }
  | { type: 'error.detected'; error: any };

export class EventBus {
  on<T extends SystemEvent>(event: T, handler: (e: T) => void): void;
  emit<T extends SystemEvent>(event: T): void;
}
```

#### 4.2 策略引擎
```typescript
// src/core/strategy/StrategyEngine.ts
export class StrategyEngine {
  async onEvent(event: SystemEvent): Promise<Action[]> {
    switch (event.type) {
      case 'output.created':
        return [
          { action: 'publish_to_xiaohongshu', data: event },
          { action: 'archive_to_database', data: event }
        ];
      case 'task.completed':
        return [
          { action: 'analyze_quality', data: event },
          { action: 'update_knowledge_base', data: event }
        ];
    }
  }
}
```

#### 4.3 调度器
```typescript
// src/core/scheduler/DynamicScheduler.ts
export class DynamicScheduler {
  async run(): Promise<void> {
    while (true) {
      // 1. 获取待执行步骤
      const steps = await this.getExecutableSteps();

      // 2. 并行执行
      await Promise.all(
        steps.map(step => this.executeStep(step))
      );

      // 3. 等待事件或定时器
      await this.waitForNextTrigger();
    }
  }
}
```

### 阶段 5：实现复盘与进化（2 周）

#### 5.1 复盘系统
```typescript
// src/core/review/Retrospective.ts
export class RetrospectiveService {
  async conductReview(taskId: string): Promise<Review> {
    const task = await this.taskService.get(taskId);
    const output = await this.outputService.getByTask(taskId);
    const feedback = await this.collectFeedback(taskId);

    return {
      taskId,
      quality: this.assessQuality(output),
      improvements: this.suggestImprovements(output),
      lessons: this.extractLessons(task),
      evolution: this.suggestEvolution(output),
    };
  }
}
```

#### 5.2 知识库更新
```typescript
// src/core/knowledge/KnowledgeBase.ts
export class KnowledgeBase {
  async learnFrom(review: Review): Promise<void> {
    // 1. 提取经验教训
    // 2. 更新员工技能评估
    // 3. 优化工作流程
    // 4. 更新 Prompt 模板
  }
}
```

---

## 五、关键技术实现

### 5.1 小红书 API 集成
```typescript
// src/integrations/social/XiaohongshuClient.ts
export class XiaohongshuClient {
  private apiUrl = 'https://edith.xiaohongshu.com/api';

  async publishNote(data: {
    title: string;
    desc: string;
    images: string[];
  }): Promise<{ id: string }> {
    // 使用爬虫或官方 API
  }
}
```

### 5.2 Twitter API 集成
```typescript
// src/integrations/social/TwitterClient.ts
export class TwitterClient {
  private apiUrl = 'https://api.twitter.com/2';

  async createTweet(data: {
    text: string;
    media?: { media_id: string }[];
  }): Promise<{ id: string; text: string }> {
    // Twitter API v2
  }
}
```

### 5.3 Webhook 服务
```typescript
// src/interfaces/webhook/WebhookReceiver.ts
export class WebhookReceiver {
  // 接收来自各平台的事件
  async handleGithubWebhook(event: GithubEvent): Promise<void>
  async handleTwitterWebhook(event: TwitterEvent): Promise<void>
}
```

---

## 六、推荐技术架构（最终状态）

```
┌──────────────────────────────────────────────────────────────┐
│                          用户入口层                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │  Web UI   │  │  CLI      │  │ Telegram │  │  API     │     │
│  │(Next.js) │  │(Commander)│  │   Bot    │  │(FastAPI) │     │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘     │
│       │            │            │            │            │
└───────┼────────────┼────────────┼────────────┼────────────┘
        │            │            │            │
        └────────────┴────────────┴────────────┘
                                 │
┌──────────────────────────────────────────────────────────────┐
│                          业务逻辑层                              │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                    事件总线                         │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐       │    │
│  │  │策略引擎    │  │  调度器    │  │  执行器    │       │    │
│  │  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘       │    │
│  │         │               │               │           │    │
│  │  ┌─────▼──────────────────────▼───────────▼─────┐   │    │
│  │  │          能力中心 (25+ 能力)                 │   │    │
│  │  │  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────────┐  │   │    │
│  │  │  │小红书│  │Twitter│  │小说家│  │代码仓库  │  │   │    │
│  │  │  └──────┘  └──────┘  └──────┘  │  Git管理  │  │   │    │
│  │  │  ┌──────┐  ┌──────┐  ┌──────────┐  │   │    │
│  │  │  │文案 │  │文章 │  │设计师 │  │  │   │    │
│  │  │  └──────┘  └──────┘  └──────────┘  │   │    │
│  │  └───────────────────────────────────────────────┘   │    │
│  └────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
                                 │
┌──────────────────────────────────────────────────────────────┐
│                          数据层                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │Database  │  │  Cache   │  │  Queue   │  │  Storage  │     │
│  │(SQLite)  │  │ (Redis)  │  │ (Bull)   │  │Outputs/  │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
└──────────────────────────────────────────────────────────────┘
```

---

## 七、实施优先级

### P0 - 必须立即实现（阻塞核心业务）
1. ✅ 任务管理系统（已有）
2. ❌ 产出管理系统（`outputs/` 目录 + OutputManager）
3. ❌ 社交媒体发布能力（小红书、Twitter）
4. ❌ 内容创作能力（文章、小说）

### P1 - 高优先级（显著提升体验）
1. ❌ Web Dashboard
2. ❌ 实时进度显示
3. ❌ Git 仓库管理
4. ❌ 复盘与进化系统

### P2 - 中优先级（锦上添花）
1. ❌ 事件驱动动态调度
2. ❌ 移动端支持
3. ❌ 多平台扩展（微博、抖音等）

---

## 八、结论

### 当前系统评价
- **优势**：CEO 系统、任务管理、员工管理基础扎实
- **劣势**：缺少核心业务能力实现（社交运营、内容创作）
- **差距**：与"全方位完成需求"的目标相差甚远

### 改造方案核心
1. **补全能力中心** - 实现小红书、Twitter、内容创作等核心能力
2. **建立产出体系** - outputs 目录 + 管理器
3. **构建可视化** - Web Dashboard 实时监控
4. **进化到事件驱动** - 动态调度、自动复盘

### 最终目标
一个完整的 AI 驱动公司，能够：
- ✅ 接收任何形式的需求
- ✅ 自动分析和规划
- ✅ 分配给合适的 AI 员工执行
- ✅ 自动产出并发布到各平台
- ✅ 自动复盘并持续进化
