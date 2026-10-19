# Node.js CLI 项目

一个简单的 Node.js 命令行工具项目。

## 功能特性

- ✅ 简单易用的命令行工具
- ✅ 打印欢迎信息
- ✅ 显示当前时间

## 安装

```bash
npm install
```

## 使用方法

### 直接运行

```bash
node index.js
```

### 添加到 PATH（推荐）

1. 给文件添加执行权限：
```bash
chmod +x index.js
```

2. 创建全局链接：
```bash
npm link
```

3. 现在可以直接运行：
```bash
index.js
```

## 项目结构

```
.
├── index.js      # 主程序文件
├── package.json  # 项目配置文件
└── README.md     # 项目说明文档
```

## 开发

### 主程序文件 (index.js)

主程序使用 Shebang (`#!/usr/bin/env node`) 声明，可以直接作为脚本执行。

主要功能：
- 打印欢迎信息
- 显示当前系统时间
- 提供友好的用户界面

### 依赖项

此项目无需额外依赖，使用原生 Node.js 运行时。

## 扩展

你可以基于此项目扩展更多功能：

- 添加命令行参数解析（使用 `commander` 或 `yargs`）
- 集成配置文件（使用 `dotenv`）
- 添加用户交互（使用 `inquirer`）
- 集成 API 调用
- 添加单元测试

## 许可证

ISC

## 作者

Your Name

---

Happy Coding! 🚀
