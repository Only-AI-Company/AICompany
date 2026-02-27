import { getClaudeCLIManager } from '../../infrastructure/claude/index.js';
import type { AIDatabase } from '../../infrastructure/database/index.js';
import { CronRepository } from '../../infrastructure/cron/CronRepository.js';
import { getCronService } from '../../infrastructure/cron/index.js';
import type { CronJob } from '../../infrastructure/cron/types.js';
import { validateCronRule } from '../../infrastructure/cron/utils.js';
import { getPaths } from '../../infrastructure/config/index.js';
import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { getEnvVarService } from '../../infrastructure/env/index.js';

export type ScriptRuntime = 'bash' | 'node' | 'python';

export type ScheduleType = 'once' | 'cron' | 'interval';

export interface ScriptSchedule {
  type: ScheduleType;
  cron?: string;
  intervalMs?: number;
  timezone?: string;
  startAt?: string;
}

export interface ScriptBuildRequest {
  requirement: string;
  runtime?: ScriptRuntime;
  filename?: string;
  schedule?: ScriptSchedule;
  providedInfo?: Record<string, string>;
  autoRun?: boolean;
  cronId?: string;
  workDir?: string;
}

export interface ScriptBuildResult {
  name: string;
  description: string;
  runtime: ScriptRuntime;
  filename: string;
  content?: string;
  runCommand: string;
  workDir: string;
  schedule?: ScriptSchedule;
  dependencies?: string[];
}

export interface ScriptAnalysisResult {
  summary: string;
  suggestedRuntime: ScriptRuntime;
  suggestedSchedule: ScriptSchedule;
  considerations?: string[];
}

export interface ScriptProductionResult {
  name?: string;
  description?: string;
  runtime?: ScriptRuntime;
  filename?: string;
  content?: string;
  dependencies?: string[];
  executionHints?: string[];
  schedulingHints?: {
    isCronCandidate?: boolean;
    recommendedCronRule?: string;
    immediateRunReason?: string;
  };
}

export interface ScriptCronDecision {
  name?: string;
  description?: string;
  command?: string;
  args?: Record<string, any>;
  cronRule?: string;
  enabled?: boolean;
  timeout?: number;
  workingDir?: string;
  env?: Record<string, string>;
  required_configs?: string[];
}

export interface ScriptDecisionResult {
  action: 'run' | 'cron';
  reason: string;
  cronRule?: string;
  name?: string;
  description?: string;
  timeout?: number;
  args?: Record<string, any>;
  env?: Record<string, string>;
  cron?: ScriptCronDecision;
}

export interface ScriptExecutionResult {
  action: 'run' | 'cron';
  workDir: string;
  runCommand: string;
  cronJob?: CronJob;
  output?: string;
  error?: string;
}

export interface ScriptBuildOutcome {
  analysis: ScriptAnalysisResult;
  script: ScriptBuildResult;
  decision: ScriptDecisionResult;
  execution: ScriptExecutionResult;
}

export class ScriptBuilder {
  constructor(
    private db?: AIDatabase,
    private claude = getClaudeCLIManager()
  ) {}

  async build(request: ScriptBuildRequest): Promise<ScriptBuildResult> {
    const runtime = request.runtime ?? 'bash';
    const schedule = request.schedule;
    const workDir = this.resolveWorkDir(request);
    const prompt = this.buildPrompt(request.requirement, runtime, schedule, workDir, request.providedInfo);
    const response = await this.claude.prompt(prompt, { print: true });
    const parsed = this.parseResponse(response);
    return this.normalizeResult(parsed, request, workDir);
  }

  async buildOneTime(requirement: string, runtime?: ScriptRuntime): Promise<ScriptBuildResult> {
    return this.build({ requirement, runtime, schedule: { type: 'once' } });
  }

  async buildScheduled(requirement: string, schedule: ScriptSchedule, runtime?: ScriptRuntime): Promise<ScriptBuildResult> {
    return this.build({ requirement, runtime, schedule });
  }

  async buildAndDecide(request: ScriptBuildRequest): Promise<ScriptBuildOutcome> {
    const analysis = await this.analyzeRequirement(request);
    const workDir = this.resolveWorkDir(request);
    const productionResult = await this.handoffToProducer(request, analysis, workDir);
    const script = this.buildFromProductionResult(request, analysis, productionResult, workDir);
    const decision = await this.decideExecution(request, analysis, script, productionResult);
    const execution = await this.executeDecision(request, script, decision);
    return { analysis, script, decision, execution };
  }

  private buildPrompt(
    requirement: string,
    runtime: ScriptRuntime,
    schedule: ScriptSchedule | undefined,
    workDir: string,
    providedInfo?: Record<string, string>
  ): string {
    const scheduleHint = schedule
      ? `调度类型: ${schedule.type}
${schedule.type === 'cron' ? `cron: ${schedule.cron || '未指定'}` : ''}
${schedule.type === 'interval' ? `intervalMs: ${schedule.intervalMs || '未指定'}` : ''}
${schedule.timezone ? `timezone: ${schedule.timezone}` : ''}`
      : '调度类型: once';

    return `你是脚本构建 agent。根据需求输出可执行脚本方案，必须输出 JSON。

需求:
${requirement}

用户补充信息:
${this.formatProvidedInfo(providedInfo)}

约束:
- 运行时: ${runtime}
- 工作目录: ${workDir}
- 输出必须包含脚本文件名与脚本内容
- 仅生成一个脚本文件，所以你需要精简代码和参数、方法命名等
- 保持脚本自包含，避免不必要依赖
- 如果是定时任务，给出 cron 或 intervalMs

${scheduleHint}

输出 JSON 格式:
{
  "name": "脚本名称",
  "description": "脚本用途描述",
  "runtime": "bash|node|python",
  "filename": "文件名含扩展名",
  "content": "完整脚本内容",
  "dependencies": ["可选依赖1", "可选依赖2"],
  "schedule": {
    "type": "once|cron|interval",
    "cron": "cron 表达式(可选)",
    "intervalMs": 3600000,
    "timezone": "可选时区",
    "startAt": "可选 ISO 时间"
  }
}`;
  }

  private parseResponse(response: string): any {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }
    const raw = jsonMatch[1] || jsonMatch[0];
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private normalizeResult(parsed: any, request: ScriptBuildRequest, workDir: string): ScriptBuildResult {
    const runtime = this.normalizeRuntime(parsed?.runtime || request.runtime || 'bash');
    const filename = parsed?.filename || request.filename || this.defaultFilename(runtime);
    const content = this.ensureShebang(runtime, parsed?.content || this.defaultContent(runtime, request.requirement));
    const schedule = this.normalizeSchedule(parsed?.schedule, request.schedule);

    return {
      name: parsed?.name || 'script',
      description: parsed?.description || request.requirement,
      runtime,
      filename,
      content,
      runCommand: this.buildRunCommand(runtime, filename),
      workDir,
      schedule,
      dependencies: Array.isArray(parsed?.dependencies) ? parsed.dependencies : undefined,
    };
  }

  private normalizeRuntime(runtime: string): ScriptRuntime {
    if (runtime === 'node' || runtime === 'python' || runtime === 'bash') {
      return runtime;
    }
    return 'bash';
  }

  private normalizeSchedule(parsed?: any, fallback?: ScriptSchedule): ScriptSchedule | undefined {
    const candidate = parsed || fallback;
    if (!candidate) return undefined;
    const type = candidate.type as ScheduleType | undefined;
    if (type !== 'once' && type !== 'cron' && type !== 'interval') {
      return undefined;
    }
    const schedule: ScriptSchedule = { type };
    if (type === 'cron') {
      schedule.cron = candidate.cron || '0 9 * * *';
      if (candidate.timezone) schedule.timezone = candidate.timezone;
      if (candidate.startAt) schedule.startAt = candidate.startAt;
    }
    if (type === 'interval') {
      schedule.intervalMs = candidate.intervalMs || 3600000;
      if (candidate.startAt) schedule.startAt = candidate.startAt;
    }
    return schedule;
  }

  private defaultFilename(runtime: ScriptRuntime): string {
    const ext = runtime === 'python' ? 'py' : runtime === 'node' ? 'js' : 'sh';
    return `script.${ext}`;
  }

  private buildRunCommand(runtime: ScriptRuntime, filename: string): string {
    if (runtime === 'python') return `python3 ${filename}`;
    if (runtime === 'node') return `node ${filename}`;
    return `bash ${filename}`;
  }

  private defaultContent(runtime: ScriptRuntime, requirement: string): string {
    if (runtime === 'python') {
      return `#!/usr/bin/env python3
print("TODO: ${this.escapeForString(requirement)}")`;
    }
    if (runtime === 'node') {
      return `#!/usr/bin/env node
console.log("TODO: ${this.escapeForString(requirement)}");`;
    }
    return `#!/usr/bin/env bash
echo "TODO: ${this.escapeForString(requirement)}"`;
  }

  private escapeForString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private async analyzeRequirement(request: ScriptBuildRequest): Promise<ScriptAnalysisResult> {
    const info = this.formatProvidedInfo(request.providedInfo);
    const schedule = request.schedule;
    const scheduleHint = schedule
      ? `类型: ${schedule.type}${schedule.cron ? `, cron=${schedule.cron}` : ''}${schedule.intervalMs ? `, intervalMs=${schedule.intervalMs}` : ''}`
      : '未指定';

    const prompt = `你是脚本专家。用户提供的信息如下，输出 JSON 分析：

用户需求:
${request.requirement}

用户信息:
${info}

用户指定运行时: ${request.runtime || '未指定'}
用户指定调度: ${scheduleHint}

输出 JSON:
{
  "summary": "脚本方案摘要",
  "suggestedRuntime": "bash|node|python",
  "suggestedSchedule": {
    "type": "once|cron|interval",
    "cron": "cron 表达式(可选)",
    "intervalMs": 3600000,
    "timezone": "可选时区"
  },
  "considerations": ["注意点1", "注意点2"]
}`;

    const response = await this.claude.prompt(prompt, { print: true });
    const parsed = this.parseResponse(response);
    const suggestedRuntime = this.normalizeRuntime(parsed?.suggestedRuntime || request.runtime || 'bash');
    const suggestedSchedule = this.normalizeSchedule(parsed?.suggestedSchedule, request.schedule) || { type: 'once' };
    return {
      summary: parsed?.summary || request.requirement,
      suggestedRuntime,
      suggestedSchedule,
      considerations: Array.isArray(parsed?.considerations) ? parsed.considerations : undefined,
    };
  }

  private async handoffToProducer(
    request: ScriptBuildRequest,
    analysis: ScriptAnalysisResult,
    workDir: string
  ): Promise<ScriptProductionResult> {
    const prompt = this.buildScriptProductionPrompt(request, analysis, workDir);
    const response = await this.claude.prompt(prompt, {
      print: true,
      quietMode: true,
      cwd: workDir,
    });
    const parsed = this.parseResponse(response);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed as ScriptProductionResult;
  }

  private buildScriptProductionPrompt(
    request: ScriptBuildRequest,
    analysis: ScriptAnalysisResult,
    workDir: string
  ): string {
    return `你是资深脚本专家。请在指定工作目录内产出脚本，并输出 JSON。

需求:
${request.requirement}

用户补充信息:
${this.formatProvidedInfo(request.providedInfo)}

AI 分析摘要:
${analysis.summary}

建议运行时: ${analysis.suggestedRuntime}
建议调度: ${analysis.suggestedSchedule.type}${analysis.suggestedSchedule.cron ? ` ${analysis.suggestedSchedule.cron}` : ''}${analysis.suggestedSchedule.intervalMs ? ` ${analysis.suggestedSchedule.intervalMs}` : ''}

工作目录: ${workDir}

要求:
- 产出一个脚本文件
- 在工作目录内生成脚本
- 不要在 JSON 中返回脚本内容
- 返回脚本入口文件名与运行方式
- 尽量避免外部依赖

输出 JSON:
{
  "name": "脚本名称",
  "description": "脚本用途描述",
  "runtime": "bash|node|python",
  "filename": "文件名含扩展名",
  "dependencies": ["可选依赖1", "可选依赖2"],
  "executionHints": ["运行方式提示1", "运行方式提示2"],
  "schedulingHints": {
    "isCronCandidate": true,
    "recommendedCronRule": "cron 表达式(可选)",
    "immediateRunReason": "立即运行原因(可选)"
  }
}`;
  }

  private buildFromProductionResult(
    request: ScriptBuildRequest,
    analysis: ScriptAnalysisResult,
    productionResult: ScriptProductionResult,
    workDir: string
  ): ScriptBuildResult {
    const runtime = this.normalizeRuntime(productionResult.runtime || request.runtime || analysis.suggestedRuntime || 'bash');
    const filename = productionResult.filename || request.filename || this.defaultFilename(runtime);
    const content = productionResult.content
      ? this.ensureShebang(runtime, productionResult.content)
      : undefined;
    const schedule = this.normalizeSchedule(request.schedule, analysis.suggestedSchedule);

    return {
      name: productionResult.name || 'script',
      description: productionResult.description || request.requirement,
      runtime,
      filename,
      content,
      runCommand: this.buildRunCommand(runtime, filename),
      workDir,
      schedule,
      dependencies: Array.isArray(productionResult.dependencies) ? productionResult.dependencies : undefined,
    };
  }

  private async decideExecution(
    request: ScriptBuildRequest,
    analysis: ScriptAnalysisResult,
    script: ScriptBuildResult,
    productionResult: ScriptProductionResult
  ): Promise<ScriptDecisionResult> {
    const cronSchema = `
crontab 表字段:
id, name, description, command, args_json, cron_rule, enabled, next_run, last_run,
run_count, fail_count, last_output, last_error, timeout, working_dir, env_json,
created_at, updated_at

cron_executions 表字段:
id, cron_id, started_at, completed_at, exit_code, signal, output, error, timeout
`;

    // 获取所有可用配置
    const availableConfigs = this.db
      ? this.db.prepare('SELECT key, value, category, description FROM config ORDER BY category, key').all() as any[]
      : [];

    const configList = availableConfigs.length > 0
      ? availableConfigs.map(c => `• ${c.key}: ${c.description || '(无描述)'}`).join('\n')
      : '（暂无配置）';

    const prompt = `你是调度决策专家。根据脚本信息决定立即运行还是保存为 cron。

用户需求:
${request.requirement}

脚本方案摘要:
${analysis.summary}

脚本信息:
名称: ${script.name}
描述: ${script.description}
运行时: ${script.runtime}
文件名: ${script.filename}
运行方式: ${script.runCommand}
工作目录: ${script.workDir}
调度建议: ${script.schedule?.type || 'once'} ${script.schedule?.cron || ''} ${script.schedule?.intervalMs || ''}

执行建议:
执行提示: ${(productionResult.executionHints || []).join(' | ') || '无'}
调度提示: ${productionResult.schedulingHints ? JSON.stringify(productionResult.schedulingHints) : '无'}

## 可用配置
${configList}

${cronSchema}

输出 JSON:
{
  "action": "run|cron",
  "reason": "原因",
  "cron": {
    "name": "cron 任务名称",
    "description": "cron 描述(可选)",
    "command": "执行命令(相对工作目录)",
    "args": {"key": "value"},
    "cronRule": "cron 表达式",
    "enabled": true,
    "timeout": 300,
    "workingDir": "工作目录(可选)",
    "env": {"KEY": "VALUE"},
    "required_configs": ["配置key1", "配置key2"]
  }
}

注意：
1. 如果脚本需要某些配置才能运行，必须在 cron.required_configs 中列出
2. env 中的值应该使用 "{{配置key}}" 格式引用配置，例如 {"TELEGRAM_BOT_TOKEN": "{{telegram.bot_token}}"}
3. required_configs 列出的配置必须存在于上面的"可用配置"列表中
4. 如果需要用户提供的值（如 chat_id），使用 "{{user_input:提示文字}}" 格式`;

    const response = await this.claude.prompt(prompt, { print: true });
    const parsed = this.parseResponse(response);
    const action = parsed?.action === 'cron' ? 'cron' : 'run';
    const cron = parsed?.cron && typeof parsed.cron === 'object' ? parsed.cron : undefined;
    return {
      action,
      reason: parsed?.reason || '未提供原因',
      cronRule: cron?.cronRule ?? parsed?.cronRule,
      name: cron?.name ?? parsed?.name,
      description: cron?.description ?? parsed?.description,
      timeout: typeof (cron?.timeout ?? parsed?.timeout) === 'number' ? (cron?.timeout ?? parsed?.timeout) : undefined,
      args: (cron?.args && typeof cron.args === 'object') ? cron.args : (parsed?.args && typeof parsed.args === 'object' ? parsed.args : undefined),
      env: (cron?.env && typeof cron.env === 'object') ? cron.env : (parsed?.env && typeof parsed.env === 'object' ? parsed.env : undefined),
      cron: cron ? {
        name: cron.name,
        description: cron.description,
        command: cron.command,
        args: cron.args,
        cronRule: cron.cronRule,
        enabled: cron.enabled,
        timeout: cron.timeout,
        workingDir: cron.workingDir,
        env: cron.env,
      } : undefined,
    };
  }

  private async executeDecision(
    request: ScriptBuildRequest,
    script: ScriptBuildResult,
    decision: ScriptDecisionResult
  ): Promise<ScriptExecutionResult> {
    if (decision.action === 'cron') {
      return this.saveCron(script, decision);
    }
    this.persistScript(script, script.workDir);
    return this.runOnce(script, request.autoRun === true);
  }

  private async saveCron(script: ScriptBuildResult, decision: ScriptDecisionResult): Promise<ScriptExecutionResult> {
    if (!this.db) {
      return {
        action: 'cron',
        workDir: script.workDir,
        runCommand: script.runCommand,
      };
    }

    const cronDecision = decision.cron;

    // ========== 配置验证 ==========
    const requiredConfigs = cronDecision?.required_configs || [];
    const missingConfigs: string[] = [];
    const userInputsNeeded: string[] = [];

    // 获取现有配置
    const existingConfigs = new Set<string>();
    const configRows = this.db.prepare('SELECT key FROM config').all() as any[];
    for (const row of configRows) {
      existingConfigs.add(row.key);
    }

    // 检查 required_configs
    for (const configKey of requiredConfigs) {
      if (configKey.startsWith('user_input:')) {
        // 需要用户输入
        userInputsNeeded.push(configKey);
      } else if (!existingConfigs.has(configKey)) {
        // 配置不存在
        missingConfigs.push(configKey);
      }
    }

    // 如果有缺失配置，返回错误信息
    if (missingConfigs.length > 0 || userInputsNeeded.length > 0) {
      let errorMsg = '⚠️ 脚本缺少必要配置，请先添加：\n\n';

      if (missingConfigs.length > 0) {
        errorMsg += '缺少以下配置项：\n';
        for (const key of missingConfigs) {
          errorMsg += `  • ${key}\n`;
        }
        errorMsg += `\n请使用以下命令添加：\n`;
        for (const key of missingConfigs) {
          errorMsg += `  ai-company config set ${key} <值>\n`;
        }
      }

      if (userInputsNeeded.length > 0) {
        errorMsg += '\n需要以下信息：\n';
        for (const input of userInputsNeeded) {
          const prompt = input.replace('user_input:', '');
          errorMsg += `  • ${prompt}\n`;
        }
        errorMsg += `\n请在需求中提供这些信息，例如："每10分钟提醒我到 chat_id=123456"`;
      }

      throw new Error(errorMsg);
    }

    // 解析环境变量，处理 {{配置key}} 引用
    const env = cronDecision?.env || {};
    const resolvedEnv: Record<string, string> = {};

    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        const ref = value.slice(2, -2);
        if (ref.startsWith('user_input:')) {
          throw new Error(`需要用户输入: ${ref.replace('user_input:', '')}。请在需求中提供此信息。`);
        }
        // 从配置表读取
        const configValue = this.db.prepare('SELECT value FROM config WHERE key = ?').get(ref);
        if (!configValue) {
          throw new Error(`配置项 ${ref} 不存在`);
        }
        resolvedEnv[key] = (configValue as any).value;
      } else {
        resolvedEnv[key] = value as string;
      }
    }

    // ========== 保存 cron 任务 ==========
    const repository = new CronRepository(this.db);
    const cronRule = this.resolveCronRule(cronDecision?.cronRule ?? decision.cronRule, script.schedule);
    const validation = validateCronRule(cronRule);
    const safeCronRule = validation.valid ? cronRule : '0 9 * * *';

    const cronCommand = cronDecision?.command || `./${script.filename}`;
    const desiredWorkDir = cronDecision?.workingDir || script.workDir;
    if (!existsSync(desiredWorkDir)) {
      mkdirSync(desiredWorkDir, { recursive: true });
    }

    const job = repository.create({
      name: cronDecision?.name || decision.name || script.name,
      description: cronDecision?.description || decision.description || script.description,
      command: cronCommand,
      args: cronDecision?.args || decision.args,
      cronRule: safeCronRule,
      enabled: cronDecision?.enabled ?? true,
      timeout: cronDecision?.timeout ?? decision.timeout,
      workingDir: desiredWorkDir,
      env: resolvedEnv,
    });

    const workDir = job.workingDir || desiredWorkDir;
    if (!job.workingDir) {
      repository.update(job.id, { workingDir: workDir });
    }
    this.persistScript(script, workDir);
    const cronService = getCronService(this.db);
    cronService.schedule({
      id: job.id,
      name: job.name,
      description: job.description,
      command: job.command,
      args: job.args,
      cronRule: job.cronRule ?? undefined,
      enabled: job.enabled,
      timeout: job.timeout,
      workingDir: workDir,
      env: resolvedEnv,
    });

    return {
      action: 'cron',
      workDir,
      runCommand: cronCommand,
      cronJob: { ...job, workingDir: workDir },
    };
  }

  private async runOnce(script: ScriptBuildResult, autoRun: boolean): Promise<ScriptExecutionResult> {
    if (!autoRun) {
      return {
        action: 'run',
        workDir: script.workDir,
        runCommand: script.runCommand,
      };
    }

    const { exitCode, stdout, stderr } = await this.executeCommand(script.workDir, script.runCommand);
    return {
      action: 'run',
      workDir: script.workDir,
      runCommand: script.runCommand,
      output: stdout,
      error: exitCode === 0 ? undefined : stderr || `exitCode:${exitCode}`,
    };
  }

  private executeCommand(workDir: string, commandLine: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const parts = commandLine.split(' ').filter(Boolean);
      const command = parts[0];
      const args = parts.slice(1);
      const globalEnv = this.db ? getEnvVarService(this.db).buildEnv() : {};
      const child = spawn(command, args, { cwd: workDir, env: { ...process.env, ...globalEnv } });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (data) => { stdout += data.toString(); });
      child.stderr?.on('data', (data) => { stderr += data.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        resolve({ exitCode: code ?? 0, stdout: stdout.trim(), stderr: stderr.trim() });
      });
    });
  }

  private resolveCronRule(rule?: string, schedule?: ScriptSchedule): string {
    if (rule) return rule;
    if (schedule?.type === 'cron' && schedule.cron) return schedule.cron;
    if (schedule?.type === 'interval') return '*/30 * * * *';
    return '0 9 * * *';
  }

  private ensureWorkDir(cronId: string): string {
    const baseDir = this.db ? getPaths(this.db).getBaseDir() : process.cwd();
    const workDir = join(baseDir, 'wd', 'cron', cronId);
    if (!existsSync(workDir)) {
      mkdirSync(workDir, { recursive: true });
    }
    return workDir;
  }

  private resolveWorkDir(request: ScriptBuildRequest): string {
    if (request.workDir) {
      if (!existsSync(request.workDir)) {
        mkdirSync(request.workDir, { recursive: true });
      }
      return request.workDir;
    }
    const cronId = request.cronId ?? this.generateTempCronId();
    return this.ensureWorkDir(cronId);
  }

  private generateTempCronId(): string {
    return `cron-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private ensureShebang(runtime: ScriptRuntime, content: string): string {
    const trimmed = content.trimStart();
    if (trimmed.startsWith('#!')) {
      return content;
    }
    const shebang = runtime === 'python'
      ? '#!/usr/bin/env python3'
      : runtime === 'node'
        ? '#!/usr/bin/env node'
        : '#!/usr/bin/env bash';
    return `${shebang}\n${content}`;
  }

  private persistScript(script: ScriptBuildResult, workDir: string): void {
    if (!existsSync(workDir)) {
      mkdirSync(workDir, { recursive: true });
    }
    const filePath = join(workDir, script.filename);
    if (script.content && script.content.trim().length > 0) {
      writeFileSync(filePath, script.content, 'utf-8');
      chmodSync(filePath, 0o755);
      return;
    }
    if (!existsSync(filePath)) {
      throw new Error(`脚本文件不存在: ${filePath}`);
    }
    chmodSync(filePath, 0o755);
  }

  private formatProvidedInfo(info?: Record<string, string>): string {
    if (!info || Object.keys(info).length === 0) {
      return '未提供额外信息';
    }
    return Object.entries(info).map(([k, v]) => `- ${k}: ${v}`).join('\n');
  }
}
