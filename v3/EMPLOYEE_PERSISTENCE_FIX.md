# AI Company v3 - 员工持久化修复

## 问题描述

之前默认员工在 `EmployeeFactory.createDefaultEmployees()` 中创建，但仅存在于内存中，未持久化到数据库。导致：
- `/api/employees` 返回空数组
- 系统重启后员工数据丢失
- UI 无法显示员工列表

## 解决方案

在 `Engine.ts` 的 `initializeComponents()` 方法中添加员工初始化逻辑：

### 1. 初始化默认员工

```typescript
private initializeDefaultEmployees(): void {
  if (!this.db) return;

  const existingEmployees = this.db.getAllEmployees();
  const existingIds = new Set(existingEmployees.map((e: any) => e.id));

  const defaultEmployees = [
    {
      id: 'emp_xiaohongshu',
      name: '小红书专员',
      role: '小红书运营',
      skills: ['小红书运营', '内容创作', '数据分析'],
      // ...
    },
    // ...
  ];

  // 只添加不存在的员工（防止重复）
  for (const empData of defaultEmployees) {
    if (!existingIds.has(empData.id)) {
      this.db.insertEmployee(empData);
    }
  }
}
```

### 2. 从数据库加载员工

```typescript
private loadEmployeesFromDatabase(): void {
  if (!this.db) return;

  const dbEmployees = this.db.getAllEmployees();

  this.employees = dbEmployees.map((dbEmp: any) => {
    return new EmployeeImpl({
      id: dbEmp.id,
      name: dbEmp.name,
      role: dbEmp.role,
      skills: typeof dbEmp.skills === 'string' ? JSON.parse(dbEmp.skills) : dbEmp.skills,
      level: dbEmp.level || 1,
      performance: dbEmp.performance || 50,
      satisfaction: dbEmp.satisfaction || 70,
      systemPrompt: dbEmp.system_prompt || dbEmp.systemPrompt,
      capabilities: typeof dbEmp.capabilities === 'string' ? JSON.parse(dbEmp.capabilities) : dbEmp.capabilities,
      createdAt: dbEmp.created_at || Date.now(),
    });
  });
}
```

## 修改的文件

### `src/core/Engine.ts`

1. 添加导入：`import { EmployeeFactory, EmployeeImpl } from './Employee.js';`

2. 修改 `initializeComponents()` 方法：
```typescript
private async initializeComponents(): Promise<void> {
  console.log('[Engine] Initializing components...');

  // 初始化数据库
  this.db = await getDatabase();

  // 将默认员工持久化到数据库（如果不存在）
  this.initializeDefaultEmployees();

  // 从数据库加载员工列表
  this.loadEmployeesFromDatabase();

  // 设置员工列表到 Scheduler
  this.scheduler.setEmployees(this.employees);

  // ...
}
```

3. 添加两个新方法：
   - `initializeDefaultEmployees()` - 初始化默认员工到数据库
   - `loadEmployeesFromDatabase()` - 从数据库加载员工列表

## 验证结果

### API 测试

```bash
# 获取员工列表
curl http://localhost:3000/api/employees | jq '.'
```

**响应**:
```json
{
  "employees": [
    {
      "id": "emp_xiaohongshu",
      "name": "小红书专员",
      "role": "小红书运营",
      "skills": ["小红书运营","内容创作","数据分析"],
      "level": 3,
      "performance": 70,
      "satisfaction": 80,
      ...
    },
    {
      "id": "emp_content",
      "name": "内容创作",
      ...
    },
    {
      "id": "emp_data",
      "name": "数据分析",
      ...
    }
  ]
}
```

### 日志输出

```
[Engine] Default employee created: 小红书专员
[Engine] Default employee created: 内容创作
[Engine] Default employee created: 数据分析
[Engine] Loaded 3 employees from database
[Engine] Employees: 3 available
```

## 特性

1. **幂等性**: 只在员工不存在时创建，避免重复插入
2. **自动加载**: 系统启动时自动从数据库加载员工
3. **数据持久化**: 员工数据存储在 SQLite 数据库
4. **向后兼容**: 支持已有的数据库记录

## 影响范围

- ✅ 员工 API 返回正确数据
- ✅ UI 可以显示员工列表
- ✅ 系统重启后员工数据保留
- ✅ 支持员工绩效和技能的持久化更新

## 下一步

1. ✅ 员工数据持久化 - 已完成
2. ⏳ 员工招募 UI - 待实现
3. ⏳ 员工培训 UI - 待实现
4. ⏳ 员工绩效管理 UI - 待实现
