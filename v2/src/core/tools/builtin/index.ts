/**
 * AI Company v2 - Built-in Tools
 *
 * 自动发现并加载所有工具
 *
 * 工具分类：
 * - 查询类：goal, task, employee, cron, chat, query, system
 * - 执行类：network, test, file, browser, builtin
 *
 * 添加新工具：
 * 1. 在 builtin/ 目录下创建新文件
 * 2. 导出 init* 函数，如 initMyNewTools(registry)
 * 3. 自动被发现和加载
 */

export { getToolRegistry, resetToolRegistry } from '../ToolRegistry.js';
export { loadToolsAutomatically, reloadTools } from '../ToolLoader.js';

import { loadToolsAutomatically } from '../ToolLoader.js';
import type { ToolRegistry } from '../ToolRegistry.js';

/**
 * 初始化所有内置工具（自动发现模式）
 *
 * 新增工具无需修改此文件，只需：
 * 1. 在 builtin/ 目录创建新文件
 * 2. 导出 init* 函数
 */
export async function initAllBuiltInTools(registry: ToolRegistry): Promise<void> {
  console.log('[Tools] 🚀 开始自动加载内置工具...');
  await loadToolsAutomatically(registry);
}

/**
 * 兼容性：同步版本（用于现有代码）
 * @deprecated 使用 initAllBuiltInTools (async) 代替
 */
export function initAllBuiltInToolsSync(registry: ToolRegistry): void {
  console.log('[Tools] 🚀 开始自动加载内置工具（同步）...');
  loadToolsAutomatically(registry).catch((error: Error) => {
    console.error('[Tools] ❌ 工具加载失败:', error);
  });
}
