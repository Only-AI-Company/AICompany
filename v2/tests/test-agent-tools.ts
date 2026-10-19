#!/usr/bin/env node
/**
 * Agent Tool Use 测试
 *
 * 验证 agent 能够使用工具执行实际任务
 */

import { getAPIAgentExecutor } from './src/core/execution/APIAgentExecutor.js';
import { getToolRegistry, type Tool } from './src/core/tools/index.js';
import { getDatabase } from './src/db/Database.js';
import { loadEnvFile } from 'node:process';

// 加载环境变量
loadEnvFile();

async function testAgentWithTools() {
  console.log('=== Agent Tool Use 测试 ===\n');

  // 1. 初始化工具注册表
  const toolRegistry = getToolRegistry();
  const db = getDatabase();

  console.log('1. 注册工具...');

  // 创建测试工具：读取文件
  const readFileTool: Tool = {
    name: 'read_file',
    description: '读取文件内容',
    category: 'system',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '文件路径',
          required: true,
        },
      },
      required: ['filePath'],
    },
    enabled: true,
    async handler(input: any, context: any): Promise<any> {
      const { readFile } = await import('fs/promises');
      try {
        const content = await readFile(input.filePath, 'utf-8');
        return {
          success: true,
          data: { content },
          message: `成功读取文件: ${input.filePath}`,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  };

  // 创建测试工具：写文件
  const writeFileTool: Tool = {
    name: 'write_file',
    description: '写入文件内容',
    category: 'system',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '文件路径',
          required: true,
        },
        content: {
          type: 'string',
          description: '文件内容',
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
          message: `成功写入文件: ${input.filePath}`,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  };

  toolRegistry.register(readFileTool);
  toolRegistry.register(writeFileTool);

  console.log(`   ✅ 已注册 ${toolRegistry.getAll().length} 个工具`);

  // 2. 创建 Agent（专门用于文件操作）
  const systemPrompt = `# File Operations Agent

You are an expert file handler. Your task is to:
1. Read files when requested
2. Write content to files
3. Always confirm the file path before writing
4. Report what you did clearly

## Available Tools
- read_file: Read file contents
- write_file: Write content to a file

## How You Work
1. Understand what files need to be read/written
2. Use the appropriate tool
3. Report the result clearly`;

  const executor = getAPIAgentExecutor({
    agentId: 'test-file-agent',
    agentName: 'file-operations-agent',
    systemPrompt,
    maxTurns: 5,
    timeout: 60000,
  });

  console.log('2. 创建 File Operations Agent ✅');

  // 3. 测试任务：创建一个 Python 文件
  const task = `Create a Python file called /tmp/hello.py that prints "Hello, World!"`;

  console.log('\n3. 执行任务...');
  console.log(`   任务: ${task}`);

  const startTime = Date.now();

  try {
    const result = await executor.execute(task);
    const duration = Date.now() - startTime;

    console.log('\n4. 执行结果:');
    console.log(`   成功: ${result.success}`);
    console.log(`   耗时: ${duration}ms`);
    console.log(`   Token 用量: ${result.usage?.inputTokens || 0} input, ${result.usage?.outputTokens || 0} output`);
    console.log(`   工具调用: ${result.toolCalls.length} 个`);

    // 显示工具调用详情
    if (result.toolCalls.length > 0) {
      console.log('\n5. 工具调用详情:');
      for (const call of result.toolCalls) {
        console.log(`   📦 ${call.name}`);
        console.log(`      输入: ${JSON.stringify(call.input).substring(0, 100)}`);
        console.log(`      结果: ${call.result.success ? '✅ 成功' : '❌ 失败'}`);
        if (call.result.message) {
          console.log(`      消息: ${call.result.message}`);
        }
      }
    }

    if (result.success) {
      console.log('\n6. Agent 输出:');
      console.log('─'.repeat(60));
      console.log(result.output);
      console.log('─'.repeat(60));

      // 验证文件是否真的创建了
      const { existsSync } = await import('fs');
      if (existsSync('/tmp/hello.py')) {
        const { readFile } = await import('fs/promises');
        const content = await readFile('/tmp/hello.py', 'utf-8');
        console.log('\n7. 文件验证 ✅');
        console.log('   文件内容:');
        console.log('   ' + content.split('\n').join('\n   '));

        // 清理测试文件
        const { unlink } = await import('fs/promises');
        await unlink('/tmp/hello.py');
        console.log('\n   测试文件已清理');
      }

      console.log('\n🎉 测试通过！Agent Tool Use 正常工作');
      process.exit(0);

    } else {
      console.log(`\n❌ 执行失败: ${result.error}`);
      process.exit(1);
    }

  } catch (error: any) {
    console.error(`\n❌ 测试失败: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

testAgentWithTools();
