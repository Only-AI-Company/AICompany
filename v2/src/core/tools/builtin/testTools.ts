/**
 * AI Company v2 - Test Tools
 *
 * 测试相关工具：运行测试、生成测试报告
 */

import type { Tool, ToolContext, ToolResult } from '../types.js';

// ============================================================================
// Test 工具 - 运行测试命令
// ============================================================================

export const testTool: Tool = {
  name: 'Test',
  description: 'Run test commands (npm test, pytest, etc.) and capture output',
  category: 'test',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Test command to run (e.g., "npm test", "pytest", "go test")',
        required: true,
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the command',
        required: false,
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 60000)',
        required: false,
      },
    },
    required: ['command'],
  },
  enabled: true,
  async handler(input: any, context: ToolContext): Promise<ToolResult> {
    const { execSync } = await import('child_process');
    const { command, cwd, timeout = 60000 } = input;

    try {
      const options: any = {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024, // 50MB
        timeout,
      };

      if (cwd) {
        options.cwd = cwd;
      }

      const output = execSync(command, options);
      const outputStr = output.toString();

      // 解析测试结果
      const summary = parseTestOutput(outputStr);

      return {
        success: true,
        data: {
          output: outputStr,
          summary,
        },
      };
    } catch (error: any) {
      // 测试失败也是一种结果
      const outputStr = error.stdout?.toString() || error.stderr?.toString() || error.message;
      const summary = parseTestOutput(outputStr);

      return {
        success: error.status === 0,  // 0 表示测试通过
        data: {
          output: outputStr,
          summary,
          error: error.message,
        },
        error: error.message,
      };
    }
  },
};

// ============================================================================
// NPM Test 工具 - 专门用于 npm test
// ============================================================================

export const npmTestTool: Tool = {
  name: 'NPMTest',
  description: 'Run npm test with optional arguments',
  category: 'test',
  parameters: {
    type: 'object',
    properties: {
      args: {
        type: 'string',
        description: 'Additional arguments to pass to npm test',
        required: false,
      },
      cwd: {
        type: 'string',
        description: 'Working directory (default: current directory)',
        required: false,
      },
    },
    required: [],
  },
  enabled: true,
  async handler(input: any, context: ToolContext): Promise<ToolResult> {
    const { execSync } = await import('child_process');
    const { args = '', cwd } = input;

    try {
      const command = `npm test ${args}`;
      const options: any = {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 120000, // 2 minutes
      };

      if (cwd) {
        options.cwd = cwd;
      }

      const output = execSync(command, options);
      const outputStr = output.toString();

      return {
        success: true,
        data: {
          output: outputStr,
        },
      };
    } catch (error: any) {
      const outputStr = error.stdout?.toString() || error.stderr?.toString() || error.message;

      return {
        success: false,
        data: {
          output: outputStr,
        },
        error: error.message,
      };
    }
  },
};

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 解析测试输出，提取摘要信息
 */
function parseTestOutput(output: string): {
  total?: number;
  passed?: number;
  failed?: number;
  duration?: string;
  framework?: string;
} {
  const summary: any = {};

  // 检测测试框架
  if (output.includes('jest')) {
    summary.framework = 'jest';
    const match = output.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+failed/);
    if (match) {
      summary.total = parseInt(match[1]) + parseInt(match[2]);
      summary.passed = parseInt(match[1]);
      summary.failed = parseInt(match[2]);
    }
  } else if (output.includes('pytest')) {
    summary.framework = 'pytest';
    const match = output.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
    if (match) {
      summary.passed = parseInt(match[1]);
      summary.failed = parseInt(match[2]);
      summary.total = summary.passed + summary.failed;
    }
  } else if (output.includes('go test')) {
    summary.framework = 'go';
    const match = output.match(/ok\s+(\S+)\s+/);
    if (match) {
      summary.passed = 1;
      summary.total = 1;
    }
  }

  // 提取耗时
  const timeMatch = output.match(/(\d+(?:\.\d+)?)\s*s(?:ec)?/i);
  if (timeMatch) {
    summary.duration = timeMatch[1] + 's';
  }

  return summary;
}

// ============================================================================
// 导出
// ============================================================================

export function initTestTools(registry: any): void {
  registry.register(testTool);
  registry.register(npmTestTool);
  console.log('[TestTools] 已注册测试工具');
}
