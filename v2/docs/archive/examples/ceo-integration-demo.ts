#!/usr/bin/env node
/**
 * CEO Supervisor 集成演示
 *
 * 展示 CEO 监督者如何与 CoreProcess、TaskSession 协同工作
 */

import { getCoreProcess } from '../src/core/events/CoreProcess.js';
import { getEventBus } from '../src/core/events/EventBus.js';
import { getCEOSupervisor } from '../src/core/supervision/CEOSupervisorAgent.js';
import { getDatabase } from '../src/db/Database.js';

async function demonstrateCEOIntegration() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║       CEO Supervisor 集成演示                 ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const eventBus = getEventBus();
  const ceo = getCEOSupervisor();
  const db = getDatabase();

  // ========================================================================
  // 演示 1: CEO 分析需求
  // ========================================================================

  console.log('\n--- 演示 1: CEO 分析需求 ---\n');

  const userInput1 = '创建一个登录页面，使用 React 和 TypeScript';
  const analysis1 = await ceo.analyzeRequirement(userInput1);

  console.log('用户输入:', userInput1);
  console.log('CEO 分析:');
  console.log('  意图类型:', analysis1.intentType);
  console.log('  所需能力:', analysis1.requiredCapabilities.join(', '));
  console.log('  风险等级:', analysis1.riskLevel);
  console.log('  置信度:', analysis1.confidence);

  // ========================================================================
  // 演示 2: 风险评估
  // ========================================================================

  console.log('\n--- 演示 2: 风险评估 ---\n');

  const userInput2 = '删除所有用户数据';
  const analysis2 = await ceo.analyzeRequirement(userInput2);
  const riskAssessment = await ceo.assessRisk(userInput2, analysis2.requiredCapabilities);

  console.log('用户输入:', userInput2);
  console.log('风险评估:');
  console.log('  风险等级:', riskAssessment.level);
  console.log('  需要审批:', riskAssessment.requiresApproval);
  console.log('  风险因素:', riskAssessment.factors.map(f => f.description).join(', '));

  // ========================================================================
  // 演示 3: 员工选择
  // ========================================================================

  console.log('\n--- 演示 3: 员工选择 ---\n');

  const requiredCapabilities = ['coding', 'planning'];
  const employeeSelection = await ceo.selectEmployee(requiredCapabilities);

  if (employeeSelection) {
    console.log('所需能力:', requiredCapabilities.join(', '));
    console.log('CEO 选中:', employeeSelection.name);
    console.log('匹配分数:', employeeSelection.matchScore);
  }

  // ========================================================================
  // 演示 4: 决策处理
  // ========================================================================

  console.log('\n--- 演示 4: 决策处理 ---\n');

  const decisionRequest = {
    decisionId: `test-decision-${Date.now()}`,
    taskId: 'test-task-001',
    type: 'user_confirmation' as const,
    description: '是否继续执行删除操作？',
    options: [
      { value: 'yes', label: '是', risk: '可能删除重要数据' },
      { value: 'no', label: '否', risk: '操作被取消' },
    ],
  };

  const decision = await ceo.makeDecision(decisionRequest);

  console.log('决策请求:', decisionRequest.description);
  console.log('CEO 决策:');
  console.log('  选择:', decision.selectedOption);
  console.log('  理由:', decision.reasoning);

  // ========================================================================
  // 演示 5: 任务复盘
  // ========================================================================

  console.log('\n--- 演示 5: 任务复盘 ---\n');

  const taskResult = {
    success: true,
    output: '登录页面已创建，包含表单验证和错误处理',
    duration: 15000,
  };

  const review = await ceo.reviewTask('task-001', '创建登录页面', taskResult);

  console.log('任务结果:', taskResult.success ? '成功' : '失败');
  console.log('复盘结果:');
  console.log('  评分:', review.score, '/ 10');
  console.log('  优点:', review.strengths.join(', '));
  console.log('  改进:', review.improvements.join(', '));
  console.log('  经验教训:', review.lessonsLearned.join(', '));

  // ========================================================================
  // 演示 6: 员工绩效更新
  // ========================================================================

  console.log('\n--- 演示 6: 员工绩效更新 ---\n');

  if (employeeSelection && review.shouldUpdatePerformance) {
    const perfUpdate = await ceo.updateEmployeePerformance(employeeSelection.employeeId, review);

    if (perfUpdate) {
      console.log('员工:', employeeSelection.name);
      console.log('绩效变化:', perfUpdate.pointsDelta > 0 ? '+' : '', perfUpdate.pointsDelta, '分');
      if (perfUpdate.satisfactionDelta !== undefined) {
        console.log('满意度变化:', perfUpdate.satisfactionDelta > 0 ? '+' : '', perfUpdate.satisfactionDelta);
      }
      if (perfUpdate.levelUp) {
        console.log('🎉 员工升级!');
      }
      console.log('原因:', perfUpdate.reason);
    }
  }

  // ========================================================================
  // 演示 7: 完整流程 (通过 CoreProcess)
  // ========================================================================

  console.log('\n--- 演示 7: 完整流程 (CoreProcess) ---\n');

  const coreProcess = getCoreProcess();
  coreProcess.start();

  // 模拟用户输入
  console.log('发送用户输入: "帮我写一个排序算法"\n');

  eventBus.emit({
    type: 'user.input',
    source: 'cli',
    content: '帮我写一个排序算法',
    timestamp: Date.now(),
  });

  // 等待一段时间让流程完成
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n--- 演示结束 ---\n');
}

// ========================================================================
// 主函数
// ========================================================================

async function main() {
  try {
    await demonstrateCEOIntegration();
  } catch (error: any) {
    console.error('错误:', error.message);
    console.error(error.stack);
  } finally {
    console.log('\n清理资源...');
    process.exit(0);
  }
}

main().catch(console.error);
