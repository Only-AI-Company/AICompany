/**
 * AI Company CLI - Employee Status Commands
 *
 * 工作导向的员工管理命令
 */

import { Command } from 'commander';
import { getDatabase } from '../../../infrastructure/database/index.js';
import { EmployeeService } from '../../../application/services/EmployeeService.js';

export function registerEmployeeStatusCommands(program: Command): void {
  // ============================================================================
  // employee:available - 查看可用员工
  // ============================================================================

  program
    .command('employee:available')
    .description('查看可用员工')
    .action(async () => {
      const db = getDatabase();
      const service = new EmployeeService(db);
      const available = service.getAvailable();

      console.log('\n🟢 可用员工 (' + available.length + ')\n');

      if (available.length === 0) {
        console.log('  暂无可用员工\n');
        return;
      }

      for (const emp of available) {
        const stats = service.getEmployeeStats(emp.id);
        console.log(`  ${emp.avatar} ${emp.name} (${emp.role})`);
        console.log(`     ID: ${emp.id}`);
        console.log(`     质量: ${stats?.averageQuality?.toFixed(0) || 'N/A'} | 完成: ${stats?.completedTasks || 0} | 成功率: ${stats?.successRate?.toFixed(0) || 'N/A'}%\n`);
      }
    });

  // ============================================================================
  // employee:stats - 查看员工统计
  // ============================================================================

  program
    .command('employee:stats [nameOrId]')
    .description('查看员工统计')
    .action(async (nameOrId) => {
      const db = getDatabase();
      const service = new EmployeeService(db);

      if (!nameOrId) {
        // 显示所有员工统计概览
        const all = service.getAll();
        console.log('\n📊 员工统计概览 (' + all.length + ')\n');

        console.log('  ' + '姓名'.padEnd(12) + '角色'.padEnd(12) + '状态'.padEnd(8) + '完成'.padEnd(6) + '失败'.padEnd(6) + '质量'.padEnd(8) + '成功率');
        console.log('  ' + '-'.repeat(70));
        for (const emp of all) {
          const stats = service.getEmployeeStats(emp.id);
          const status = emp.status === 'active' ? '🟢' : emp.status === 'busy' ? '🔴' : '⚫';
          console.log(
            '  ' +
            emp.name.padEnd(12) +
            emp.role.substring(0, 10).padEnd(12) +
            status.padEnd(8) +
            String(stats?.completedTasks || 0).padEnd(6) +
            String(stats?.failedTasks || 0).padEnd(6) +
            String(stats?.averageQuality?.toFixed(0) || 'N/A').padEnd(8) +
            String(stats?.successRate?.toFixed(0) + '%' || 'N/A')
          );
        }
        console.log('');
        return;
      }

      // 查找指定员工
      const byId = service.getById(nameOrId);
      const byName = service.getAll().find(e => e.name === nameOrId);
      const employee = byId || byName;

      if (!employee) {
        console.log(`\n❌ 员工不存在: ${nameOrId}\n`);
        return;
      }

      const stats = service.getEmployeeStats(employee.id);
      const skills = db.getEmployeeSkills(employee.id);

      console.log(`\n📊 ${employee.name} 统计\n`);
      console.log(`ID:        ${employee.id}`);
      console.log(`角色:      ${employee.role}`);
      console.log(`状态:      ${employee.status}`);
      console.log(`当前任务:  ${employee.current_task || '无'}\n`);

      console.log('任务统计:');
      console.log(`  完成:    ${stats?.completedTasks || 0}`);
      console.log(`  失败:    ${stats?.failedTasks || 0}`);
      console.log(`  质量分数: ${stats?.averageQuality?.toFixed(1) || 'N/A'}`);
      console.log(`  成功率:   ${stats?.successRate?.toFixed(1) || 'N/A'}%\n`);

      if (skills.length > 0) {
        console.log('技能:');
        for (const skill of skills) {
          console.log(`  - ${skill.name}`);
        }
        console.log('');
      }
    });

  // ============================================================================
  // employee:find - 为任务找最佳员工
  // ============================================================================

  program
    .command('employee:find <description>')
    .description('为任务找最佳员工')
    .option('--type <type>', '任务类型')
    .option('--priority <priority>', '优先级')
    .action(async (description, options) => {
      const db = getDatabase();
      const service = new EmployeeService(db);

      const task = {
        description,
        type: options.type,
        priority: options.priority,
      };

      console.log(`\n🔍 分析任务: ${description}\n`);

      const best = service.findBestMatch(task);

      if (!best) {
        console.log('❌ 没有可用的员工\n');
        return;
      }

      const stats = service.getEmployeeStats(best.id);
      const skills = db.getEmployeeSkills(best.id);

      console.log(`✅ 推荐员工: ${best.name}\n`);
      console.log(`  角色:      ${best.role}`);
      console.log(`  质量分数: ${stats?.averageQuality?.toFixed(0) || 'N/A'}`);
      console.log(`  完成任务:  ${stats?.completedTasks || 0}`);
      console.log(`  成功率:   ${stats?.successRate?.toFixed(0) || 'N/A'}%`);

      if (skills.length > 0) {
        console.log(`  技能:      ${skills.map(s => s.name).join(', ')}`);
      }
      console.log('');
    });

  // ============================================================================
  // employee:status - 设置员工状态
  // ============================================================================

  program
    .command('employee:status <nameOrId> <status>')
    .description('设置员工状态 (active/busy/unavailable)')
    .option('--task <taskId>', '当前任务ID')
    .action(async (nameOrId, status, options) => {
      const db = getDatabase();
      const service = new EmployeeService(db);

      const validStatuses = ['active', 'busy', 'unavailable'];
      if (!validStatuses.includes(status)) {
        console.log(`\n❌ 无效状态。可选: ${validStatuses.join(', ')}\n`);
        return;
      }

      const byId = service.getById(nameOrId);
      const byName = service.getAll().find(e => e.name === nameOrId);
      const employee = byId || byName;

      if (!employee) {
        console.log(`\n❌ 员工不存在: ${nameOrId}\n`);
        return;
      }

      service.setWorkStatus(employee.id, status as any, options.task);

      console.log(`\n✅ ${employee.name} 状态已更新: ${status}${options.task ? ` (任务: ${options.task})` : ''}\n`);
    });

  // ============================================================================
  // employee:complete - 完成任务并释放员工
  // ============================================================================

  program
    .command('employee:complete <employeeId> <taskId>')
    .description('完成任务并释放员工')
    .action(async (employeeId, taskId) => {
      const db = getDatabase();
      const service = new EmployeeService(db);

      const employee = service.getById(employeeId);
      if (!employee) {
        console.log(`\n❌ 员工不存在: ${employeeId}\n`);
        return;
      }

      service.completeTask(employeeId, taskId);

      console.log(`\n✅ ${employee.name} 已完成任务 ${taskId}\n`);
      console.log(`   状态: active (可用)\n`);
    });
}
