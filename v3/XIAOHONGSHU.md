# AI Company v3 - 小红书自动化

## 功能

AI Company v3 已集成小红书内容生成和发布功能：

1. **AI 内容生成** - 自动生成小红书风格文案
2. **浏览器自动化** - 使用 Playwright 自动发布
3. **会话管理** - 保存 Cookies，避免重复登录
4. **CLI 命令** - 命令行快速操作

---

## 快速开始

### 1. 安装依赖

```bash
cd /Users/devin/code/ai-company/v3

# 依赖已在 package.json 中
npm install

# 安装 Playwright 浏览器
npx playwright install chromium
```

### 2. 登录小红书（首次）

```bash
# 启动登录流程（会打开浏览器）
npm run cli -- xiaohongshu login
```

登录完成后，Cookies 会自动保存到 `storage/xiaohongshu-cookies.json`。

### 3. 检查登录状态

```bash
npm run cli -- xiaohongshu check-login
```

### 4. 生成内容

```bash
# 生成小红书内容
npm run cli -- xiaohongshu generate "春季穿搭搭配"

# 指定内容类型和语气
npm run cli -- xiaohongshu generate "春季穿搭" --type 种草 --tone 亲切

# 添加关键词
npm run cli -- xiaohongshu generate "护肤心得" --keywords "保湿，抗老，敏感肌"

# 批量生成多个版本
npm run cli -- xiaohongshu generate "春季穿搭" 3
```

### 5. 发布笔记

```bash
# 生成并发布
npm run cli -- xiaohongshu publish "春季穿搭搭配"

# 指定参数
npm run cli -- xiaohongshu publish "护肤心得" \
  --type 测评 \
  --tone 专业 \
  --keywords "保湿，抗老"
```

---

## CLI 命令

### xiaohongshu login

登录小红书，保存会话。

```bash
npm run cli -- xiaohongshu login
npm run cli -- xiaohongshu login --cookies custom-cookies.json
```

### xiaohongshu check-login

检查登录状态。

```bash
npm run cli -- xiaohongshu check-login
```

### xiaohongshu generate <topic>

生成小红书内容。

```bash
npm run cli -- xiaohongshu generate "春季穿搭"

# 选项
-t, --type <type>       # 内容类型：分享，教程，种草，测评，日常
-T, --tone <tone>       # 语气风格：亲切，专业，幽默，干货
-k, --keywords <words>  # 关键词（逗号分隔）
```

### xiaohongshu publish <topic>

生成并发布小红书笔记。

```bash
npm run cli -- xiaohongshu publish "春季穿搭"

# 选项
-t, --type <type>       # 内容类型
-T, --tone <tone>       # 语气风格
-k, --keywords <words>  # 关键词
-c, --cookies <path>    # Cookies 路径
--headless              # 无头模式（不显示浏览器）
```

### xiaohongshu batch <topic> <count>

批量生成多个版本。

```bash
npm run cli -- xiaohongshu batch "春季穿搭" 5
```

---

## 在 UI 中使用

通过前端 UI 也可以调用小红书功能：

1. 访问 http://localhost:5173
2. 进入 /chat 页面
3. 输入："帮我写一篇关于春季穿搭的小红书笔记"
4. AI 会自动调用小红书工具生成内容

---

## 内容生成示例

### 输入
```
topic: "春季穿搭搭配"
type: "分享"
tone: "亲切"
keywords: ["春季", "穿搭", "搭配"]
```

### 输出
```
标题：春季穿搭｜超实用！

内容：
👋 宝子们！

今天来聊聊春季穿搭搭配

✨ 第一点：认真对待
这件事真的很重要，大家不要忽视

💡 第二点：找对方法
方法比努力更重要，要聪明地工作

🌟 第三点：持续学习
保持好奇心，每天进步一点点

希望这些分享对大家有帮助！

💬 你们有什么看法？欢迎在评论区交流～

记得点赞收藏哦～ #春季穿搭搭配 #经验分享 #干货
```

---

## 工具集成

小红书工具已集成到 AI Company v3 的工具系统中：

- `xiaohongshu_generate` - AI 生成内容
- `xiaohongshu_publish` - 发布笔记
- `xiaohongshu_login` - 登录设置
- `xiaohongshu_check_login` - 检查登录状态

员工（Agent）可以自动调用这些工具来完成小红书相关任务。

---

## 安全说明

1. **Cookies 安全**
   - Cookies 保存在本地 `storage/` 目录
   - 不要分享你的 cookies 文件
   - 定期刷新登录

2. **浏览器隔离**
   - 使用独立的 Chromium 浏览器
   - 不影响你的日常浏览器

3. **发布频率**
   - 建议控制发布频率
   - 避免短时间内大量发布

---

## 故障排除

### Cookies 过期

```bash
# 重新登录
npm run cli -- xiaohongshu login
```

### 发布失败

1. 检查登录状态
2. 确保使用真实浏览器
3. 查看错误日志

### 内容生成质量不佳

```bash
# 尝试批量生成，选择最好的
npm run cli -- xiaohongshu batch "主题" 5

# 指定语气风格
npm run cli -- xiaohongshu generate "主题" --tone 干货
```

---

## 下一步

### 待实现功能

- [ ] 图片自动生成和上传
- [ ] 定时发布
- [ ] 数据分析和统计
- [ ] 多账号管理
- [ ] 爆款内容分析

---

## API 使用（代码级别）

```typescript
import { getXiaohongshuContentGenerator } from './src/core/tools/xiaohongshu/XiaohongshuContentGenerator.js';
import { XiaohongshuPublisher } from './src/core/tools/xiaohongshu/XiaohongshuPublisher.js';

// 生成内容
const generator = getXiaohongshuContentGenerator();
const content = await generator.generate({
  topic: '春季穿搭',
  contentType: '分享',
  tone: '亲切',
});

// 发布
const publisher = new XiaohongshuPublisher();
await publisher.init();
await publisher.publish({
  title: content.title,
  content: content.content,
  tags: content.tags,
});
```
