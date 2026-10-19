#!/usr/bin/env node
/**
 * API Agent 执行器测试
 *
 * 验证使用 API 模式实现 Claude Code 的 agent 能力
 */

import { getAPIAgentExecutor } from './src/core/execution/APIAgentExecutor.js';
import { loadEnvFile } from 'node:process';

// 加载环境变量
loadEnvFile();

async function testAPIAgent() {
  console.log('=== API Agent 执行器测试 ===\n');

  // 测试 System Prompt（模拟 Claude Code 的 agent）
  const systemPrompt = `# Python Coding Analyst

You are an expert Python developer specializing in code analysis and debugging.

## Your Expertise
- Python syntax and best practices
- Common bugs and anti-patterns
- Performance optimization
- Code readability and maintainability

## How You Work
1. Analyze code carefully
2. Identify issues and suggest improvements
3. Provide clear, actionable feedback
4. Include code examples when helpful

## Output Format
- Summary of findings
- Specific issues with line numbers
- Suggested fixes with code examples
- Best practice recommendations`;

  // 创建 API Agent 执行器
  const executor = getAPIAgentExecutor({
    agentId: 'test-python-analyst',
    agentName: 'python-coding-analyst',
    systemPrompt,
    maxTurns: 5,
    timeout: 60000,
  });

  console.log('1. 创建 Agent 执行器 ✅');
  console.log(`   Agent: ${systemPrompt.split('\n')[0].substring(2)}`);

  // 测试任务
  const task = `Please analyze this Python code and identify any issues:

\`\`\`python
def calculate_sum(numbers):
    result = 0
    for n in numbers:
        result = result + n
    return result

data = [1, 2, 3, 4, 5]
print(calculate_sum(data))
\`\`\`

Provide:
1. Code review summary
2. Any bugs or issues
3. Suggestions for improvement
4. Best practice recommendations`;

  console.log('\n2. 执行任务...');
  console.log(`   任务: ${task.substring(0, 80)}...`);

  const startTime = Date.now();

  try {
    const result = await executor.execute(task);
    const duration = Date.now() - startTime;

    console.log('\n3. 执行结果:');
    console.log(`   成功: ${result.success}`);
    console.log(`   耗时: ${duration}ms`);
    console.log(`   Token 用量: ${result.usage?.inputTokens || 0} input, ${result.usage?.outputTokens || 0} output`);
    console.log(`   工具调用: ${result.toolCalls.length} 个`);

    if (result.success) {
      console.log('\n4. Agent 输出:');
      console.log('─'.repeat(60));
      console.log(result.output);
      console.log('─'.repeat(60));

      // 检查记忆文件
      const fs = await import('fs/promises');
      const path = await import('path');
      const memoryDir = path.join(process.env.HOME || '', '.claude', 'agent-memory', 'python-coding-analyst');
      const memoryFile = path.join(memoryDir, 'MEMORY.md');

      try {
        const memoryExists = await fs.access(memoryFile).then(() => true).catch(() => false);
        if (memoryExists) {
          console.log('\n5. 持久化记忆: ✅');
          console.log(`   位置: ${memoryFile}`);
        }
      } catch {}

      console.log('\n🎉 测试通过！API Agent 执行器正常工作');
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

testAPIAgent();
