# 小红书自动化运营

> 从最简单的功能开始，逐层封装，逐步演化架构

## 项目定位

这是 AI Company 的第一个实验项目：**小红书内容自动生成与发布**

### 核心理念

1. **第一性原理**：从真实需求出发，不做过度设计
2. **逐层封装**：发现重复代码再抽象，不提前设计
3. **快速验证**：能立即看到效果，获得反馈
4. **自然演化**：架构从需求中长出来，不是设计出来的

### 功能范围

```
第一阶段（MVP）
├── AI 生成小红书文案
├── 保存到数据库
└── 自动发布到小红书

第二阶段（待验证）
├── 图片上传
├── 定时发布
├── 批量生成
└── 数据统计
```

---

## 快速开始

### 1. 安装依赖

```bash
cd ai-company/experiments/xiaohongshu

npm install

# 安装 Playwright 浏览器
npx playwright install chromium
```

### 2. 配置环境

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env，填入你的 API Key
# ANTHROPIC_API_KEY=your_key_here
```

### 3. 首次登录

```bash
npm run setup
```

浏览器会自动打开，你手动登录小红书。登录完成后，Cookies 会自动保存到 `storage/cookies.json`。

### 4. 自动发布

```bash
npm run publish "春季穿搭搭配"
```

流程：
1. AI 生成关于"春季穿搭搭配"的小红书文案
2. 保存到数据库
3. 使用保存的会话自动发布到小红书

---

## 项目结构

```
xiaohongshu/
├── README.md                  # 本文件
├── package.json               # 依赖配置
├── tsconfig.json              # TS 配置
├── .env.example               # 环境变量模板
│
├── config/                    # 配置
│   └── prompts.ts             # AI 提示词
│
├── core/                      # 核心逻辑
│   ├── ContentGenerator.ts    # AI 内容生成
│   ├── PostRepository.ts      # 数据存储
│   ├── BrowserSession.ts      # 浏览器会话管理
│   ├── XiaohongshuBot.ts      # 小红书机器人
│   └── Workflow.ts            # 完整工作流
│
├── scripts/                   # 脚本
│   ├── setup.ts               # 首次登录
│   └── publish.ts             # 发布命令
│
└── storage/                   # 数据存储
    ├── database.db            # SQLite 数据库
    ├── cookies.json           # 保存的 Cookies
    └── logs/                  # 日志文件
```

---

## 设计原则

### 1. 简单优先

```typescript
// ❌ 不要一开始就这样
class AbstractContentGeneratorFactory
  withComplexDependencyInjection()

// ✅ 先这样
function generateContent(topic: string): string {
  return ai.generate(topic);
}
```

### 2. 发现再抽象

```
问题：生成逻辑重复 3 次
→ 提取 ContentGenerator 类

问题：数据库操作散落各处
→ 提取 PostRepository 类

问题：多个步骤串联
→ 提取 Workflow 类
```

### 3. 可测试性

每个模块都可以独立测试：

```typescript
// 可以单独测试内容生成
const generator = new ContentGenerator();
const content = await generator.generate('春季穿搭');

// 可以单独测试存储
const repo = new PostRepository();
const id = repo.save('春季穿搭', content);

// 可以单独测试发布
const bot = new XiaohongshuBot(context);
await bot.publish(post);
```

---

## 架构演化

### 迭代 1: 最简单版本

```typescript
// 所有代码在一个文件里
async function main() {
  const content = await ai.generate(topic);
  db.save(content);
  bot.publish(content);
}
```

### 迭代 2: 提取生成器

```
发现：生成逻辑需要复用
→ 提取 ContentGenerator 类
→ 支持多种平台（小红书、Twitter...）
```

### 迭代 3: 提取存储

```
发现：数据库操作重复
→ 提取 PostRepository 类
→ 统一数据访问接口
```

### 迭代 4: 提取工作流

```
发现：多个步骤串联
→ 提取 Workflow 类
→ 清晰的执行流程
```

### 迭代 5: 添加调度

```
发现：需要定时发布
→ 添加 Scheduler
→ 支持 cron 表达式
```

---

## 技术栈

| 技术 | 用途 |
|:---|:---|
| **TypeScript** | 类型安全 |
| **Playwright** | 浏览器自动化 |
| **Anthropic** | AI 内容生成 |
| **SQLite** | 数据存储 |
| **Node.js** | 运行环境 |

---

## 安全说明

1. **不存储密码**：只存储 Cookies，不需要你的密码
2. **会话隔离**：Cookies 保存在本地 `storage/` 目录
3. **透明可控**：首次登录你可以全程观察浏览器操作
4. **定期刷新**：Cookies 过期后重新运行 `npm run setup` 即可

---

## 常见问题

### Q: 为什么需要手动登录？

A: 小红书有复杂的反爬机制，手动登录可以绕过验证码等问题。

### Q: Cookies 会过期吗？

A: 会。过期后重新运行 `npm run setup` 即可。

### Q: 可以多账号吗？

A: 可以。保存不同的 Cookies 到不同文件，加载时指定即可。

### Q: 会被封号吗？

A: 使用真实浏览器+真实用户登录，模拟人工操作，风险较低。

---

## 下一步

### 待验证需求

- [ ] 是否需要图片上传？
- [ ] 是否需要定时发布？
- [ ] 是否需要批量生成？
- [ ] 是否需要数据统计？

### 扩展方向

```
小红书
    ↓
多平台支持（Twitter、微博...）
    ↓
智能调度（最佳发布时间）
    ↓
数据分析（点赞、收藏、评论）
    ↓
A/B 测试（标题、封面、内容）
```

---

## License

MIT
