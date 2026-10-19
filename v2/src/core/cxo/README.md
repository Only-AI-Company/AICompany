# CXO 架构

## 设计原则

**各司其职，职责单一，边界清晰**

## CXO 职责划分

### CEO (Chief Executive Officer) - 首席执行官
**核心职责**：意图分析和路由
- 接收用户输入
- 分析意图类型（query/goal/task/script）
- 路由到相应的 CXO 或处理器

**不负责**：
- ❌ 员工匹配（交给 CRO）
- ❌ 具体执行（交给相应的 CXO）
- ❌ 风险评估（交给具体执行者）

---

### CRO (Chief Resource Officer) - 首席资源官
**核心职责**：员工管理
- 根据任务需求匹配员工
- 招聘新员工（创建新 agent）
- 员工绩效追踪和优化

**输入**：任务需求 + 员工列表
**输出**：选中的员工 + 专业 prompt

---

### CTO (Chief Technology Officer) - 首席技术官
**核心职责**：技术任务执行
- 代码开发
- 系统架构设计
- 技术问题解决

**对应能力**：coding, architecture, devops

---

### CMO (Chief Marketing Officer) - 首席营销官
**核心职责**：内容创作和运营
- 写作（小说、文章、文案）
- 社交媒体运营（小红书、Twitter）
- 品牌管理

**对应能力**：writing, marketing, content-creation, xiaohongshu, twitter

---

### COO (Chief Operating Officer) - 首席运营官
**核心职责**：任务规划和协调
- 复杂任务分解
- 流程优化
- 日常工作协调

**对应能力**：planning, management, coordination

---

### CFO (Chief Financial Officer) - 首席财务官
**核心职责**：财务分析
- 预算管理
- 成本控制
- 数据分析

**对应能力**：analysis, finance, data

## 数据流

```
用户输入
    ↓
┌─────────────────────────────────────────┐
│  CEO (IntentAnalyzer)                    │
│  - analyzeIntent(userInput)              │
│  - 返回: {type, content, metadata}       │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│  IntentRouter                            │
│  - 根据 type 路由到相应的处理器           │
└─────────────────────────────────────────┘
    ↓
    ├─ query → QueryHandler → 返回结果
    ├─ goal → GoalManager → 创建目标
    ├─ task → COO → 规划任务
    └─ script → ScriptExecutor → 执行脚本
              ↓
        ┌─────────────────────────────────────────┐
        │  CRO (EmployeeMatcher)                  │
        │  - findEmployee(task)                   │
        │  - hireEmployee(requirements)            │
        └─────────────────────────────────────────┘
              ↓
        ┌─────────────────────────────────────────┐
        │  相应的 CXO / Employee Agent             │
        │  - CTO: 技术任务                         │
        │  - CMO: 内容运营                         │
        │  - COO: 运营协调                         │
        │  - CFO: 财务分析                         │
        └─────────────────────────────────────────┘
```

## 文件结构

```
src/core/cxo/
├── CEO.ts              # 意图分析
├── CRO.ts              # 员工管理
├── CTO.ts              # 技术执行
├── CMO.ts              # 营销内容
├── COO.ts              # 运营协调
├── CFO.ts              # 财务分析
├── IntentRouter.ts     # 意图路由
├── types.ts            # 共享类型
└── index.ts            # 导出
```

## 迁移计划

### Phase 1: 拆分 CEO
1. 创建新的 CEO（只负责意图分析）
2. 将员工匹配逻辑移到 CRO
3. 将 prompt 生成逻辑移到 CRO

### Phase 2: 创建其他 CXO
1. 创建 CTO, CMO, COO, CFO
2. 将执行逻辑从 CoreProcess 移到相应 CXO

### Phase 3: 重构 CoreProcess
1. 简化为路由器
2. 调用相应的 CXO

## 接口定义

### CEO 接口
```typescript
interface CEO {
  analyzeIntent(userInput: string, chatHistory?: ChatMessage[]): Promise<Intent>;
}

interface Intent {
  type: 'query' | 'goal' | 'task' | 'script';
  content: string;
  metadata?: Record<string, any>;
}
```

### CRO 接口
```typescript
interface CRO {
  findEmployee(task: Task, employees: Employee[]): Promise<EmployeeMatch>;
  hireEmployee(requirements: Requirements): Promise<Employee>;
  updatePerformance(employeeId: string, review: Review): Promise<void>;
}

interface EmployeeMatch {
  employee: Employee;
  agentPrompt: string;  // 专业的 prompt
  matchReason: string;
}
```

### CXO 执行接口
```typescript
interface CXO {
  canHandle(task: Task): boolean;
  execute(task: Task): Promise<ExecutionResult>;
}
```
