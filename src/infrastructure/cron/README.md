# Cron 管理器

## 概述

Cron 管理器用于管理本地脚本的定时执行，支持类似 cron 的调度规则。

## 功能特性

- ✅ 灵活的 cron 表达式支持 (分 时 日 月 周)
- ✅ 命令参数传递 (键值对格式)
- ✅ 环境变量设置
- ✅ 工作目录指定
- ✅ 执行超时控制
- ✅ 执行历史记录
- ✅ 启用/禁用任务
- ✅ 手动触发执行
- ✅ 守护进程模式

## 数据库表结构

### crontab 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 主键 |
| name | TEXT | 任务名称 (唯一) |
| description | TEXT | 描述 |
| command | TEXT | 命令/脚本路径 |
| args_json | TEXT | 参数 (JSON) |
| cron_rule | TEXT | cron 表达式 |
| enabled | BOOLEAN | 是否启用 |
| next_run | INTEGER | 下次运行时间戳 |
| last_run | INTEGER | 上次运行时间戳 |
| run_count | INTEGER | 累计运行次数 |
| fail_count | INTEGER | 失败次数 |
| last_output | TEXT | 上次输出 |
| last_error | TEXT | 上次错误 |
| timeout | INTEGER | 超时时间(秒) |
| working_dir | TEXT | 工作目录 |
| env_json | TEXT | 环境变量 (JSON) |
| created_at | INTEGER | 创建时间 |
| updated_at | INTEGER | 更新时间 |

### cron_executions 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 主键 |
| cron_id | TEXT | 关联的 cron 任务 ID |
| started_at | INTEGER | 开始时间 |
| completed_at | INTEGER | 完成时间 |
| exit_code | INTEGER | 退出码 |
| signal | INTEGER | 信号 |
| output | TEXT | 标准输出 |
| error | TEXT | 标准错误 |
| timeout | BOOLEAN | 是否超时 |

## CLI 命令

### 添加任务

```bash
# 基本用法
ai-company cron:add <名称> <命令> <cron规则>

# 示例：每天 9 点执行脚本
ai-company cron:add "每日备份" "./scripts/backup.sh" "0 9 * * *"

# 带参数
ai-company cron:add "数据同步" "npm run sync" "0 */2 * * *" \
  --arg "source=production" \
  --arg "target=backup" \
  --arg "verbose=true"

# 带环境变量和超时
ai-company cron:add "清理任务" "./scripts/cleanup.sh" "0 3 * * *" \
  --env "NODE_ENV=production" \
  --env "API_KEY=xxx" \
  --timeout 600 \
  --working-dir "/app"
```

### 列出任务

```bash
# 只列出启用的任务
ai-company cron:list

# 列出所有任务（包括禁用的）
ai-company cron:list --all
```

### 查看任务详情

```bash
# 通过名称或 ID 查看
ai-company cron:show "每日备份"
```

### 查看执行历史

```bash
# 查看最近 20 条记录
ai-company cron:history "每日备份"

# 查看最近 50 条记录
ai-company cron:history "每日备份" --limit 50
```

### 启用/禁用任务

```bash
ai-company cron:enable "每日备份"
ai-company cron:disable "每日备份"
```

### 删除任务

```bash
# 交互式确认
ai-company cron:delete "每日备份"

# 强制删除（不提示）
ai-company cron:delete "每日备份" --force
```

### 手动运行任务

```bash
ai-company cron:run "每日备份"
```

### 启动守护进程

```bash
# 使用默认配置（10秒扫描间隔，最多3个并发）
ai-company cron:start

# 自定义配置
ai-company cron:start --interval 30000 --concurrent 5
```

### 验证 cron 表达式

```bash
ai-company cron:validate "0 9 * * *"
ai-company cron:validate "*/5 * * * *"
```

## Cron 表达式格式

```
┌───────────── 分钟 (0 - 59)
│ ┌─────────── 小时 (0 - 23)
│ │ ┌───────── 日期 (1 - 31)
│ │ │ ┌─────── 月份 (1 - 12)
│ │ │ │ ┌───── 星期 (0 - 6，0 = 周日)
│ │ │ │ │
* * * * *
```

### 示例

| 表达式 | 说明 |
|--------|------|
| `0 9 * * *` | 每天 9:00 |
| `0 */2 * * *` | 每 2 小时 |
| `*/30 * * * *` | 每 30 分钟 |
| `0 9 * * 1-5` | 周一到周五 9:00 |
| `0 0 1 * *` | 每月 1 号 00:00 |
| `0 9,18 * * *` | 每天 9:00 和 18:00 |
| `0 9 * * 1,3,5` | 周一、周三、周五 9:00 |
| `*/15 9-17 * * *` | 每天 9:00-17:00，每15分钟 |

## 使用示例

### 1. 创建一个定时备份任务

```bash
ai-company cron:add \
  "数据库备份" \
  "./scripts/backup.sh" \
  "0 2 * * *" \
  --arg "database=production" \
  --arg "backup-dir=/backups"
```

### 2. 创建一个数据同步任务

```bash
ai-company cron:add \
  "数据同步" \
  "npm run sync" \
  "*/30 * * * *" \
  --env "API_KEY=xxx" \
  --timeout 120
```

### 3. 创建一个日志清理任务

```bash
ai-company cron:add \
  "日志清理" \
  "./scripts/clean-logs.sh" \
  "0 3 * * 0" \
  --arg "retention=30" \
  --arg "path=/var/logs"
```

### 4. 启动守护进程

```bash
ai-company cron:start
```

守护进程会：
- 每 10 秒扫描一次到期任务
- 并发执行（最多 3 个同时运行）
- 记录每次执行的输出和错误
- 自动计算下次运行时间

## 测试

项目包含一个示例脚本用于测试：

```bash
# 添加测试任务（每分钟执行一次）
ai-company cron:add \
  "测试任务" \
  "./scripts/example-cron-task.sh" \
  "* * * * *"

# 手动运行测试
ai-company cron:run "测试任务"

# 启动守护进程观察自动执行
ai-company cron:start

# 查看执行历史
ai-company cron:history "测试任务"
```

## 架构

```
src/infrastructure/cron/
├── types.ts           # 类型定义
├── utils.ts           # cron 表达式解析工具
├── CronRepository.ts  # 数据访问层
├── CronManager.ts     # 核心管理器
└── index.ts           # 导出

src/interfaces/cli/commands/
└── cronCommands.ts    # CLI 命令
```

## 注意事项

1. **命令路径**：使用绝对路径或相对于项目根目录的路径
2. **执行权限**：确保脚本有执行权限 (`chmod +x script.sh`)
3. **超时设置**：默认 300 秒，长任务需要增加超时时间
4. **并发限制**：默认最多 3 个任务同时运行，可根据需要调整
5. **环境变量**：继承父进程环境，可通过 `--env` 覆盖或添加
