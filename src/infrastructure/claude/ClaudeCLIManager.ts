/**
 * AI Company - Claude CLI Manager
 *
 * 封装和管理 Claude CLI 的所有能力
 */

import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

/**
 * 技能信息
 */
export interface SkillInfo {
  name: string;
  version: string;
  scope: 'user' | 'project' | 'local';
  status: 'enabled' | 'disabled';
  marketplace?: string;
}

/**
 * MCP 服务器信息
 */
export interface MCPServerInfo {
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  command?: string;
  url?: string;
  enabled: boolean;
}

/**
 * Agent 定义
 */
export interface AgentDefinition {
  [key: string]: {
    description: string;
    prompt: string;
  };
}

export class ClaudeCLIManager {
  private claudePath: string;
  private configDir: string;
  private skillsDir: string;

  constructor() {
    this.claudePath = 'claude'; // assume in PATH
    this.configDir = join(homedir(), '.claude');
    this.skillsDir = join(this.configDir, 'skills');
  }

  private getUserConfigPath(): string {
    return join(this.configDir, 'config.json');
  }

  private getProjectConfigPath(cwd?: string): string {
    return join(cwd || process.cwd(), '.claude', 'config.json');
  }

  private getUserAgentsDir(): string {
    return join(this.configDir, 'agents');
  }

  private getProjectAgentsDir(cwd?: string): string {
    return join(cwd || process.cwd(), '.claude', 'agents');
  }

  getAgentConfigPath(scope: 'user' | 'project' = 'user', cwd?: string): string {
    return scope === 'project'
      ? this.getProjectConfigPath(cwd)
      : this.getUserConfigPath();
  }

  getAgentDir(scope: 'user' | 'project' = 'user', cwd?: string): string {
    return scope === 'project'
      ? this.getProjectAgentsDir(cwd)
      : this.getUserAgentsDir();
  }

  getAgentFilePath(scope: 'user' | 'project', agentName: string, cwd?: string): string {
    return join(this.getAgentDir(scope, cwd), `${agentName}.md`);
  }

  private readConfigFile(configPath: string): any {
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, 'utf-8'));
    }
    return {};
  }

  private writeConfigFile(configPath: string, config: any): void {
    const dir = dirname(configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  // ============================================================================
  // 基础命令
  // ============================================================================

  /**
   * 执行 Claude CLI 命令
   * 使用 spawnSync 避免 shell 解释问题
   */
  exec(args: string[], options: { print?: boolean; cwd?: string } = {}): string {
    const cmdArgs = [...args];

    // 注意：-p 标志表示从 stdin 读取，不与 prompt 参数一起使用
    // 如果有 prompt 参数（最后一个参数），直接传递给 claude 命令
    // 如果使用 -p，prompt 应该通过 stdin 传递

    // 清除可能导致冲突的环境变量
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;

    const result = spawnSync(this.claudePath, cmdArgs, {
      encoding: 'utf-8',
      shell: false,  // 不使用 shell，避免特殊字符被解释
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: options.cwd,  // 工作目录
      env: cleanEnv,     // 使用清除后的环境变量
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      const error = result.stderr || result.stdout || 'Unknown error';
      throw new Error(`Claude CLI failed: ${error}`);
    }

    return result.stdout || '';
  }

  /**
   * 发送提示词并获取响应
   */
  async prompt(prompt: string, options?: {
    print?: boolean;
    model?: string;
    agent?: string;
    /** 动态定义多个 agents */
    agents?: Record<string, { description: string; prompt: string }>;
    tools?: string[];
    systemPrompt?: string;
    jsonSchema?: object;
    outputFormat?: 'text' | 'json' | 'stream-json';
    /** 静默模式 - 使用自动权限模式跳过交互 */
    quietMode?: boolean;
    /** 工作目录 - Claude 在此目录下执行 */
    cwd?: string;
  }): Promise<string> {
    const args: string[] = [];

    if (options?.print) args.push('-p');
    if (options?.model) args.push('--model', options.model);

    // --agents 参数需要传递 JSON 字符串
    if (options?.agents && Object.keys(options.agents).length > 0) {
      args.push('--agents', JSON.stringify(options.agents));
    }

    if (options?.agent) args.push('--agent', options.agent);
    if (options?.tools) args.push('--tools', options.tools.join(','));
    if (options?.systemPrompt) args.push('--system-prompt', options.systemPrompt);
    if (options?.jsonSchema) args.push('--json-schema', JSON.stringify(options.jsonSchema));
    if (options?.outputFormat) args.push('--output-format', options.outputFormat);

    // 静默模式：使用自动权限模式
    if (options?.quietMode) {
      args.push('--permission-mode', 'acceptEdits');
    }

    args.push(prompt);

    // 注意：不再传递 print 选项给 exec()，因为 -p 参数已经在 args 中
    return this.exec(args, { cwd: options?.cwd });
  }

  /**
   * 发送提示词并期望 JSON 响应
   */
  async promptJSON<T>(prompt: string, options?: {
    model?: string;
    jsonSchema?: object;
  }): Promise<T> {
    const response = await this.prompt(prompt, {
      ...options,
      outputFormat: 'json',
    });

    // 尝试提取 JSON
    const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from response');
    }

    return JSON.parse(jsonMatch[1] || jsonMatch[0]);
  }

  // ============================================================================
  // Plugin 管理
  // ============================================================================

  /**
   * 列出已安装的插件
   */
  listPlugins(): SkillInfo[] {
    const output = this.exec(['plugin', 'list']);
    return this.parsePluginList(output);
  }

  /**
   * 安装插件
   */
  installPlugin(plugin: string, scope?: 'user' | 'project' | 'local'): string {
    const args = ['plugin', 'install'];
    if (scope) args.push('-s', scope);
    args.push(plugin);
    return this.exec(args);
  }

  /**
   * 启用插件
   */
  enablePlugin(plugin: string): string {
    return this.exec(['plugin', 'enable', plugin]);
  }

  /**
   * 禁用插件
   */
  disablePlugin(plugin: string): string {
    return this.exec(['plugin', 'disable', plugin]);
  }

  /**
   * 卸载插件
   */
  uninstallPlugin(plugin: string): string {
    return this.exec(['plugin', 'uninstall', plugin]);
  }

  /**
   * 更新插件
   */
  updatePlugin(plugin: string): string {
    return this.exec(['plugin', 'update', plugin]);
  }

  /**
   * 添加市场
   */
  addMarketplace(source: string): string {
    return this.exec(['plugin', 'marketplace', 'add', source]);
  }

  /**
   * 列出市场
   */
  listMarketplaces(): string {
    return this.exec(['plugin', 'marketplace', 'list']);
  }

  /**
   * 解析插件列表输出
   */
  private parsePluginList(output: string): SkillInfo[] {
    const lines = output.split('\n');
    const skills: SkillInfo[] = [];
    let currentSkill: Partial<SkillInfo> | null = null;

    for (const line of lines) {
      if (line.includes('Installed plugins:')) continue;
      if (line.includes('─')) continue;

      const skillMatch = line.match(/❯\s+([\w-@]+)\s+/);
      if (skillMatch) {
        if (currentSkill) {
          skills.push(currentSkill as SkillInfo);
        }
        currentSkill = {
          name: skillMatch[1],
          version: '',
          scope: 'user',
          status: 'enabled',
        };
      }

      const versionMatch = line.match(/Version:\s+(\S+)/);
      if (versionMatch && currentSkill) {
        currentSkill.version = versionMatch[1];
      }

      const scopeMatch = line.match(/Scope:\s+(\w+)/);
      if (scopeMatch && currentSkill) {
        currentSkill.scope = scopeMatch[1] as 'user' | 'project' | 'local';
      }

      const statusMatch = line.match(/Status:\s+(✔|✘)/);
      if (statusMatch && currentSkill) {
        currentSkill.status = statusMatch[1] === '✔' ? 'enabled' : 'disabled';
      }
    }

    if (currentSkill) {
      skills.push(currentSkill as SkillInfo);
    }

    return skills;
  }

  // ============================================================================
  // MCP 管理
  // ============================================================================

  /**
   * 列出 MCP 服务器
   */
  listMCP(): string {
    return this.exec(['mcp', 'list']);
  }

  /**
   * 添加 MCP 服务器
   */
  addMCP(name: string, commandOrUrl: string, args?: string[]): string {
    const cmdArgs = ['mcp', 'add', name, commandOrUrl];
    if (args) cmdArgs.push(...args);
    return this.exec(cmdArgs);
  }

  /**
   * 移除 MCP 服务器
   */
  removeMCP(name: string): string {
    return this.exec(['mcp', 'remove', name]);
  }

  /**
   * 获取 MCP 详情
   */
  getMCP(name: string): string {
    return this.exec(['mcp', 'get', name]);
  }

  // ============================================================================
  // 技能搜索
  // ============================================================================

  /**
   * 搜索可用技能
   */
  searchSkills(query: string): string {
    // 通过 npm 搜索官方技能
    try {
      const result = spawnSync('npm', ['search', query, 'keywords:claude-skill'], {
        encoding: 'utf-8',
        shell: false,
      });
      return result.stdout || '';
    } catch {
      return '';
    }
  }

  /**
   * 从已安装的技能中搜索
   */
  searchInstalledSkills(query: string): SkillInfo[] {
    const all = this.listPlugins();
    return all.filter(skill =>
      skill.name.toLowerCase().includes(query.toLowerCase())
    );
  }

  // ============================================================================
  // 配置管理
  // ============================================================================

  /**
   * 读取配置
   */
  readConfig(scope: 'user' | 'project' = 'user', cwd?: string): any {
    const configPath = scope === 'project'
      ? this.getProjectConfigPath(cwd)
      : this.getUserConfigPath();
    return this.readConfigFile(configPath);
  }

  /**
   * 写入配置
   */
  writeConfig(config: any, scope: 'user' | 'project' = 'user', cwd?: string): void {
    const configPath = scope === 'project'
      ? this.getProjectConfigPath(cwd)
      : this.getUserConfigPath();
    this.writeConfigFile(configPath, config);
  }

  // ============================================================================
  // Agent 管理
  // ============================================================================

  /**
   * 创建 Agent
   */
  createAgent(agents: AgentDefinition, scope: 'user' | 'project' = 'user', cwd?: string): void {
    const config = this.readConfig(scope, cwd);
    const mergedAgents = { ...(config.agents || {}), ...agents };
    this.writeConfig({ ...config, agents: mergedAgents }, scope, cwd);
  }

  listAgents(scope: 'user' | 'project' = 'user', cwd?: string): AgentDefinition {
    const dir = this.getAgentDir(scope, cwd);
    if (!existsSync(dir)) return {};
    const files = readdirSync(dir).filter(file => file.endsWith('.md'));
    const agents: AgentDefinition = {};
    files.forEach((file) => {
      const name = file.replace(/\.md$/, '');
      const content = readFileSync(join(dir, file), 'utf-8');
      let description = '';
      let prompt = content.trim();
      const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
      if (match) {
        const frontmatter = match[1];
        prompt = content.slice(match[0].length).trim();
        frontmatter.split('\n').forEach((line) => {
          const descMatch = line.match(/^description:\s*(.*)$/);
          if (descMatch) description = descMatch[1].trim();
        });
      }
      agents[name] = { description, prompt };
    });
    return agents;
  }

  upsertAgentDefinition(
    scope: 'user' | 'project',
    agentName: string,
    description: string,
    prompt: string,
    cwd?: string
  ): string {
    const configPath = scope === 'project'
      ? this.getProjectConfigPath(cwd)
      : this.getUserConfigPath();
    const config = this.readConfigFile(configPath);
    const agents = { ...(config.agents || {}) };
    agents[agentName] = { description, prompt };
    this.writeConfigFile(configPath, { ...config, agents });
    return configPath;
  }

  createAgentViaCommand(
    agentName: string,
    description: string,
    prompt: string,
    scope: 'user' | 'project' = 'project',
    cwd?: string
  ): string {
    const args = ['agents', 'create', agentName, '--description', description, '--prompt', prompt, '--scope', scope];
    try {
      return this.exec(args, { cwd });
    } catch {
      return this.exec(['agents/create', agentName, '--description', description, '--prompt', prompt, '--scope', scope], { cwd });
    }
  }

  /**
   * 使用 Agent
   */
  async useAgent(agentName: string, prompt: string): Promise<string> {
    return this.prompt(prompt, { agent: agentName });
  }

  // ============================================================================
  // 工具管理
  // ============================================================================

  /**
   * 设置可用工具
   */
  setTools(tools: string[]): string {
    return this.exec(['--tools', tools.join(',')], { print: false });
  }

  /**
   * 禁用所有工具
   */
  disableAllTools(): string {
    return this.exec(['--tools', ''], { print: false });
  }
}

// 单例
let managerInstance: ClaudeCLIManager | null = null;
export function getClaudeCLIManager(): ClaudeCLIManager {
  if (!managerInstance) {
    managerInstance = new ClaudeCLIManager();
  }
  return managerInstance;
}
