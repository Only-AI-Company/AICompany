/**
 * AI Company Gateway - Utilities
 *
 * 通用工具函数
 */

import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Paths } from '../../infrastructure/config/Paths.js';

/**
 * 准备工作目录
 *
 * 创建任务工作目录结构：
 * - work_dir/              # 任务根目录
 *   - scripts/             # 脚本目录
 *   - outputs/             # 产出目录
 *   - logs/                # 日志目录
 *   - CLAUDE.md            # Agent 上下文（员工手册）
 */
export function prepareWorkDir(workDir: string, context?: {
  taskId?: string;
  description?: string;
  planFilePath?: string;
}): string {
  // 创建目录结构
  const scriptsDir = join(workDir, 'scripts');
  const outputsDir = join(workDir, 'outputs');
  const logsDir = join(workDir, 'logs');

  for (const dir of [workDir, scriptsDir, outputsDir, logsDir]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  // 创建 CLAUDE.md（Agent 上下文）
  const claudeMdPath = join(workDir, 'CLAUDE.md');
  if (!existsSync(claudeMdPath)) {
    const claudeMdContent = generateClaudeMd(context);
    writeFileSync(claudeMdPath, claudeMdContent, { mode: 0o644 });
  }

  return workDir;
}

/**
 * 生成 CLAUDE.md 内容（Agent 上下文）
 */
function generateClaudeMd(context?: {
  taskId?: string;
  description?: string;
  planFilePath?: string;
}): string {
  const lines: string[] = [
    '# AI Company - Agent 工作环境',
    '',
    '## 任务信息',
  ];

  if (context?.taskId) {
    lines.push(`**任务 ID**: ${context.taskId}`);
  }

  if (context?.description) {
    lines.push(`**描述**: ${context.description}`);
  }

  if (context?.planFilePath) {
    lines.push(`**方案文件**: ${context.planFilePath}`);
  }

  lines.push('');
  lines.push('## 目录结构');
  lines.push('- `scripts/` - 存放脚本文件');
  lines.push('- `outputs/` - 存放产出文件');
  lines.push('- `logs/` - 存放日志文件');
  lines.push('');
  lines.push('## 员工守则');
  lines.push('1. 直接完成需求，不做多余的管理层讨论');
  lines.push('2. 优先修改已有文件，除非确实需要新文件');
  lines.push('3. 产出放在 `outputs/`，脚本放在 `scripts/`，日志放在 `logs/`');
  lines.push('4. 遇到不确定的细节，做合理假设并继续推进');
  lines.push('5. 交付时说明完成情况与验证方式');
  lines.push('');
  lines.push('## 工作规范');
  lines.push('1. 所有脚本放在 `scripts/` 目录');
  lines.push('2. 所有产出放在 `outputs/` 目录');
  lines.push('3. 脚本必须可执行 (`chmod +x`)');
  lines.push('4. 重要操作前先备份');
  lines.push('');
  lines.push('## 完成标准');
  lines.push('- 脚本已测试并可执行');
  lines.push('- 产出文件已生成');
  lines.push('- 日志已记录');

  return lines.join('\n');
}

/**
 * 格式化路径用于显示
 */
export function formatPath(path: string, paths?: Paths): string {
  if (paths) {
    return paths.formatForDisplay(path);
  }
  return path;
}
