# 快速开始指南

## 5 分钟上手

### 1. 安装依赖

```bash
cd ai-company/experiments/xiaohongshu

npm install

# 安装 Playwright 浏览器
npx playwright install chromium
```

### 2. 配置 API Key

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入你的 Anthropic API Key
# ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### 3. 首次登录

```bash
npm run setup
```

浏览器会自动打开小红书，你手动登录后程序会自动保存 Cookies。

### 4. 自动发布

```bash
npm run publish "春季穿搭搭配"
```

程序会自动：
1. AI 生成小红书文案
2. 保存到数据库
3. 自动发布到小红书

---

## 常用命令

```bash
# 首次登录
npm run setup

# 自动发布
npm run publish "主题内容"

# 只生成不发布
npm run publish "主题内容" --only-generate

# 查看历史记录
npm run history
npm run history --limit 20
```

---

## 目录结构

```
xiaohongshu/
├── config/              # 配置
│   └── prompts.ts       # AI 提示词
├── core/                # 核心逻辑
│   ├── BrowserSession.ts      # 浏览器会话
│   ├── ContentGenerator.ts    # AI 生成
│   ├── PostRepository.ts      # 数据存储
│   ├── Workflow.ts            # 工作流
│   └── XiaohongshuBot.ts      # 自动发布
├── scripts/             # 命令脚本
│   ├── setup.ts         # 登录设置
│   ├── publish.ts       # 发布命令
│   └── history.ts       # 历史记录
└── storage/             # 运行时数据
    ├── database.db      # SQLite 数据库
    ├── cookies.json     # 登录会话
    └── logs/            # 错误截图
```

---

## 故障排除

### 问题：未找到保存的登录信息

**解决方法：**
```bash
npm run setup
```

### 问题：会话已过期

**解决方法：**
重新运行 `npm run setup` 登录一次

### 问题：Playwright 浏览器未安装

**解决方法：**
```bash
npx playwright install chromium
```

### 问题：发布失败

**检查步骤：**
1. 查看 storage/logs/ 目录下的错误截图
2. 确认小红书页面是否有变化（改版）
3. 尝试重新登录：`npm run setup`

---

## 下一步

- [ ] 添加图片上传功能
- [ ] 支持定时发布
- [ ] 批量生成内容
- [ ] 数据统计分析
- [ ] 多账号支持
