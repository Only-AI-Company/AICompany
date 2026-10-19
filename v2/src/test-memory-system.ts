/**
 * 记忆系统测试 - 验证记忆存储和检索功能
 */

import { getMemoryStore } from './core/memory/MemoryStore.js';
import { getDatabase } from './db/Database.js';

// 初始化数据库
const db = getDatabase();

console.log('=== 记忆系统测试 ===\n');

// 测试记忆存储
async function testMemoryStorage() {
  console.log('测试 1: 记忆存储');

  const memoryStore = getMemoryStore();

  // 存储情景记忆
  const episodicId = await memoryStore.storeEpisodicMemory({
    taskId: 'test-task-001',
    taskType: 'task',
    taskDescription: '帮我写一个 Python 脚本来处理 CSV 文件',
    user_input: '帮我写一个 Python 脚本来处理 CSV 文件',
    assignedCXO: 'CTO',
    agentId: 'emp-cto',
    toolsUsed: ['bash', 'write_file'],
    status: 'success',
    output: '已创建 Python 脚本，支持 CSV 读取、写入和数据处理',
    artifacts: [{ type: 'file', path: 'scripts/process_csv.py' }],
    reflection: {
      successFactors: ['使用了 pandas 库', '代码结构清晰'],
      failureFactors: [],
      keyDecisions: ['选择 pandas 而不是 csv 模块'],
      learnings: ['pandas 更适合处理复杂 CSV', '应该添加错误处理'],
    },
  });

  console.log(`✅ 情景记忆已存储：${episodicId}`);

  // 存储语义记忆
  const semanticId = await memoryStore.storeSemanticMemory({
    memoryType: 'pattern',
    title: 'Python CSV 处理最佳实践',
    description: '使用 pandas 库处理 CSV 文件，注意错误处理和数据验证',
    content: { library: 'pandas', bestPractices: ['error_handling', 'data_validation'] },
    derivedFrom: episodicId,
    tags: ['python', 'csv', 'pandas', '数据处理'],
    confidence: 0.9,
    usageCount: 0,
  });

  console.log(`✅ 语义记忆已存储：${semanticId}`);

  return { episodicId, semanticId };
}

// 测试记忆检索
async function testMemoryRetrieval() {
  console.log('\n测试 2: 记忆检索');

  const memoryStore = getMemoryStore();

  // 检索相似任务
  const similarTasks = memoryStore.findSimilarTasks(
    '帮我写一个 Python 脚本来处理 Excel 文件',
    undefined,
    5
  );

  console.log(`检索到 ${similarTasks.length} 个相似任务:`);
  for (const task of similarTasks) {
    console.log(`  - ${task.taskDescription} [${task.status}]`);
    const learnings = task.reflection?.learnings;
    if (learnings && learnings.length > 0) {
      console.log(`    经验：${learnings[0]}`);
    }
  }

  // 检索相关模式
  const patterns = memoryStore.findRelevantMemories({
    tags: ['python', '数据处理'],
    minConfidence: 0.5
  }, 5);

  console.log(`\n检索到 ${patterns.length} 个相关模式:`);
  for (const pattern of patterns) {
    console.log(`  - ${pattern.title}: ${pattern.description}`);
    console.log(`    置信度：${pattern.confidence}`);
  }

  return { similarTasks, patterns };
}

// 测试多次存储后检索
async function testMultipleMemories() {
  console.log('\n测试 3: 多记忆场景');

  const memoryStore = getMemoryStore();

  // 存储多个情景记忆
  const tasks = [
    '优化数据库查询性能',
    '重构用户认证模块',
    '编写 API 文档',
    '修复登录 bug',
  ];

  for (const task of tasks) {
    await memoryStore.storeEpisodicMemory({
      taskId: `test-task-${task}`,
      taskType: 'task',
      taskDescription: task,
      user_input: task,
      status: 'success',
      output: '任务完成',
      reflection: {
        successFactors: ['方法正确'],
        learnings: [`${task} 的成功经验`],
      },
    });
  }

  console.log('已存储多个情景记忆');

  // 检索"优化"相关任务
  const optimizationTasks = memoryStore.findSimilarTasks('优化性能', undefined, 10);
  console.log(`\n检索"优化性能"相关任务：${optimizationTasks.length} 个`);
  for (const task of optimizationTasks) {
    console.log(`  - ${task.taskDescription}`);
  }

  // 检索"代码"相关任务
  const codeTasks = memoryStore.findSimilarTasks('代码重构', undefined, 10);
  console.log(`\n检索"代码重构"相关任务：${codeTasks.length} 个`);
  for (const task of codeTasks) {
    console.log(`  - ${task.taskDescription}`);
  }
}

// 测试记忆使用情况更新
async function testMemoryUsage() {
  console.log('\n测试 4: 记忆使用记录');

  const memoryStore = getMemoryStore();

  // 先存储一个语义记忆
  const semanticId = await memoryStore.storeSemanticMemory({
    memoryType: 'rule',
    title: '测试规则',
    description: '这是一个测试规则',
    content: { test: true },
    tags: ['test'],
    confidence: 0.8,
    usageCount: 0,
  });

  console.log(`存储语义记忆：${semanticId}`);

  // 记录使用情况
  const initialMemory = memoryStore.findRelevantMemories({ tags: ['test'] }, 1)[0];
  console.log(`初始置信度：${initialMemory?.confidence}, 使用次数：${initialMemory?.usageCount}`);

  // 模拟成功使用 3 次
  for (let i = 0; i < 3; i++) {
    memoryStore.recordUsage(semanticId, true);
  }

  // 模拟失败使用 1 次
  memoryStore.recordUsage(semanticId, false);

  // 检查更新后的值
  const updatedMemory = memoryStore.findRelevantMemories({ tags: ['test'] }, 1)[0];
  console.log(`更新后置信度：${updatedMemory?.confidence}, 使用次数：${updatedMemory?.usageCount}`);
}

// 运行所有测试
async function runTests() {
  try {
    // 测试 1: 记忆存储
    await testMemoryStorage();

    // 测试 2: 记忆检索
    await testMemoryRetrieval();

    // 测试 3: 多记忆场景
    await testMultipleMemories();

    // 测试 4: 记忆使用记录
    await testMemoryUsage();

    console.log('\n=== 测试完成 ===\n');

    // 显示数据库记录统计
    console.log('数据库记录统计:');
    const episodicCount = db.prepare('SELECT count(*) as count FROM episodic_memories').get() as any;
    const semanticCount = db.prepare('SELECT count(*) as count FROM semantic_memories').get() as any;
    const proceduralCount = db.prepare('SELECT count(*) as count FROM procedural_memories').get() as any;

    console.log(`  情景记忆：${episodicCount.count} 条`);
    console.log(`  语义记忆：${semanticCount.count} 条`);
    console.log(`  程序记忆：${proceduralCount.count} 条`);

  } catch (error: any) {
    console.error('测试失败:', error.message);
    console.error(error.stack);
  }
}

runTests();
