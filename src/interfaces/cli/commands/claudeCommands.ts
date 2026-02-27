/**
 * AI Company CLI - Claude Commands
 *
 * 管理 Claude CLI 的技能、MCP、Agent 等
 */

import { Command } from 'commander';
import { getClaudeCLIManager, type SkillInfo } from '../../../infrastructure/claude/index.js';

export function registerClaudeCommands(program: Command): void {
  const manager = getClaudeCLIManager();

  // ============================================================================
  // Plugin Commands
  // ============================================================================

  const pluginCmd = program
    .command('plugin')
    .description('管理 Claude 技能插件');

  pluginCmd
    .command('list')
    .description('列出已安装的技能')
    .action(() => {
      const skills = manager.listPlugins();
      console.log(`\n🔌 已安装技能 (${skills.length})\n`);

      if (skills.length === 0) {
        console.log(`  暂无技能`);
        console.log(`\n提示: 运行 'ai-company plugin install <skill>' 安装技能`);
        return;
      }

      // 按市场分组
      const byMarketplace = new Map<string, SkillInfo[]>();
      for (const skill of skills) {
        const market = skill.marketplace || 'other';
        if (!byMarketplace.has(market)) {
          byMarketplace.set(market, []);
        }
        byMarketplace.get(market)!.push(skill);
      }

      for (const [market, skills] of byMarketplace) {
        console.log(`${market}:`);
        skills.forEach(skill => {
          const status = skill.status === 'enabled' ? '✔' : '✘';
          console.log(`  ${status} ${skill.name} (${skill.scope})`);
        });
        console.log();
      }
    });

  pluginCmd
    .command('install <plugin>')
    .description('安装技能')
    .option('-s, --scope <scope>', '安装范围', 'user')
    .action((plugin, options) => {
      console.log(`\n🔧 安装技能: ${plugin}`);
      console.log(`   范围: ${options.scope}\n`);

      try {
        const result = manager.installPlugin(plugin, options.scope);
        console.log(result);
      } catch (error: any) {
        console.error(`\n❌ 安装失败: ${error.message}`);
      }
    });

  pluginCmd
    .command('enable <plugin>')
    .description('启用技能')
    .action((plugin) => {
      console.log(`\n🔓 启用技能: ${plugin}\n`);
      try {
        const result = manager.enablePlugin(plugin);
        console.log(result);
      } catch (error: any) {
        console.error(`\n❌ 启用失败: ${error.message}`);
      }
    });

  pluginCmd
    .command('disable <plugin>')
    .description('禁用技能')
    .action((plugin) => {
      console.log(`\n🔒 禁用技能: ${plugin}\n`);
      try {
        const result = manager.disablePlugin(plugin);
        console.log(result);
      } catch (error: any) {
        console.error(`\n❌ 禁用失败: ${error.message}`);
      }
    });

  pluginCmd
    .command('uninstall <plugin>')
    .description('卸载技能')
    .action((plugin) => {
      console.log(`\n🗑️  卸载技能: ${plugin}\n`);
      try {
        const result = manager.uninstallPlugin(plugin);
        console.log(result);
      } catch (error: any) {
        console.error(`\n❌ 卸载失败: ${error.message}`);
      }
    });

  pluginCmd
    .command('search <query>')
    .description('搜索可用技能（通过 npm）')
    .action((query) => {
      console.log(`\n🔍 搜索技能: ${query}\n`);
      try {
        const results = manager.searchSkills(query);
        console.log(results);
      } catch (error: any) {
        console.error(`\n❌ 搜索失败: ${error.message}`);
      }
    });

  // ============================================================================
  // MCP Commands
  // ============================================================================

  const mcpCmd = program
    .command('mcp')
    .description('管理 MCP 服务器');

  mcpCmd
    .command('list')
    .description('列出 MCP 服务器')
    .action(() => {
      console.log(`\n🔌 MCP 服务器\n`);
      try {
        const result = manager.listMCP();
        console.log(result);
      } catch (error: any) {
        console.error(`\n❌ 查询失败: ${error.message}`);
      }
    });

  mcpCmd
    .command('add <name> <command>')
    .description('添加 MCP 服务器')
    .option('-t, --transport <type>', '传输类型: stdio, http, sse')
    .action((name, command, options) => {
      console.log(`\n➕ 添加 MCP 服务器: ${name}`);
      console.log(`   命令: ${command}`);
      console.log(`   传输: ${options.transport || 'auto'}\n`);

      try {
        const result = manager.addMCP(name, command);
        console.log(result);
      } catch (error: any) {
        console.error(`\n❌ 添加失败: ${error.message}`);
      }
    });

  mcpCmd
    .command('remove <name>')
    .description('移除 MCP 服务器')
    .action((name) => {
      console.log(`\n➖ 移除 MCP 服务器: ${name}\n`);
      try {
        const result = manager.removeMCP(name);
        console.log(result);
      } catch (error: any) {
        console.error(`\n❌ 移除失败: ${error.message}`);
      }
    });

  // ============================================================================
  // Agent Commands
  // ============================================================================

  const agentCmd = program
    .command('agent')
    .description('管理 Claude Agent');

  agentCmd
    .command('use <agent> <prompt>')
    .description('使用指定的 Agent')
    .action(async (agent, prompt) => {
      console.log(`\n🤖 使用 Agent: ${agent}`);
      console.log(`   提示: ${prompt}\n`);

      try {
        const response = await manager.useAgent(agent, prompt);
        console.log(`\n${response}`);
      } catch (error: any) {
        console.error(`\n❌ 执行失败: ${error.message}`);
      }
    });

  // ============================================================================
  // Test Commands
  // ============================================================================

  const testCmd = program
    .command('test')
    .description('测试 Claude CLI 连接');

  testCmd
    .command('ping')
    .description('测试 Claude 是否可用')
    .action(async () => {
      console.log(`\n🏓 测试 Claude CLI...\n`);
      try {
        const response = await manager.prompt('Hello! Please respond with "PONG"');
        if (response.includes('PONG')) {
          console.log(`✓ Claude CLI 工作正常`);
        } else {
          console.log(`⚠️  Claude CLI 可用但响应异常`);
          console.log(`\n响应: ${response}`);
        }
      } catch (error: any) {
        console.error(`❌ Claude CLI 不可用`);
        console.error(`\n错误: ${error.message}`);
        if (error.message?.includes('API key')) {
          console.error(`\n提示: 请设置 ANTHROPIC_API_KEY 环境变量`);
        }
      }
    });

  testCmd
    .command('prompt <text>')
    .description('发送测试提示词')
    .action(async (text) => {
      console.log(`\n💬 发送提示词...\n`);
      console.log(`> ${text}\n`);

      try {
        const response = await manager.prompt(text);
        console.log(`\n${response}`);
      } catch (error: any) {
        console.error(`\n❌ 失败: ${error.message}`);
      }
    });

  testCmd
    .command('json <prompt>')
    .description('测试 JSON 输出')
    .option('--schema <schema>', 'JSON Schema')
    .action(async (prompt, options) => {
      console.log(`\n📋 测试 JSON 输出...\n`);

      try {
        const response = await manager.promptJSON(prompt, {
          jsonSchema: options.schema ? JSON.parse(options.schema) : undefined,
        });
        console.log(`\n${JSON.stringify(response, null, 2)}`);
      } catch (error: any) {
        console.error(`\n❌ 失败: ${error.message}`);
      }
    });
}
