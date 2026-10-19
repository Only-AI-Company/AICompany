#!/usr/bin/env node
/**
 * Task-Session 架构演示
 *
 * 核心理念：
 * - 每个 Task 有独立的 Claude CLI Session
 * - Task 完成/失败后 Session 自动清理
 * - 支持并行任务执行
 */

import { DynamicAgent } from '../src/core/agents/DynamicAgent.js';
import type { AgentDefinition, AgentTask } from '../src/core/agents/types.js';
import { getTaskSessionManager } from '../src/core/execution/TaskSessionManager.js';

// ============================================================================
// 示例 1: 单任务执行
// ============================================================================

async function singleTaskExample() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║         示例 1: 单任务执行                    ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // 1. 创建 Agent
  const agentDefinition: AgentDefinition = {
    id: 'agent-dev-001',
    name: '技术专家',
    role: 'Technical Lead',
    capabilities: ['coding', 'analysis', 'planning'],
    systemPrompt: `你是技术专家，一个专业的技术型 AI 助手。

【你的能力】
- 代码开发：编写高质量、可维护的代码
- 数据分析：分析问题、诊断故障
- 方案规划：制定技术方案

【工作原则】
1. 技术卓越，追求最佳实践
2. 代码简洁，注重可维护性
3. 如果需要更多信息，明确提出`,
  };

  const agent = new DynamicAgent(agentDefinition);
  await agent.initialize();

  // 2. 创建任务
  const task: AgentTask = {
    id: 'task-001',
    description: '创建一个简单的 TypeScript 函数，用于计算斐波那契数列',
    requiredCapabilities: ['coding'],
    priority: 'medium',
    context: '这是用于演示的任务',
  };

  // 3. 执行任务
  console.log('\n--- 执行任务 ---\n');
  const result = await agent.executeTask(task);

  // 4. 查看结果
  console.log('\n--- 任务结果 ---');
  console.log(`成功: ${result.success}`);
  console.log(`耗时: ${result.metadata?.duration}ms`);
  if (result.output) {
    console.log(`输出预览: ${result.output.slice(0, 200)}...`);
  }

  // 5. Session 自动清理（任务完成后 5 秒）
  console.log('\n--- 等待 Session 清理 ---');
  await new Promise(resolve => setTimeout(resolve, 6000));

  const sessionManager = getTaskSessionManager();
  const stats = sessionManager.getStats();
  console.log(`活跃 Session 数: ${stats.activeSessions}`);
}

// ============================================================================
// 示例 2: 并行任务执行
// ============================================================================

async function parallelTasksExample() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║         示例 2: 并行任务执行                  ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // 创建技术 Agent
  const techAgent = new DynamicAgent({
    id: 'agent-tech',
    name: '技术专家',
    capabilities: ['coding', 'analysis'],
    systemPrompt: '你是技术专家，擅长代码开发和问题分析。',
  });
  await techAgent.initialize();

  // 创建内容 Agent
  const contentAgent = new DynamicAgent({
    id: 'agent-content',
    name: '内容创作者',
    capabilities: ['writing'],
    systemPrompt: '你是内容创作者，擅长撰写各类文档。',
  });
  await contentAgent.initialize();

  // 并行执行多个任务
  console.log('\n--- 启动并行任务 ---\n');

  const results = await Promise.all([
    techAgent.executeTask({
      id: 'task-frontend',
      description: '创建一个 React 组件，实现用户登录表单',
      requiredCapabilities: ['coding'],
      priority: 'high',
    }),
    techAgent.executeTask({
      id: 'task-backend',
      description: '创建一个 Express API 端点，用于用户认证',
      requiredCapabilities: ['coding'],
      priority: 'high',
    }),
    contentAgent.executeTask({
      id: 'task-docs',
      description: '编写 API 文档，描述上述接口的使用方法',
      requiredCapabilities: ['writing'],
      priority: 'medium',
    }),
  ]);

  // 查看结果
  console.log('\n--- 并行任务结果 ---');
  results.forEach(r => {
    console.log(`Task ${r.taskId}: ${r.success ? '✅' : '❌'} (${r.metadata?.duration}ms)`);
  });

  const sessionManager = getTaskSessionManager();
  console.log(`\n活跃 Session 数: ${sessionManager.getStats().activeSessions}`);
}

// ============================================================================
// 示例 3: 任务状态查询
// ============================================================================

async function taskStateExample() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║         示例 3: 任务状态查询                  ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const agent = new DynamicAgent({
    id: 'agent-demo',
    name: '演示 Agent',
    capabilities: ['analysis'],
    systemPrompt: '你是一个演示用的 Agent。',
  });
  await agent.initialize();

  // 启动任务（不等待）
  const task: AgentTask = {
    id: 'task-long-running',
    description: '分析当前项目的整体架构，给出详细的评估报告',
    requiredCapabilities: ['analysis'],
    priority: 'medium',
  };

  console.log('\n--- 启动长时任务 ---');

  // 不 await，让任务在后台运行
  agent.executeTask(task).then(result => {
    console.log(`\n[后台] 任务完成: ${result.success ? '成功' : '失败'}`);
  });

  // 定期查询状态
  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const state = agent.getTaskState(task.id);
    const sessionManager = getTaskSessionManager();

    console.log(`\n--- 状态查询 #${i + 1} ---`);
    console.log(`Agent 状态: ${agent.getStatus().state}`);
    if (state) {
      console.log(`Session 状态: ${state.status}`);
      console.log(`输出数量: ${state.outputCount}`);
    }
    console.log(`活跃任务: ${sessionManager.getActiveTasks().join(', ') || '无'}`);
  }

  // 等待任务完成
  await new Promise(resolve => setTimeout(resolve, 10000));
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  const sessionManager = getTaskSessionManager({
    projectRoot: process.cwd(),
    idleTimeout: 3000,
  });

  try {
    // 运行示例
    await singleTaskExample();
    // await parallelTasksExample();
    // await taskStateExample();

  } catch (error: any) {
    console.error('错误:', error.message);
  } finally {
    // 清理
    console.log('\n--- 清理资源 ---');
    sessionManager.cleanup();
  }
}

main().catch(console.error);
