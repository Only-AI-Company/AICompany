/**
 * AI Company v2 - File Operation Tools
 *
 * 文件操作工具：mkdir, rm, cp, mv, chmod
 */

import type { Tool, ToolContext, ToolResult } from '../types.js';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

// ============================================================================
// Mkdir 工具 - 创建目录
// ============================================================================

export const mkdirTool: Tool = {
  name: 'Mkdir',
  description: 'Create directories recursively (like mkdir -p)',
  category: 'file',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to create',
        required: true,
      },
      recursive: {
        type: 'boolean',
        description: 'Create parent directories if needed (default: true)',
        required: false,
      },
    },
    required: ['path'],
  },
  enabled: true,
  async handler(input: any, context: ToolContext): Promise<ToolResult> {
    const { path: dirPath, recursive = true } = input;

    try {
      await fs.mkdir(dirPath, { recursive });
      return {
        success: true,
        data: {
          message: `Directory created: ${dirPath}`,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create directory',
      };
    }
  },
};

// ============================================================================
// Rm 工具 - 删除文件或目录
// ============================================================================

export const rmTool: Tool = {
  name: 'Rm',
  description: 'Remove files or directories (like rm -rf)',
  category: 'file',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File or directory path to remove',
        required: true,
      },
      recursive: {
        type: 'boolean',
        description: 'Remove directories recursively (default: true for directories)',
        required: false,
      },
      force: {
        type: 'boolean',
        description: 'Force removal (default: true)',
        required: false,
      },
    },
    required: ['path'],
  },
  enabled: true,
  async handler(input: any, context: ToolContext): Promise<ToolResult> {
    const { path: targetPath, recursive = true, force = true } = input;

    try {
      const stat = await fs.stat(targetPath).catch(() => null);

      if (!stat) {
        return {
          success: true,
          data: {
            message: `Path does not exist: ${targetPath}`,
          },
        };
      }

      if (stat.isDirectory()) {
        await fs.rm(targetPath, { recursive, force });
      } else {
        await fs.unlink(targetPath);
      }

      return {
        success: true,
        data: {
          message: `Removed: ${targetPath}`,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to remove',
      };
    }
  },
};

// ============================================================================
// Cp 工具 - 复制文件或目录
// ============================================================================

export const cpTool: Tool = {
  name: 'Cp',
  description: 'Copy files or directories',
  category: 'file',
  parameters: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Source file or directory path',
        required: true,
      },
      destination: {
        type: 'string',
        description: 'Destination path',
        required: true,
      },
      recursive: {
        type: 'boolean',
        description: 'Copy directories recursively (default: true)',
        required: false,
      },
    },
    required: ['source', 'destination'],
  },
  enabled: true,
  async handler(input: any, context: ToolContext): Promise<ToolResult> {
    const { source, destination, recursive = true } = input;

    try {
      const stat = await fs.stat(source).catch(() => null);

      if (!stat) {
        return {
          success: false,
          error: `Source does not exist: ${source}`,
        };
      }

      if (stat.isDirectory()) {
        await fs.cp(source, destination, { recursive });
      } else {
        await fs.copyFile(source, destination);
      }

      return {
        success: true,
        data: {
          message: `Copied ${source} to ${destination}`,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to copy',
      };
    }
  },
};

// ============================================================================
// Mv 工具 - 移动/重命名文件或目录
// ============================================================================

export const mvTool: Tool = {
  name: 'Mv',
  description: 'Move or rename files or directories',
  category: 'file',
  parameters: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Source file or directory path',
        required: true,
      },
      destination: {
        type: 'string',
        description: 'Destination path',
        required: true,
      },
    },
    required: ['source', 'destination'],
  },
  enabled: true,
  async handler(input: any, context: ToolContext): Promise<ToolResult> {
    const { source, destination } = input;

    try {
      await fs.rename(source, destination);

      return {
        success: true,
        data: {
          message: `Moved ${source} to ${destination}`,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to move',
      };
    }
  },
};

// ============================================================================
// Chmod 工具 - 修改文件权限
// ============================================================================

export const chmodTool: Tool = {
  name: 'Chmod',
  description: 'Change file permissions (like chmod)',
  category: 'file',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File or directory path',
        required: true,
      },
      mode: {
        type: 'string',
        description: 'Permission mode (e.g., "755", "644", "+x")',
        required: true,
      },
      recursive: {
        type: 'boolean',
        description: 'Change permissions recursively (default: false)',
        required: false,
      },
    },
    required: ['path', 'mode'],
  },
  enabled: true,
  async handler(input: any, context: ToolContext): Promise<ToolResult> {
    const { path: targetPath, mode, recursive = false } = input;

    try {
      // 解析模式
      let modeNum: number;
      if (mode.startsWith('0') || /^\d{3,4}$/.test(mode)) {
        modeNum = parseInt(mode, 8);
      } else {
        // 简单模式：+x, +r 等
        return {
          success: false,
          error: 'Symbolic modes not yet supported, use numeric (e.g., "755")',
        };
      }

      // Helper function for recursive chmod
      const chmodRecursive = async (targetPath: string, modeNum: number): Promise<void> => {
        const stat = await fs.stat(targetPath);
        await fs.chmod(targetPath, modeNum);

        if (stat.isDirectory() && recursive) {
          const items = await fs.readdir(targetPath, { withFileTypes: true });
          for (const item of items) {
            const itemPath = path.join(targetPath, item.name);
            await chmodRecursive(itemPath, modeNum);
          }
        }
      };

      await chmodRecursive(targetPath, modeNum);

      return {
        success: true,
        data: {
          message: `Permissions changed: ${targetPath} -> ${mode}`,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to change permissions',
      };
    }
  },
};

// ============================================================================
// 导出
// ============================================================================

export function initFileTools(registry: any): void {
  registry.register(mkdirTool);
  registry.register(rmTool);
  registry.register(cpTool);
  registry.register(mvTool);
  registry.register(chmodTool);
  console.log('[FileTools] 已注册文件操作工具');
}
