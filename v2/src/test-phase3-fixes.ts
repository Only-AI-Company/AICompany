#!/usr/bin/env node
/**
 * Phase 3 Fixes Test
 *
 * 测试修复内容:
 * 1. ClaudeCLIManager 多例模式
 * 2. TaskPlanner 类型安全
 * 3. createToolExecutor 函数
 * 4. Validator 配置
 * 5. ToolRouter open_task 识别
 */

import { ClaudeCLIManager, getClaudeCLIManager, cleanupCLIManagers } from './core/claude/ClaudeCLIManager.js';
import { TaskPlanner, getTaskPlanner } from './core/TaskPlanner.js';
import { createToolExecutor } from './core/ToolExecutor.js';
import { Validator, getValidator } from './core/Validator.js';
import { WorkspaceManager, getWorkspaceManager } from './core/Workspace.js';
import { ToolRouter } from './core/ToolRouter.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`✅ ${message}`);
    passedTests++;
  } else {
    console.error(`❌ ${message}`);
    failedTests++;
  }
}

async function testClaudeCLIManager(): Promise<void> {
  console.log('\n=== Test 1: ClaudeCLIManager 多例模式 ===');

  cleanupCLIManagers();

  // 测试 1: 相同路径返回同一实例
  const manager1 = getClaudeCLIManager('/tmp/test-ws-1');
  const manager2 = getClaudeCLIManager('/tmp/test-ws-1');
  assert(manager1 === manager2, '相同路径应返回同一实例');

  // 测试 2: 不同路径返回不同实例
  const manager3 = getClaudeCLIManager('/tmp/test-ws-2');
  assert(manager1 !== manager3, '不同路径应返回不同实例');

  // 测试 3: 不传路径使用默认路径
  const manager4 = getClaudeCLIManager();
  const manager5 = getClaudeCLIManager();
  assert(manager4 === manager5, '默认路径应返回同一实例');

  // 测试 4: 基本文件操作
  const testManager = new ClaudeCLIManager('/tmp/test-phase3-' + Date.now());
  await testManager.initialize();
  assert(true, 'initialize() 正常工作');

  const result = await testManager.mkdir('test-dir');
  assert(result.success, 'mkdir() 成功');

  const exists = await testManager.exists('test-dir');
  assert(exists, '文件存在检查正常');

  console.log(`ClaudeCLIManager 测试完成：${passedTests} 通过，${failedTests} 失败`);
}

async function testTaskPlanner(): Promise<void> {
  console.log('\n=== Test 2: TaskPlanner 类型安全 ===');

  const planner = getTaskPlanner();
  assert(planner !== null, 'TaskPlanner 实例创建成功');

  // 测试 validatePlan 函数
  const mockPlan = {
    taskId: 'test-1',
    originalRequest: 'test',
    createdAt: Date.now(),
    steps: [
      {
        id: 'step-1',
        name: 'Test Step',
        description: 'Test',
        type: 'mkdir' as const,
        filePath: 'test',
        dependencies: [],
      },
    ],
  };

  const validation = planner.validatePlan(mockPlan);
  assert(validation.valid, 'validatePlan() 正常工作');

  // 测试无效计划
  const invalidPlan = {
    taskId: 'test-2',
    originalRequest: 'test',
    createdAt: Date.now(),
    steps: [],
  };

  const invalidValidation = planner.validatePlan(invalidPlan);
  assert(!invalidValidation.valid, 'validatePlan() 正确识别无效计划');

  console.log(`TaskPlanner 测试完成：累计 ${passedTests} 通过，${failedTests} 失败`);
}

async function testToolExecutor(): Promise<void> {
  console.log('\n=== Test 3: ToolExecutor createToolExecutor ===');

  // 测试 1: createToolExecutor 每次创建新实例
  const executor1 = createToolExecutor();
  const executor2 = createToolExecutor();
  assert(executor1 !== executor2, 'createToolExecutor 应每次创建新实例');

  // 测试 2: 不同配置的实例
  const workspaceManager = getWorkspaceManager();
  const executor3 = createToolExecutor({ workspaceManager });
  const executor4 = createToolExecutor({ workspaceManager });
  assert(executor3 !== executor4, '带配置的 createToolExecutor 应创建不同实例');

  console.log(`ToolExecutor 测试完成：累计 ${passedTests} 通过，${failedTests} 失败`);
}

async function testValidator(): Promise<void> {
  console.log('\n=== Test 4: Validator 配置 ===');

  // 测试 1: 默认阈值
  const validator1 = getValidator();
  assert(validator1 !== null, 'Validator 创建成功');

  // 测试 2: 自定义阈值
  const validator2 = new Validator({ completionThreshold: 90 });
  assert(validator2 !== null, '带阈值的 Validator 创建成功');

  // 测试 3: workspacePath 为空时的错误处理
  try {
    const validator3 = new Validator({});
    await validator3.validate(
      { taskId: 'test', originalRequest: 'test', createdAt: Date.now(), steps: [] },
      { success: true, results: [], summary: 'test' },
      undefined
    );
    assert(false, '应抛出错误');
  } catch (error: any) {
    assert(
      error.message.includes('CLIManager or workspacePath'),
      '正确抛出 workspacePath 缺失错误'
    );
  }

  console.log(`Validator 测试完成：累计 ${passedTests} 通过，${failedTests} 失败`);
}

async function testToolRouter(): Promise<void> {
  console.log('\n=== Test 5: ToolRouter open_task 识别 ===');

  const router = new ToolRouter();

  // 测试 1: 原始关键词
  const result1 = await router.analyze('创建一个网站');
  assert(result1.intent.type === 'open_task', '识别 "创建一个网站" 为 open_task');

  // 测试 2: 新增关键词 - 写
  const result2 = await router.analyze('写一个网站');
  assert(result2.intent.type === 'open_task', '识别 "写一个网站" 为 open_task');

  // 测试 3: 新增关键词 - 做一个
  const result3 = await router.analyze('做一个计算器');
  assert(result3.intent.type === 'open_task', '识别 "做一个计算器" 为 open_task');

  // 测试 4: 新增关键词 - 开发
  const result4 = await router.analyze('开发个程序');
  assert(result4.intent.type === 'open_task', '识别 "开发个程序" 为 open_task');

  // 测试 5: 新增关键词 - 游戏
  const result5 = await router.analyze('创建一个游戏');
  assert(result5.intent.type === 'open_task', '识别 "创建一个游戏" 为 open_task');

  // 测试 6: 非 open_task 请求
  const result6 = await router.analyze('你好');
  assert(result6.intent.type === 'chat', '识别 "你好" 为 chat');

  console.log(`ToolRouter 测试完成：累计 ${passedTests} 通过，${failedTests} 失败`);
}

async function testWorkspaceManager(): Promise<void> {
  console.log('\n=== Test 6: WorkspaceManager 基本功能 ===');

  const workspaceManager = getWorkspaceManager();

  // 创建工作区
  const workspace = await workspaceManager.createWorkspace('test-task-1');
  assert(workspace !== undefined, '创建工作区成功');
  assert(workspace.status === 'active', '工作区状态为 active');

  // 获取工作区
  const retrieved = workspaceManager.getWorkspace(workspace.id);
  assert(retrieved !== undefined, '获取工作区成功');
  assert(retrieved?.id === workspace.id, '工作区 ID 匹配');

  // 完成任务区
  await workspaceManager.completeWorkspace(workspace.id, true);
  assert(retrieved?.status === 'completed', '工作区状态更新为 completed');

  console.log(`WorkspaceManager 测试完成：累计 ${passedTests} 通过，${failedTests} 失败`);
}

async function runAllTests(): Promise<void> {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Phase 3 Fixes Test Suite             ║');
  console.log('╚════════════════════════════════════════╝');

  try {
    await testClaudeCLIManager();
    await testTaskPlanner();
    await testToolExecutor();
    await testValidator();
    await testToolRouter();
    await testWorkspaceManager();

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║           Test Summary                 ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`\n总测试数：${passedTests + failedTests}`);
    console.log(`✅ 通过：${passedTests}`);
    console.log(`❌ 失败：${failedTests}`);

    if (failedTests > 0) {
      console.log('\n⚠️  部分测试失败，请检查修复内容');
      process.exit(1);
    } else {
      console.log('\n🎉 所有测试通过！Phase 3 修复验证成功！');
      process.exit(0);
    }
  } catch (error: any) {
    console.error('\n❌ 测试执行出错:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runAllTests();
