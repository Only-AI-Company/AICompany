#!/usr/bin/env node
/**
 * Claude Code 内置工具测试
 *
 * 验证所有 Claude Code 内置工具 (Bash, Read, Write, Edit, Glob, Grep, LS) 正常工作
 */

import { getAPIAgentExecutor } from './src/core/execution/APIAgentExecutor.js';
import { getToolRegistry, initSystemTools } from './src/core/tools/index.js';
import { loadEnvFile } from 'node:process';

loadEnvFile();

async function testSystemTools() {
  console.log('=== AI Company 系统工具测试 ===\n');

  // 1. 初始化工具注册表并注册系统工具
  const toolRegistry = getToolRegistry();

  console.log('1. 注册系统工具...');
  initSystemTools((tool) => toolRegistry.register(tool));

  const stats = toolRegistry.getStats();
  console.log(`   ✅ 已注册 ${stats.totalTools} 个工具，${stats.enabledTools} 个启用`);
  console.log(`   工具列表：${toolRegistry.getAll().map(t => t.name).join(', ')}`);

  // 2. 创建 Agent
  const systemPrompt = `# Terminal Agent

You are an expert terminal user. Your task is to:
1. Execute shell commands using Bash
2. Read/write files using Read/Write tools
3. Search files using Glob/Grep
4. List directories using LS
5. Report results clearly

## Available Tools
- Bash: Run shell commands
- Read: Read file contents
- Write: Write content to files
- Edit: Edit files by string replacement
- Glob: Find files by pattern
- Grep: Search text in files
- LS: List directory contents`;

  const executor = getAPIAgentExecutor({
    agentId: 'test-claude-code-agent',
    agentName: 'claude-code-tools-tester',
    systemPrompt,
    maxTurns: 10,
    timeout: 120000,
  });

  console.log('2. 创建 Terminal Agent ✅');

  // 3. 测试任务
  const task = `Create a test directory /tmp/cc-test with these files:
1. hello.js - a Node.js script that prints "Hello from Node!"
2. data.txt - contains "Line 1", "Line 2", "Line 3" (one per line)

Then:
1. List the directory contents
2. Read hello.js and show its content
3. Run the hello.js script with node
4. Search for "Line 2" in data.txt
5. Report what you did`;

  console.log('\n3. 执行任务...');
  console.log(`   任务：${task.substring(0, 100)}...`);

  const startTime = Date.now();

  try {
    const result = await executor.execute(task);
    const duration = Date.now() - startTime;

    console.log('\n4. 执行结果:');
    console.log(`   成功：${result.success}`);
    console.log(`   耗时：${duration}ms`);
    console.log(`   Token 用量：${result.usage?.inputTokens || 0} input, ${result.usage?.outputTokens || 0} output`);
    console.log(`   工具调用：${result.toolCalls.length} 个`);

    if (result.toolCalls.length > 0) {
      console.log('\n5. 工具调用详情:');
      for (const call of result.toolCalls) {
        console.log(`   📦 ${call.name}`);
        console.log(`      输入：${JSON.stringify(call.input).substring(0, 120)}...`);
        console.log(`      结果：${call.result.success ? '✅' : '❌'}`);
      }
    }

    if (result.success) {
      console.log('\n6. Agent 输出:');
      console.log('═'.repeat(70));
      console.log(result.output);
      console.log('═'.repeat(70));

      // 清理测试目录
      const { execSync } = await import('child_process');
      try {
        execSync('rm -rf /tmp/cc-test');
        console.log('\n   测试目录已清理');
      } catch {}

      console.log('\n🎉 测试通过！Claude Code 内置工具正常工作');
      process.exit(0);

    } else {
      console.log(`\n❌ 执行失败：${result.error}`);
      process.exit(1);
    }

  } catch (error: any) {
    console.error(`\n❌ 测试失败：${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

testSystemTools();
