/**
 * AI Company CLI - Config Commands
 *
 * 配置管理
 */

import { Command } from 'commander';
import { getDatabase } from '../../../infrastructure/database/index.js';
import { getConfigService, getPaths } from '../../../infrastructure/config/index.js';
import { getEnvVarService } from '../../../infrastructure/env/index.js';

export function registerConfigCommands(program: Command): void {
  // ============================================================================
  // config:set - 设置配置
  // ============================================================================

  program
    .command('config:set <key> <value>')
    .description('设置配置项')
    .option('-t, --type <type>', '类型 (string|number|boolean|json|text|file)', 'string')
    .option('-d, --description <desc>', '描述')
    .option('-c, --category <category>', '类别')
    .action(async (key, value, options) => {
      const db = getDatabase();
      const config = getConfigService(db);

      // 解析 category.key 格式
      let actualKey = key;
      let actualCategory = options.category;

      if (key.includes('.') && !options.category) {
        const parts = key.split('.');
        actualCategory = parts[0];
        actualKey = parts.slice(1).join('.');
      }

      let parsedValue: string | number | boolean | object = value;

      // 根据类型解析值
      switch (options.type) {
        case 'number':
          parsedValue = Number(value);
          break;
        case 'boolean':
          parsedValue = value === 'true';
          break;
        case 'json':
          try {
            parsedValue = JSON.parse(value);
          } catch {
            console.error('\n❌ JSON 格式无效\n');
            process.exit(1);
          }
          break;
      }

      config.set(actualKey, {
        value: parsedValue,
        type: options.type,
        description: options.description,
        category: actualCategory,
      });

      console.log(`\n✅ 配置已设置: ${actualCategory ? actualCategory + '.' : ''}${actualKey} = ${value}\n`);
    });

  // ============================================================================
  // config:get - 获取配置
  // ============================================================================

  program
    .command('config:get <key>')
    .description('获取配置项')
    .action(async (key) => {
      const db = getDatabase();
      const config = getConfigService(db);

      // 解析 category.key 格式
      let actualKey = key;
      let actualCategory: string | undefined;

      if (key.includes('.')) {
        const parts = key.split('.');
        actualCategory = parts[0];
        actualKey = parts.slice(1).join('.');
      }

      // 构造完整的 key 用于查找 (category 作为前缀)
      const fullKey = actualCategory ? `${actualCategory}.${actualKey}` : actualKey;

      const item = config.getItem(fullKey);
      if (!item) {
        console.log(`\n❌ 配置不存在: ${key}\n`);
        return;
      }

      console.log(`\n📋 ${fullKey}`);
      console.log(`   值: ${JSON.stringify(item.value)}`);
      console.log(`   类型: ${item.type}`);
      console.log(`   类别: ${item.category}`);
      if (item.description) console.log(`   描述: ${item.description}`);
      console.log('');
    });

  // ============================================================================
  // config:list - 列出配置
  // ============================================================================

  program
    .command('config:list')
    .description('列出所有配置')
    .option('-c, --category <category>', '按类别筛选')
    .action(async (options) => {
      const db = getDatabase();
      const config = getConfigService(db);

      let configs;
      if (options.category) {
        configs = config.getByCategory(options.category);
      } else {
        configs = config.getAll();
      }

      console.log(`\n📋 配置列表 (${configs.length})\n`);

      if (configs.length === 0) {
        console.log('  暂无配置\n');
        return;
      }

      // 按类别分组
      const grouped: Record<string, typeof configs> = {};
      for (const item of configs) {
        if (!grouped[item.category]) {
          grouped[item.category] = [];
        }
        grouped[item.category].push(item);
      }

      for (const [category, items] of Object.entries(grouped)) {
        console.log(`【${category}】`);
        for (const item of items) {
          const displayValue = typeof item.value === 'object'
            ? JSON.stringify(item.value).slice(0, 50)
            : String(item.value).slice(0, 50);
          console.log(`  ${item.key} = ${displayValue}`);
        }
        console.log('');
      }
    });

  // ============================================================================
  // config:delete - 删除配置
  // ============================================================================

  program
    .command('config:delete <key>')
    .description('删除配置项')
    .action(async (key) => {
      const db = getDatabase();
      const config = getConfigService(db);

      const deleted = config.delete(key);
      if (deleted) {
        console.log(`\n✅ 已删除配置: ${key}\n`);
      } else {
        console.log(`\n❌ 配置不存在: ${key}\n`);
      }
    });

  // ============================================================================
  // env:set - 设置环境变量
  // ============================================================================

  program
    .command('env:set <key> <value>')
    .description('设置全局环境变量')
    .option('-t, --type <type>', '类型 (text|filepath)', 'text')
    .option('-d, --description <desc>', '描述')
    .action(async (key, value, options) => {
      const db = getDatabase();
      const env = getEnvVarService(db);

      if (options.type !== 'text' && options.type !== 'filepath') {
        console.log(`\n❌ 无效类型: ${options.type}\n`);
        return;
      }

      env.set(key, {
        type: options.type,
        value,
        description: options.description,
      });

      console.log(`\n✅ 环境变量已设置: ${key}\n`);
      if (options.type === 'filepath') {
        console.log(`   类型: filepath (存储文件路径，不读取内容)`);
        console.log(`   路径: ${value}\n`);
      }
    });

  // ============================================================================
  // env:get - 获取环境变量
  // ============================================================================

  program
    .command('env:get <key>')
    .description('获取环境变量')
    .action(async (key) => {
      const db = getDatabase();
      const env = getEnvVarService(db);
      const item = env.get(key);
      if (!item) {
        console.log(`\n❌ 环境变量不存在: ${key}\n`);
        return;
      }

      console.log(`\n📋 ${item.key}`);
      console.log(`   类型: ${item.type}`);
      if (item.type === 'filepath') {
        console.log(`   路径: ${item.value}`);
        console.log(`   说明: 这是文件路径，使用时需自行读取文件内容`);
      } else {
        console.log(`   值: ${item.value}`);
      }
      if (item.description) console.log(`   描述: ${item.description}`);
      console.log('');
    });

  // ============================================================================
  // env:list - 列出环境变量
  // ============================================================================

  program
    .command('env:list')
    .description('列出全局环境变量')
    .action(async () => {
      const db = getDatabase();
      const env = getEnvVarService(db);
      const items = env.list();

      console.log(`\n📋 环境变量列表 (${items.length})\n`);

      if (items.length === 0) {
        console.log('  暂无环境变量\n');
        return;
      }

      for (const item of items) {
        let displayValue: string;
        if (item.type === 'filepath') {
          displayValue = `[filepath] ${item.value}`;
        } else {
          displayValue = item.value.length > 8
            ? `${item.value.slice(0, 4)}****${item.value.slice(-4)}`
            : item.value;
        }
        console.log(`  ${item.key} = ${displayValue} (${item.type})`);
      }
      console.log('');
    });

  // ============================================================================
  // env:delete - 删除环境变量
  // ============================================================================

  program
    .command('env:delete <key>')
    .description('删除环境变量')
    .action(async (key) => {
      const db = getDatabase();
      const env = getEnvVarService(db);
      const deleted = env.delete(key);
      if (deleted) {
        console.log(`\n✅ 已删除环境变量: ${key}\n`);
      } else {
        console.log(`\n❌ 环境变量不存在: ${key}\n`);
      }
    });

  // ============================================================================
  // company:name - 设置公司名称
  // ============================================================================

  program
    .command('company:name <name>')
    .description('设置公司名称')
    .action(async (name) => {
      const db = getDatabase();
      const config = getConfigService(db);

      config.set('company.name', {
        value: name,
        description: '公司名称',
      });

      console.log(`\n🏢 公司名称已设置为: ${name}\n`);
      console.log('提示: 公司名称将显示在所有 AI 交互中\n');
    });

  // ============================================================================
  // company:info - 显示公司信息
  // ============================================================================

  program
    .command('company:info')
    .description('显示公司信息')
    .action(async () => {
      const db = getDatabase();
      const config = getConfigService(db);
      const paths = getPaths(db);

      const name = config.get('company.name', 'AI Company');
      const version = config.get('company.version', '1.0.0');

      console.log(`\n🏢 ${name}\n`);
      console.log(`版本: ${version}`);

      // 使用 Paths 显示路径
      paths.display();

      // 统计信息
      const employees = db.getAllEmployees();
      const tasks = db.getAllTasks();
      const workflows = db.getAllWorkflows();

      console.log(`📊 当前状态:`);
      console.log(`   员工: ${employees.length} 人`);
      console.log(`   任务: ${tasks.length} 个`);
      console.log(`   工作流: ${workflows.length} 个\n`);
    });
}
