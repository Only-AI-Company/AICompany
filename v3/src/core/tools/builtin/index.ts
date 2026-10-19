/**
 * AI Company v3 - Built-in Tools
 *
 * 内置系统工具
 */

import type { Tool, ToolContext, ToolResult } from '../types.js';
import { execSync } from 'child_process';
import { readFile, writeFile, access } from 'fs/promises';
import { join, resolve, isAbsolute } from 'path';

// ============================================================================
// Bash Tool
// ============================================================================

export const BashTool: Tool = {
  name: 'bash',
  description: 'Execute shell commands in the terminal',
  category: 'system',

  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)',
        default: 30000,
      },
    },
    required: ['command'],
  },

  validate(params) {
    return typeof params.command === 'string' && params.command.length > 0;
  },

  async execute(params, context) {
    const { command, timeout = 30000 } = params;

    // 安全检查：命令注入检测
    if (isDangerousCommand(command)) {
      return {
        success: false,
        error: 'Dangerous command detected: command not allowed',
      };
    }

    try {
      const result = execSync(command, {
        timeout,
        encoding: 'utf8',
        cwd: context.workspace,
        env: { ...process.env, ...context.env },
      });

      return {
        success: true,
        output: result || 'Command executed successfully (no output)',
        metadata: { command, exitCode: 0 },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Command execution failed',
        metadata: { command, signal: error.signal },
      };
    }
  },
};

function isDangerousCommand(command: string): boolean {
  const dangerousPatterns = [
    'rm -rf /',
    'rm -rf *',
    'mkfs',
    'dd if=/dev/zero',
    ':(){:|:&};:',
    'chmod -R 000',
    'chown -R',
    '> /dev/',
    'curl.*|.*sh',
    'wget.*|.*sh',
  ];

  const lowerCommand = command.toLowerCase();

  for (const pattern of dangerousPatterns) {
    if (lowerCommand.includes(pattern)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// File Read Tool
// ============================================================================

export const FileReadTool: Tool = {
  name: 'file_read',
  description: 'Read the contents of a file',
  category: 'file',

  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The file path to read (relative to workspace or absolute)',
      },
      encoding: {
        type: 'string',
        description: 'File encoding (default: utf8)',
        default: 'utf8',
        enum: ['utf8', 'ascii', 'latin1'],
      },
    },
    required: ['path'],
  },

  validate(params) {
    return typeof params.path === 'string' && params.path.length > 0;
  },

  async execute(params, context) {
    const { path: filePath, encoding = 'utf8' } = params;

    try {
      // 安全检查：路径遍历检测
      const safePath = await getSafePath(filePath, context.workspace);
      if (!safePath) {
        return {
          success: false,
          error: 'Invalid file path: path traversal detected',
        };
      }

      // 检查文件是否存在
      await access(safePath);

      const content = await readFile(safePath, encoding as BufferEncoding);

      return {
        success: true,
        output: content,
        metadata: { path: safePath, size: content.length },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to read file',
      };
    }
  },
};

async function getSafePath(filePath: string, workspace?: string): Promise<string | null> {
  let resolvedPath: string;

  if (isAbsolute(filePath)) {
    resolvedPath = resolve(filePath);
  } else if (workspace) {
    resolvedPath = resolve(workspace, filePath);
  } else {
    resolvedPath = resolve(filePath);
  }

  // 路径遍历检测
  if (workspace) {
    const normalizedWorkspace = resolve(workspace);
    if (!resolvedPath.startsWith(normalizedWorkspace)) {
      return null;
    }
  }

  return resolvedPath;
}

// ============================================================================
// File Write Tool
// ============================================================================

export const FileWriteTool: Tool = {
  name: 'file_write',
  description: 'Write content to a file',
  category: 'file',

  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The file path to write (relative to workspace or absolute)',
      },
      content: {
        type: 'string',
        description: 'The content to write to the file',
      },
      append: {
        type: 'boolean',
        description: 'Append to file instead of overwriting (default: false)',
        default: false,
      },
    },
    required: ['path', 'content'],
  },

  validate(params) {
    return (
      typeof params.path === 'string' &&
      params.path.length > 0 &&
      typeof params.content === 'string'
    );
  },

  async execute(params, context) {
    const { path: filePath, content, append = false } = params;

    try {
      // 安全检查
      const safePath = await getSafePath(filePath, context.workspace);
      if (!safePath) {
        return {
          success: false,
          error: 'Invalid file path: path traversal detected',
        };
      }

      await writeFile(safePath, content, {
        encoding: 'utf8',
        flag: append ? 'a' : 'w',
      });

      return {
        success: true,
        output: `File written successfully: ${filePath}`,
        metadata: { path: safePath, bytesWritten: content.length },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to write file',
      };
    }
  },
};

// ============================================================================
// Search Tool (Grep)
// ============================================================================

export const SearchTool: Tool = {
  name: 'search',
  description: 'Search for text patterns in files (like grep)',
  category: 'search',

  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The text pattern to search for',
      },
      path: {
        type: 'string',
        description: 'Directory or file to search in (default: workspace)',
      },
      caseSensitive: {
        type: 'boolean',
        description: 'Case-sensitive search (default: false)',
        default: false,
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 50)',
        default: 50,
      },
    },
    required: ['pattern'],
  },

  validate(params) {
    return typeof params.pattern === 'string' && params.pattern.length > 0;
  },

  async execute(params, context) {
    const {
      pattern,
      path = context.workspace || '.',
      caseSensitive = false,
      maxResults = 50,
    } = params;

    try {
      // 使用 grep 命令搜索
      const grepFlags = caseSensitive ? '-rn' : '-rni';
      const command = `grep ${grepFlags} "${pattern}" "${path}" 2>/dev/null | head -n ${maxResults}`;

      const result = execSync(command, {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });

      if (!result.trim()) {
        return {
          success: true,
          output: `No matches found for pattern: "${pattern}"`,
          metadata: { pattern, searchPath: path, matches: 0 },
        };
      }

      const lines = result.trim().split('\n');

      return {
        success: true,
        output: lines.join('\n'),
        metadata: {
          pattern,
          searchPath: path,
          matches: lines.length,
          caseSensitive,
        },
      };
    } catch (error: any) {
      if (error.status === 1) {
        // grep 返回 1 表示没有找到匹配，不是错误
        return {
          success: true,
          output: `No matches found for pattern: "${pattern}"`,
          metadata: { pattern, searchPath: path, matches: 0 },
        };
      }

      return {
        success: false,
        error: error.message || 'Search failed',
      };
    }
  },
};

// ============================================================================
// Glob Tool (File Pattern Search)
// ============================================================================

export const GlobTool: Tool = {
  name: 'glob',
  description: 'Find files matching a pattern (like glob)',
  category: 'search',

  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'File pattern to match (e.g., "*.ts", "**/*.json")',
      },
      path: {
        type: 'string',
        description: 'Directory to search in (default: workspace)',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results (default: 100)',
        default: 100,
      },
    },
    required: ['pattern'],
  },

  validate(params) {
    return typeof params.pattern === 'string' && params.pattern.length > 0;
  },

  async execute(params, context) {
    const { pattern, path = context.workspace || '.', maxResults = 100 } = params;

    try {
      // 使用 find 命令
      const command = `find "${path}" -name "${pattern}" -type f 2>/dev/null | head -n ${maxResults}`;

      const result = execSync(command, {
        encoding: 'utf8',
      });

      if (!result.trim()) {
        return {
          success: true,
          output: `No files found matching pattern: "${pattern}"`,
          metadata: { pattern, searchPath: path, matches: 0 },
        };
      }

      const files = result.trim().split('\n');

      return {
        success: true,
        output: files.join('\n'),
        metadata: {
          pattern,
          searchPath: path,
          matches: files.length,
          files,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Glob search failed',
      };
    }
  },
};

// ============================================================================
// Tool Exports
// ============================================================================

export const builtinTools: Tool[] = [
  BashTool,
  FileReadTool,
  FileWriteTool,
  SearchTool,
  GlobTool,
];

export const registerBuiltinTools = (registry: import('../ToolRegistry.js').ToolRegistry): void => {
  for (const tool of builtinTools) {
    registry.register(tool);
  }
};
