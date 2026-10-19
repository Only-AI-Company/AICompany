# LangFuse 本地安装指南（无 Docker）

## 方法 1：使用 pnpm/npm 直接运行（推荐）

### 1. 安装 LangFuse

```bash
# 在 v4 目录
npm install langfuse langfuse-core
```

### 2. 启动 LangFuse 服务器

LangFuse 提供 standalone 包可以直接运行：

```bash
npx langfuse@latest dev
```

或者全局安装：

```bash
npm install -g langfuse
langfuse dev
```

### 3. 配置环境变量

创建 `.env` 文件：

```bash
# .env
LANGFUSE_PUBLIC_KEY=pk-lf-local
LANGFUSE_SECRET_KEY=sk-lf-local
DATABASE_URL=postgresql://langfuse:password@localhost:5432/langfuse
NEXTAUTH_SECRET=your-secret-key
SALT=your-salt
```

### 4. 启动 PostgreSQL（如果还没有）

```bash
# 使用 Homebrew
brew install postgresql
brew services start postgresql

# 创建数据库
createdb langfuse
```

## 方法 2：使用 LangFuse CLI

```bash
# 安装 LangFuse CLI
npm install -g langfuse

# 启动开发服务器
langfuse dev --port 3001
```

## 方法 3：使用 npx 快速测试

```bash
# 直接运行，无需安装
npx @langfuse/standalone
```

这会自动：
- 下载 LangFuse
- 启动嵌入式 PostgreSQL
- 打开浏览器 http://localhost:3001

## 验证安装

访问 http://localhost:3001 查看 LangFuse Web UI

默认登录：
- 邮箱：admin@langfuse.com
- 密码：admin

## 在 DeepAgent 中使用

确保 `src/index.ts` 中设置了环境变量：

```typescript
process.env.LANGFUSE_URL = 'http://localhost:3001';
process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-local';
process.env.LANGFUSE_SECRET_KEY = 'sk-lf-local';
```

运行 DeepAgent：

```bash
npm run dev
```

在 WebUI 点击 "📊 View LangFuse Traces" 查看追踪。

## 常见问题

### 端口被占用

```bash
# 更改端口
langfuse dev --port 3002
```

然后更新 `LANGFUSE_URL=http://localhost:3002`

### 数据库连接失败

```bash
# 检查 PostgreSQL 是否运行
brew services list

# 重启 PostgreSQL
brew services restart postgresql
```

### 重置 LangFuse

```bash
# 删除所有数据
rm -rf ~/.langfuse
langfuse dev
```
