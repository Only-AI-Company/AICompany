# AI Company

> **让 AI 来替我完成所有工作**

一个自主运行的 AI 驱动公司，旨在实现从需求到进化的完整闭环管理。这家公司是为了解决问题、满足需要而设计的。

## 核心职责与能力

本项目致力于构建一个全能的 AI 团队，主要具备以下职责与能力：

### 1. 业务能力
- **社交媒体运营**：自动根据运营目标进行内容规划与发布。
- **内容创作**：撰写高质量的小说、文章与文案。
- **方案设计**：针对特定问题提供完整的解决方案。
- **头脑风暴**：提供创意支持与思维发散。

### 2. 产出目标
- **代码仓库**：维护有效、可靠的代码仓库。
- **文学作品**：持续产出小说与文章。
- **多平台运营**：
  - **小红书**：自动根据运营目标发布文章。
  - **Twitter**：发布文章与动态。
- **结果导向**：以强烈的目标感驱动产出。

### 3. 系统能力
- **完整链路管理**：实现 **需求 → 分析 → 方案 → 执行 → 落地 → 复盘 → 进化** 的高效闭环。
- **自主进化**：通过复盘与学习，不断优化自身能力与工作流。
- **消息通知**：支持多渠道、事件驱动的实时通知。

## 安装

```bash
# 克隆项目
git clone https://github.com/Only-AI-Company/ai-company.git
cd ai-company

# 安装依赖
npm install

# 初始化
npm start init
```

## 产出目录

所有产出数据存放在 `outputs/` 目录下：

```
outputs/
├── code/          # 代码仓库产出
├── novels/        # 小说产出
├── articles/      # 文章产出
├── posts/         # 社媒内容产出
├── designs/       # 设计方案产出
└── archive/        # 归档
```

**注意**：`outputs/` 目录已加入 `.gitignore`，所有产出数据都在本地，不会提交到 git。

---

## 使用

### 快速开始

```bash
# 安装依赖
npm install

# 编译
npm run build

# 配置 LLM Provider（选一个）
ai-company config anthropic <your-api-key>
# 或
ai-company config openai <your-api-key>
# 或
ai-company config ollama  # 本地 Ollama

# 初始化公司
node dist/interfaces/cli/index.js init

# 告诉公司需求
node dist/interfaces/cli/index.js tell "帮我写一篇文章"
```

### 命令

| 命令 | 说明 |
|:---|:---|
| `ai-company config` | 配置 LLM Provider |
| `ai-company init` | 初始化公司 |
| `ai-company tell` | 告诉公司需求 |
| `ai-company status` | 查看公司状态 |
| `ai-company employee list/hire/fire` | 员工管理 |
| `ai-company task list/status` | 任务管理 |

### 测试

完整的测试套件用于验证系统符合公司设计理念：

```bash
# 编译并运行所有测试
npm run build && npm test

# 查看测试报告
cat tests/TEST_REPORT.md
```

**测试覆盖**:
- ✅ 系统初始化
- ✅ 部门管理 (5部门)
- ✅ 员工管理 (C-Level + Worker)
- ✅ CEO 编排 (7阶段流程)
- ✅ 任务拆分
- ✅ 任务分配
- ✅ 记忆系统 (精华记录)
- ✅ 输出格式验证 (无垃圾)
- ✅ 完整任务流程

详见 [tests/README.md](tests/README.md)

### MVP 状态 (v3.0)

当前版本实现了极简最小可运行版本，包含：

| 模块 | 功能 |
|:---|:---|
| **权限** | 3 动作 (CREATE_TASK, ASSIGN_TASK, SEND_MESSAGE)、3 资源 |
| **组织** | Employee (员工) + Department (部门) |
| **任务** | 5 状态 (pending → ready → in_progress → completed/failed) |
| **消息** | 点对点消息系统 |
| **审计** | 文件审计日志 |

---

## 实验 (Experiments)

从第一性原理出发，通过具体场景逐步演化架构。

### 小红书自动化运营

AI 内容生成 + 自动发布的完整工作流。

```bash
cd experiments/xiaohongshu

# 首次登录
npm run setup

# 自动发布
npm run publish "春季穿搭搭配"

# 查看历史
npm run history
```

**功能：**
- ✅ AI 生成小红书文案
- ✅ 自动发布到小红书
- ✅ 数据库存储历史记录
- ✅ Cookies 会话管理

**快速开始：** 查看 [experiments/xiaohongshu/README.md](experiments/xiaohongshu/README.md)

## 许可证

[MIT](LICENSE)
