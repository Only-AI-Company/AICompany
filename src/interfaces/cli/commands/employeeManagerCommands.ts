/**
 * AI Company CLI - Employee Manager Commands
 *
 * 员工管理 Agent 命令
 */

import { Command } from 'commander';
import { getDatabase } from '../../../infrastructure/database/index.js';
import { EmployeeManagerAgent } from '../../../core/agents/EmployeeManagerAgent.js';
import { EmployeeAgentService } from '../../../application/services/EmployeeAgentService.js';

export function registerEmployeeManagerCommands(program: Command): void {
  // ============================================================================
  // employee:analyze <id> - 分析员工表现
  // ============================================================================

  program
    .command('employee:analyze <id>')
    .description('分析员工表现（AI）')
    .action(async (id) => {
      const db = getDatabase();
      const agent = new EmployeeManagerAgent(db);

      console.log(`\n📊 正在分析员工表现...\n`);

      try {
        const analysis = await agent.analyzeEmployee(id);

        console.log(`员工 ID：${analysis.employeeId}`);
        console.log(`绩效评分：${analysis.performanceScore}/100`);
        console.log(`状态：${statusEmoji(analysis.status)} ${statusText(analysis.status)}`);
        console.log(`利用率：${(analysis.utilizationRate * 100).toFixed(0)}%`);

        if (analysis.skillGaps.length > 0) {
          console.log(`\n技能缺口：`);
          analysis.skillGaps.forEach(gap => console.log(`  - ${gap}`));
        }

        if (analysis.suggestions.length > 0) {
          console.log(`\n改进建议：`);
          analysis.suggestions.forEach(s => console.log(`  - ${s}`));
        }
        console.log();
      } catch (error: any) {
        console.error(`❌ ${error.message}\n`);
      }
    });

  // ============================================================================
  // employee:recruit-suggest - 智能招募建议（基于任务积压分析）
  // ============================================================================

  program
    .command('employee:recruit-suggest')
    .description('智能招募建议（基于任务积压分析）')
    .option('--execute', '执行招募')
    .action(async (options) => {
      const db = getDatabase();
      const agent = new EmployeeManagerAgent(db);

      console.log(`\n🔍 正在分析招募需求...\n`);

      const suggestions = await agent.smartRecruit();

      if (suggestions.length === 0) {
        console.log(`✓ 当前团队配置合理，无需招募\n`);
        return;
      }

      console.log(`建议招募 ${suggestions.length} 名员工：\n`);

      suggestions.forEach((s, i) => {
        console.log(`${i + 1}. ${s.name}（${s.role}）`);
        console.log(`   模型：${s.model}`);
        console.log(`   理由：${s.reason}`);
        console.log(`   预估成本：$${s.estimatedCost}/月`);
        console.log(`   优先级：${s.priority}\n`);
      });

      if (options.execute) {
        console.log(`⚠️  自动执行招募功能待实现\n`);
        console.log(`提示：运行以下命令手动招募：`);
        suggestions.forEach(s => {
          console.log(`  ai-company recruit "${s.role}"`);
        });
        console.log();
      }
    });

  // ============================================================================
  // employee:evaluate <id> - 绩效评估
  // ============================================================================

  program
    .command('employee:evaluate <id>')
    .description('员工绩效评估')
    .option('-p, --period <days>', '评估周期（天）', '30')
    .action(async (id, options) => {
      const db = getDatabase();
      const agent = new EmployeeManagerAgent(db);

      const period = parseInt(options.period);

      console.log(`\n📈 正在评估绩效（最近${period}天）...\n`);

      try {
        const report = await agent.evaluatePerformance(id, period);

        console.log(`员工：${report.employeeName}`);
        console.log(`评估周期：${report.period}`);
        console.log(`完成任务：${report.completedTasks}`);
        console.log(`平均质量：${report.averageQuality.toFixed(1)}/100`);
        console.log(`成功率：${report.successRate.toFixed(1)}%`);

        const avgHours = report.averageSpeed / (1000 * 60 * 60);
        console.log(`平均用时：${avgHours.toFixed(1)}小时`);

        if (report.strengths.length > 0) {
          console.log(`\n✓ 优势：`);
          report.strengths.forEach(s => console.log(`  - ${s}`));
        }

        if (report.weaknesses.length > 0) {
          console.log(`\n✗ 不足：`);
          report.weaknesses.forEach(w => console.log(`  - ${w}`));
        }

        if (report.recommendations.length > 0) {
          console.log(`\n💡 建议：`);
          report.recommendations.forEach(r => console.log(`  - ${r}`));
        }
        console.log();
      } catch (error: any) {
        console.error(`❌ ${error.message}\n`);
      }
    });

  // ============================================================================
  // employee:train <id> - 检测技能并学习
  // ============================================================================

  program
    .command('employee:train <id>')
    .description('检测技能缺口并自动学习')
    .action(async (id) => {
      const db = getDatabase();
      const agent = new EmployeeManagerAgent(db);

      console.log(`\n🎓 正在分析技能缺口...\n`);

      try {
        const learnedSkills = await agent.detectAndTrain(id);

        if (learnedSkills.length === 0) {
          console.log(`✓ 员工技能完善，无需额外学习\n`);
        } else {
          console.log(`✓ 学会了 ${learnedSkills.length} 个新技能：`);
          learnedSkills.forEach(s => console.log(`  - ${s}`));
          console.log();
        }
      } catch (error: any) {
        console.error(`❌ ${error.message}\n`);
      }
    });

  // ============================================================================
  // employee:optimize - 团队优化
  // ============================================================================

  program
    .command('employee:optimize')
    .description('团队优化建议（解雇、重新分配、招募）')
    .action(async () => {
      const db = getDatabase();
      const agent = new EmployeeManagerAgent(db);

      console.log(`\n🔧 正在分析团队配置...\n`);

      const optimization = await agent.optimizeTeam();

      if (optimization.toFire.length > 0) {
        console.log(`建议解雇（${optimization.toFire.length}人）：`);
        optimization.toFire.forEach(emp => {
          console.log(`  - ${emp.name} (${emp.id})`);
          console.log(`    理由：${emp.reason}`);
        });
        console.log();
      }

      if (optimization.toReassign.length > 0) {
        console.log(`建议重新分配：`);
        optimization.toReassign.forEach(r => {
          console.log(`  - ${r.from} → ${r.to}`);
          console.log(`    理由：${r.reason}`);
        });
        console.log();
      }

      if (optimization.newRecruits.length > 0) {
        console.log(`建议招募：`);
        optimization.newRecruits.forEach(r => {
          console.log(`  - ${r.name}（${r.role}）`);
          console.log(`    理由：${r.reason}`);
        });
        console.log();
      }

      if (optimization.toFire.length === 0 &&
          optimization.toReassign.length === 0 &&
          optimization.newRecruits.length === 0) {
        console.log(`✓ 团队配置合理，无需优化\n`);
      }
    });

  // ============================================================================
  // employee:health - 员工健康检查
  // ============================================================================

  program
    .command('employee:health')
    .description('员工健康检查')
    .action(async () => {
      const db = getDatabase();
      const agent = new EmployeeManagerAgent(db);

      console.log(`\n🏥 正在检查员工健康状态...\n`);

      const health = agent.healthCheck();

      const employees = db.getAllEmployees();
      console.log(`员工总数：${employees.length}`);

      if (health.overloaded.length > 0) {
        console.log(`\n⚠️  过载员工（${health.overloaded.length}人）：`);
        health.overloaded.forEach(emp => {
          console.log(`  - ${emp.name}：${emp.activeTasks}个活跃任务`);
        });
      }

      if (health.idle.length > 0) {
        console.log(`\n💤 闲置员工（${health.idle.length}人）：`);
        health.idle.forEach(emp => {
          console.log(`  - ${emp.name}：闲置${emp.idleDays}天`);
        });
      }

      if (health.stuck.length > 0) {
        console.log(`\n🚫 卡住员工（${health.stuck.length}人）：`);
        health.stuck.forEach(emp => {
          console.log(`  - ${emp.name}：${emp.reason}`);
        });
      }

      if (health.overloaded.length === 0 &&
          health.idle.length === 0 &&
          health.stuck.length === 0) {
        console.log(`\n✓ 所有员工状态正常`);
      }

      console.log();
    });

  // ============================================================================
  // team:report - 团队报告
  // ============================================================================

  program
    .command('team:report')
    .description('生成团队状态报告（AI）')
    .action(async () => {
      const db = getDatabase();
      const agent = new EmployeeManagerAgent(db);

      console.log(`\n📄 正在生成团队报告...\n`);

      const report = await agent.generateTeamReport();

      console.log(report);
      console.log();
    });

  program
    .command('employee:agent <id>')
    .description('为员工创建或更新 Claude Agent 映射')
    .option('-s, --scope <scope>', 'scope: user | project', 'project')
    .option('-n, --name <agentName>', '指定 agent 名称')
    .action(async (id, options) => {
      const db = getDatabase();
      const service = new EmployeeAgentService(db);

      try {
        const mapping = service.ensureEmployeeAgent(id, {
          scope: options.scope === 'user' ? 'user' : 'project',
          agentName: options.name,
          cwd: process.cwd(),
        });

        console.log(`\n✅ 已绑定 Claude Agent\n`);
        console.log(`员工: ${id}`);
        console.log(`Agent: ${mapping.agent_name}`);
        console.log(`Scope: ${mapping.scope}`);
        console.log(`Config: ${mapping.config_path}\n`);
      } catch (error: any) {
        console.error(`\n❌ ${error.message}\n`);
      }
    });

  program
    .command('employee:agents')
    .description('列出员工与 Claude Agent 映射')
    .action(() => {
      const db = getDatabase();
      const service = new EmployeeAgentService(db);
      const mappings = service.listEmployeeAgents();

      if (mappings.length === 0) {
        console.log(`\n暂无映射\n`);
        return;
      }

      console.log(`\n🔗 员工与 Claude Agent 映射 (${mappings.length})\n`);
      mappings.forEach((mapping) => {
        console.log(`员工: ${mapping.employee_id}`);
        console.log(`Agent: ${mapping.agent_name}`);
        console.log(`Scope: ${mapping.scope}`);
        console.log(`Status: ${mapping.status}`);
        console.log(`Config: ${mapping.config_path}\n`);
      });
    });

  program
    .command('employee:agents:sync')
    .description('为所有员工创建或更新 Claude Agent 映射')
    .option('-s, --scope <scope>', 'scope: user | project', 'project')
    .action((options) => {
      const db = getDatabase();
      const service = new EmployeeAgentService(db);
      const employees = db.getAllEmployees();
      const scope = options.scope === 'user' ? 'user' : 'project';

      if (employees.length === 0) {
        console.log(`\n暂无员工\n`);
        return;
      }

      console.log(`\n🔄 正在同步 ${employees.length} 名员工的 Claude Agent 映射...\n`);
      employees.forEach((employee) => {
        try {
          const mapping = service.ensureEmployeeAgent(employee.id, { scope, cwd: process.cwd() });
          console.log(`✅ ${employee.name} -> ${mapping.agent_name}`);
        } catch (error: any) {
          console.log(`❌ ${employee.name} -> ${error.message}`);
        }
      });
      console.log();
    });
}

function statusEmoji(status: string): string {
  const emojis: Record<string, string> = {
    excellent: '🌟',
    good: '✓',
    average: '○',
    poor: '△',
    failing: '✗',
  };
  return emojis[status] || '•';
}

function statusText(status: string): string {
  const texts: Record<string, string> = {
    excellent: '优秀',
    good: '良好',
    average: '一般',
    poor: '较差',
    failing: '失败',
  };
  return texts[status] || status;
}
