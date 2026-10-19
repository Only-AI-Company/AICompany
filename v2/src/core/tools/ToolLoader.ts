/**
 * AI Company v2 - Tool Loader
 *
 * 自动发现和加载工具，无需手动注册
 *
 * 工作原理：
 * 1. 扫描 builtin/ 目录下所有 .ts 文件
 * 2. 动态导入每个文件
 * 3. 查找并调用 init* 函数
 * 4. 自动注册所有工具
 */

import { glob } from 'glob';
import { pathToFileURL } from 'url';
import type { ToolRegistry } from './ToolRegistry.js';

/**
 * 工具初始化函数类型
 */
type ToolInitFunction = (registry: ToolRegistry | ((tool: any) => void)) => void;

/**
 * 自动发现并加载所有工具
 */
export async function loadToolsAutomatically(registry: ToolRegistry): Promise<void> {
  const builtinDir = new URL('./builtin/', import.meta.url).pathname;

  console.log('[ToolLoader] 🔍 扫描工具目录:', builtinDir);

  // 查找所有 .js 文件（编译后）或 .ts 文件（开发时）
  const jsPattern = `${builtinDir}*.js`;
  const files = await glob(jsPattern, {
    absolute: true,
    ignore: ['**/index.js', '**/*.d.js', '**/types.js', '**/*.d.ts']
  });

  console.log(`[ToolLoader] 📁 发现 ${files.length} 个工具文件`);

  let loadedCount = 0;
  const errors: string[] = [];

  for (const file of files) {
    const fileName = file.split('/').pop()!;

    try {
      // 动态导入文件
      const fileUrl = pathToFileURL(file).href;
      const module = await import(fileUrl);

      // 查找 init* 函数
      const initFunctions = Object.keys(module)
        .filter(key => key.startsWith('init') && typeof module[key] === 'function')
        .map(key => module[key] as ToolInitFunction);

      if (initFunctions.length > 0) {
        // 调用所有初始化函数
        for (const initFn of initFunctions) {
          initFn(registry);
          loadedCount++;
        }
        console.log(`[ToolLoader] ✅ ${fileName} - ${initFunctions.length} 个初始化函数`);
      } else {
        console.log(`[ToolLoader] ⚠️  ${fileName} - 没有找到 init* 函数`);
      }
    } catch (error: any) {
      const errorMsg = `${fileName}: ${error.message}`;
      errors.push(errorMsg);
      console.error(`[ToolLoader] ❌ ${fileName} - ${error.message}`);
    }
  }

  console.log(`[ToolLoader] 🎉 完成: ${loadedCount} 个初始化函数已调用`);

  if (errors.length > 0) {
    console.warn(`[ToolLoader] ⚠️  ${errors.length} 个错误:`, errors);
  }

  // 打印统计
  const stats = registry.getStats();
  console.log(`[ToolLoader] 📊 工具统计: ${stats.enabledTools}/${stats.totalTools} 个工具已启用`);
}

/**
 * 热重载工具（开发时使用）
 * 当工具文件变化时重新加载
 */
export async function reloadTools(registry: ToolRegistry): Promise<void> {
  console.log('[ToolLoader] 🔄 热重载工具...');

  // 清空现有工具（可选，根据需求）
  // registry.clear();

  await loadToolsAutomatically(registry);
}
