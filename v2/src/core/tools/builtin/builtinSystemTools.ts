/**
 * AI Company v2 - 内置系统工具定义
 *
 * 参考 Claude Code 的工具设计模式，实现核心系统工具调用能力
 */

import type { Tool } from '../types.js';

// ============================================================================
// 系统工具
// ============================================================================

/**
 * Bash 工具 - 执行 shell 命令
 */
export const bashTool: Tool = {
  name: 'Bash',
  description: 'Run a shell command and capture its output. Use this tool to execute system commands, install packages, run scripts, and interact with the operating system.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
        required: true,
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the command',
      },
    },
    required: ['command'],
  },
  enabled: true,
  async handler(input: any, context: any): Promise<any> {
    const { execSync } = await import('child_process');
    try {
      const options: any = {};
      if (input.cwd) {
        options.cwd = input.cwd;
      }
      const output = execSync(input.command, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
        ...options,
      });
      return {
        success: true,
        data: { output: output.toString() },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: { output: error.stdout || '' },
      };
    }
  },
};

/**
 * Read 工具 - 读取文件内容
 */
export const readTool: Tool = {
  name: 'Read',
  description: 'Read the contents of a file. Use this tool to examine file contents, read configuration files, review code, or inspect text files.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the file to read',
        required: true,
      },
      offset: {
        type: 'number',
        description: 'Line offset to start reading from',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of lines to read',
      },
    },
    required: ['filePath'],
  },
  enabled: true,
  async handler(input: any, context: any): Promise<any> {
    const { readFile } = await import('fs/promises');
    try {
      let content = await readFile(input.filePath, 'utf-8');
      const lines = content.split('\n');

      const offset = input.offset || 0;
      const limit = input.limit || lines.length;

      const selectedLines = lines.slice(offset, offset + limit);
      content = selectedLines.join('\n');

      return {
        success: true,
        data: { content },
        message: `Read ${selectedLines.length} lines from ${input.filePath}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

/**
 * Write 工具 - 写入文件
 */
export const writeTool: Tool = {
  name: 'Write',
  description: 'Write content to a file. Use this tool to create new files, write code, save configurations, or generate text content.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the file to write',
        required: true,
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
        required: true,
      },
    },
    required: ['filePath', 'content'],
  },
  enabled: true,
  async handler(input: any, context: any): Promise<any> {
    const { writeFile } = await import('fs/promises');
    try {
      await writeFile(input.filePath, input.content, 'utf-8');
      return {
        success: true,
        message: `Successfully wrote to ${input.filePath}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

/**
 * Edit 工具 - 编辑文件（使用字符串替换）
 */
export const editTool: Tool = {
  name: 'Edit',
  description: 'Edit a file by replacing a specific string with new content. Use this tool to modify existing files, fix bugs, update configurations, or make targeted changes to code.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the file to edit',
        required: true,
      },
      oldString: {
        type: 'string',
        description: 'The exact string to replace',
        required: true,
      },
      newString: {
        type: 'string',
        description: 'The new content to replace it with',
        required: true,
      },
    },
    required: ['filePath', 'oldString', 'newString'],
  },
  enabled: true,
  async handler(input: any, context: any): Promise<any> {
    const { readFile, writeFile } = await import('fs/promises');
    try {
      let content = await readFile(input.filePath, 'utf-8');

      if (!content.includes(input.oldString)) {
        return {
          success: false,
          error: 'Old string not found in file',
        };
      }

      content = content.replace(input.oldString, input.newString);
      await writeFile(input.filePath, content, 'utf-8');

      return {
        success: true,
        message: `Successfully edited ${input.filePath}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

/**
 * Glob 工具 - 文件模式匹配
 */
export const globTool: Tool = {
  name: 'Glob',
  description: 'Find files matching a pattern. Use this tool to search for files by name pattern, locate specific file types, or discover files in a directory structure.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern (e.g., "**/*.ts")',
        required: true,
      },
      path: {
        type: 'string',
        description: 'Directory to search in (default: current directory)',
      },
    },
    required: ['pattern'],
  },
  enabled: true,
  async handler(input: any, context: any): Promise<any> {
    const { glob } = await import('glob');
    try {
      const options: any = {};
      if (input.path) {
        options.cwd = input.path;
      }

      const files = await glob(input.pattern, options);

      return {
        success: true,
        data: { files },
        message: `Found ${files.length} files matching pattern`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

/**
 * Grep 工具 - 搜索文件内容
 */
export const grepTool: Tool = {
  name: 'Grep',
  description: 'Search for text in files. Use this tool to find specific content, search for function/class definitions, locate usages of variables, or search codebases for patterns.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regular expression pattern to search for',
        required: true,
      },
      path: {
        type: 'string',
        description: 'Directory to search in',
      },
      glob: {
        type: 'string',
        description: 'File pattern to filter (e.g., "*.ts")',
      },
    },
    required: ['pattern'],
  },
  enabled: true,
  async handler(input: any, context: any): Promise<any> {
    const { glob } = await import('glob');
    const { readFile } = await import('fs/promises');
    try {
      const searchPattern = new RegExp(input.pattern, 'i');

      // Find matching files
      const filePattern = input.glob || '**/*';
      const options: any = {};
      if (input.path) {
        options.cwd = input.path;
      }

      const files = await glob(filePattern, options);
      const results: Array<{
        file: string;
        line: number;
        content: string;
      }> = [];

      for (const file of files) {
        try {
          const content = await readFile(file, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            if (searchPattern.test(lines[i])) {
              results.push({
                file,
                line: i + 1,
                content: lines[i].trim(),
              });
            }
          }
        } catch {
          // Skip unreadable files
        }
      }

      return {
        success: true,
        data: { results },
        message: `Found ${results.length} matches`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

/**
 * LS 工具 - 列出目录内容
 */
export const lsTool: Tool = {
  name: 'LS',
  description: 'List directory contents. Use this tool to explore directory structures, see what files exist in a folder, or understand project organization.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to list (default: current directory)',
      },
    },
  },
  enabled: true,
  async handler(input: any, context: any): Promise<any> {
    const { readdir } = await import('fs/promises');
    try {
      const targetPath = input.path || process.cwd();
      const entries = await readdir(targetPath, { withFileTypes: true });

      const items = entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
      }));

      return {
        success: true,
        data: { items, path: targetPath },
        message: `Listed ${items.length} items in ${targetPath}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

// ============================================================================
// 工具集合
// ============================================================================

export const systemTools: Tool[] = [
  bashTool,
  readTool,
  writeTool,
  editTool,
  globTool,
  grepTool,
  lsTool,
];

/**
 * 初始化系统工具到注册表
 */
export function initSystemTools(registry: any): void {
  console.log('[SystemTools] 注册系统工具...');

  for (const tool of systemTools) {
    registry.register(tool);
  }

  console.log(`[SystemTools] ✅ 已注册 ${systemTools.length} 个系统工具`);
}
