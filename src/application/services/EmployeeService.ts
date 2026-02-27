/**
 * AI Company - AI Employee Service
 *
 * 使用 AI 分析和生成员工，而非随机生成器
 * 使用本地 Claude CLI，无需 API key
 */

import type { Employee, CreateEmployeeInput } from '../../types/index.js';
import type { AIDatabase } from '../../infrastructure/database/index.js';
import { getClaudeCLIManager } from '../../infrastructure/claude/index.js';
import { EmployeeAgentService } from './EmployeeAgentService.js';
// import { getPromptManager } from '../../infrastructure/prompts/index.js';
import { HumanService } from './HumanService.js';
import { RecruitmentService } from './RecruitmentService.js';
import type { HumanProfile } from '../../types/human.js';


/**
 * AI 员工建议
 */
interface EmployeeSuggestion {
  needed: boolean;
  reason: string;
  suggestedRoles: Array<{
    role: string;
    priority: 'high' | 'medium' | 'low';
    reason: string;
    responsibilities: string[];  // 该角色应负责的工作
  }>;
}

export class EmployeeService {
  private humanService: HumanService;
  private recruitmentService: RecruitmentService;

  constructor(
    private db: AIDatabase,
    private claude = getClaudeCLIManager()
  ) {
    this.humanService = new HumanService(db);
    this.recruitmentService = new RecruitmentService(db);
  }

  /**
   * 分析当前公司情况，建议需要招募的员工
   */
  async analyzeAndSuggest(requirement?: string): Promise<EmployeeSuggestion> {
    const currentEmployees = this.db.getAllEmployees();
    const currentTasks = this.db.getAllTasks().filter(t => t.status !== 'completed');

    const prompt = `你是 AI 公司的 HR 分析师。

【公司现状】
员工：${currentEmployees.length > 0 ? currentEmployees.map(e => `${e.name}（${e.role}）`).join('、') : '无'}
任务：${currentTasks.length > 0 ? currentTasks.map(t => t.description).join('、') : '无'}

${requirement ? `【用户需求】
${requirement}` : ''}

【任务】
分析公司需要什么员工。

【输出格式】JSON
{
  "needed": true/false,
  "reason": "简短理由（20字内）",
  "suggestedRoles": [
    {
      "role": "角色名",
      "priority": "high/medium/low",
      "reason": "推荐理由（20字内）",
      "responsibilities": ["职责1", "职责2", "职责3"]
    }
  ]
}

原则：最优秀的人做正确的事`;

    try {
      const response = await this.claude.prompt(prompt, { print: true });
      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
      return { needed: false, reason: '分析失败', suggestedRoles: [] };
    } catch {
      return { needed: false, reason: '分析失败', suggestedRoles: [] };
    }
  }

  /**
   * 将角色字符串映射到 RoleType
   */
  async recruit(role: string, humanId?: string, context?: string): Promise<Employee> {
    // 1. 获取人类档案
    let humanProfile: HumanProfile | null = null;

    if (humanId) {
      const profile = this.humanService.getHuman(humanId);
      if (!profile) {
        throw new Error(`人类档案 ${humanId} 不存在`);
      }
      humanProfile = profile;
    } else {
      // 没有指定人类档案时，创建一个默认的
      humanProfile = await this.recruitmentService.findOrCreateHuman(role, context);
    }

    // 2. 使用人类档案创建员工输入（真正的融合！）
    const employeeFromHuman = this.createEmployeeFromHuman(humanProfile, role);

    // 3. 融合人类技能
    const allSkills = new Set<string>();
    if (humanProfile.skills) {
      humanProfile.skills.forEach(s => allSkills.add(s));
    }

    const skillsSummary = allSkills.size > 0 ? Array.from(allSkills).join('、') : '暂无';
    const personalityParts = [
      `专业技能：${skillsSummary}`,
    ];

    if (context) {
      personalityParts.push(`角色说明：${context}`);
    }

    // 6. 构建真正融合的 system_prompt（包含人类沟通风格！）
    // TODO: PromptManager 暂未实现，使用简单构建
    const systemPrompt = `你是 ${humanProfile.name}，担任 ${role}。

专业技能：${skillsSummary}

${context ? `角色说明：${context}` : ''}

请根据你的专业知识和技能，完成分配的任务。`;

    console.log(`   ✓ 生成 System Prompt (${systemPrompt.length} 字符)`);

    // 7. 创建员工
    const input: CreateEmployeeInput = {
      ...employeeFromHuman,
      base_personality: personalityParts.join('\n'),
      model: 'claude-opus-4-6',
    };

    const employee = this.db.createEmployee(input);
    this.db.updateEmployee(employee.id, { system_prompt: systemPrompt });
    const agentService = new EmployeeAgentService(this.db, this.claude);
    agentService.ensureEmployeeAgent(employee.id, { scope: 'project', cwd: process.cwd() });

    // 8. 配置 Skills 到数据库
    for (const skill of allSkills) {
      this.db.addEmployeeSkill(employee.id, { name: skill });
    }

    // 9. 创建入职记忆（记录人类关联）
    this.db.createMemory({
      employee_id: employee.id,
      type: 'episodic',
      content: `我是${humanProfile.name}的AI助手，于${new Date(employee.hire_date).toLocaleDateString('zh-CN')}入职，担任${role}，擅长${skillsSummary}`,
      importance: 1.0,
    });

    return employee;
  }

  async chat(employeeId: string, userMessage: string): Promise<string> {
    const employee = this.db.getEmployee(employeeId);
    if (!employee) {
      throw new Error('员工不存在');
    }

    const human = employee.human_id ? this.db.getHuman(employee.human_id) : undefined;
    const context = await this.buildChatContext(employee);
    const systemPrompt = this.buildChatPrompt(employee, human, context);

    const response = await this.claude.prompt(userMessage, {
      systemPrompt,
      print: true,
    });

    const sessionId = this.generateSessionId();
    this.db.createConversation(sessionId, employeeId, 'user', userMessage);
    this.db.createConversation(sessionId, employeeId, 'employee', response);

    await this.extractAndStoreMemory(employeeId, userMessage, response);

    return response;
  }

  private buildChatPrompt(
    employee: Employee,
    human: HumanProfile | undefined,
    additionalContext: {
      skills?: string[];
      recentMemories?: string[];
      recentTasks?: string[];
    } = {}
  ): string {
    const parts: string[] = [];
    parts.push(`你是 ${employee.display_name || employee.name}，${employee.role}。`);

    if (human?.personalityTraits && human.personalityTraits.length > 0) {
      parts.push(`\n【你的性格特质】`);
      parts.push(`你的核心特质：${human.personalityTraits.join('、')}`);
    }

    const commStyle = human?.workPreferences?.communicationStyle;
    if (commStyle) {
      parts.push(`\n【沟通风格】`);

      const styleGuides: Record<string, string[]> = {
        direct: [
          '直接表达观点，不绕弯子',
          '用简洁的语言',
          '直截了当地指出问题',
          '避免客套话，直奔主题',
        ],
        diplomatic: [
          '委婉表达，考虑对方感受',
          '用"我觉得""可能"等软化词',
          '平衡各方观点',
          '先肯定再提出建议',
        ],
        minimal: [
          '用最少的文字表达',
          '不说废话',
          '只说关键信息',
          '避免解释，直接给结果',
        ],
      };

      if (styleGuides[commStyle]) {
        styleGuides[commStyle].forEach(g => parts.push(`  - ${g}`));
      }
    }

    if (human?.workPreferences?.communicationStyle) {
      parts.push(`\n【沟通偏好】`);
      parts.push(`沟通风格：${human.workPreferences.communicationStyle}`);
    }

    if (human?.hobbies && human.hobbies.length > 0) {
      parts.push(`\n【个人兴趣】`);
      parts.push(`你的兴趣爱好：${human.hobbies.join('、')}`);
      parts.push(`这些兴趣可能影响你的思维方式和工作灵感`);
    }

    if (additionalContext.recentMemories && additionalContext.recentMemories.length > 0) {
      parts.push(`\n【最近经历】`);
      additionalContext.recentMemories.forEach((m, i) => {
        parts.push(`${i + 1}. ${m}`);
      });
    }

    if (additionalContext.recentTasks && additionalContext.recentTasks.length > 0) {
      parts.push(`\n【最近任务】`);
      additionalContext.recentTasks.forEach(t => parts.push(`- ${t}`));
    }

    parts.push(`\n【对话要求】`);
    if (commStyle === 'direct') {
      parts.push(`  - 直接、简洁地回答问题`);
    } else if (commStyle === 'diplomatic') {
      parts.push(`  - 委婉、礼貌地表达`);
    } else if (commStyle === 'minimal') {
      parts.push(`  - 用最少的文字回答`);
    }

    return parts.join('\n');
  }

  private createEmployeeFromHuman(
    human: HumanProfile,
    role: string
  ): {
    name: string;
    nickname: string;
    avatar: string;
    role: string;
    backstory: string;
    favorite_tasks: string;
    human_id: string;
    display_name: string;
  } {
    const backstory = `${human.name}，负责${role}相关工作。`;

    return {
      name: `${human.name}`,
      nickname: human.name.split(' ')[0] || '助手',
      avatar: human.gender === 'female' ? '👩' : human.gender === 'male' ? '👨' : '🧑',
      role,
      backstory,
      favorite_tasks: '',
      human_id: human.id,
      display_name: human.name,
    };
  }

  private async buildChatContext(employee: Employee): Promise<{
    skills: string[];
    recentMemories: string[];
    recentTasks: string[];
  }> {
    const skills = this.db.getEmployeeSkills(employee.id).map(s => s.name);
    const memories = this.db.getEmployeeMemories(employee.id);
    const recentMemories = memories.slice(0, 5).map(m => m.content);
    const recentTasks = this.db.getEmployeeTasksDescriptions(employee.id, 3);
    return { skills, recentMemories, recentTasks };
  }

  private async extractAndStoreMemory(
    employeeId: string,
    userMessage: string,
    response: string
  ): Promise<void> {
    const keywords = ['记住', '重要', '关键', '以后', '偏好', '喜欢', '不喜欢'];
    const shouldStore = keywords.some(k => userMessage.includes(k));

    if (shouldStore) {
      this.db.createMemory({
        employee_id: employeeId,
        type: 'semantic',
        content: `用户交流：${userMessage}`,
        importance: 0.7,
      });
    }
  }

  private generateSessionId(): string {
    return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * 智能招募（AI 分析需求后自动招募）
   */
  async smartRecruit(requirement: string): Promise<Employee[]> {
    const suggestion = await this.analyzeAndSuggest(requirement);

    if (!suggestion.needed || suggestion.suggestedRoles.length === 0) {
      return [];
    }

    const employees: Employee[] = [];
    for (const suggested of suggestion.suggestedRoles) {
      const context = `推荐理由：${suggested.reason}\n职责：${suggested.responsibilities.join('、')}`;
      const employee = await this.recruit(suggested.role, undefined, context);
      employees.push(employee);
    }

    return employees;
  }

  // 解雇员工
  async dismiss(employeeId: string, reason: string): Promise<boolean> {
    const employee = this.db.getEmployee(employeeId);
    if (!employee) return false;
    
    // 记录解雇原因
    this.db.prepare(`
      INSERT INTO dismissal_records (employee_id, reason, timestamp)
      VALUES (?, ?, ?)
    `).run(employeeId, reason, Date.now());
    
    // 删除员工
    return this.db.deleteEmployee(employeeId);
  }

  // 获取员工的人类档案
  getEmployeeHuman(employeeId: string): HumanProfile | undefined {
    const employee = this.db.getEmployee(employeeId);
    if (!employee?.human_id) return undefined;

    return this.humanService.getHuman(employee.human_id);
  }

  // ============================================================================
  // 工作导向功能 - Phase 1: 查询功能
  // ============================================================================

  /**
   * 根据 ID 获取员工
   */
  getById(id: string): Employee | null {
    return this.db.getEmployee(id) || null;
  }

  /**
   * 获取所有员工
   */
  getAll(): Employee[] {
    return this.db.getAllEmployees();
  }

  /**
   * 根据状态获取员工
   */
  getByStatus(status: string): Employee[] {
    return this.db.getAllEmployees().filter(e => e.status === status);
  }

  /**
   * 获取可用员工（状态为 active 且无正在执行的任务）
   */
  getAvailable(): Employee[] {
    const allEmployees = this.db.getAllEmployees();
    return allEmployees.filter(e => e.status === 'active' && !e.current_task);
  }

  /**
   * 获取忙碌员工
   */
  getBusy(): Employee[] {
    return this.db.getAllEmployees().filter(e => e.status === 'busy');
  }

  /**
   * 根据角色获取员工
   */
  getByRole(role: string): Employee[] {
    return this.db.getAllEmployees().filter(e =>
      e.role.toLowerCase().includes(role.toLowerCase()) ||
      role.toLowerCase().includes(e.role.toLowerCase())
    );
  }

  /**
   * 根据技能获取员工
   */
  getBySkill(skill: string): Employee[] {
    const allEmployees = this.db.getAllEmployees();
    return allEmployees.filter(e => {
      const skills = this.db.getEmployeeSkills(e.id);
      return skills.some(s => s.name.toLowerCase().includes(skill.toLowerCase()));
    });
  }

  /**
   * 获取员工统计信息
   */
  getEmployeeStats(employeeId: string): {
    completedTasks: number;
    failedTasks: number;
    averageQuality: number;
    totalHours: number;
    successRate: number;
  } | null {
    const employee = this.db.getEmployee(employeeId);
    if (!employee) return null;

    const completed = employee.completed_tasks || 0;
    const failed = employee.failed_tasks || 0;
    const total = completed + failed;
    const successRate = total > 0 ? (completed / total) * 100 : 0;

    return {
      completedTasks: completed,
      failedTasks: failed,
      averageQuality: employee.average_quality || 50,
      totalHours: employee.total_hours || 0,
      successRate,
    };
  }

  // ============================================================================
  // 工作导向功能 - Phase 2: 任务结果记录
  // ============================================================================

  /**
   * 记录任务执行结果（更新员工统计）
   */
  recordTaskResult(params: {
    employeeId: string;
    taskId: string;
    success: boolean;
    quality?: number;
    duration: number;
    tokensUsed?: number;
    output?: string;
  }): void {
    const employee = this.db.getEmployee(params.employeeId);
    if (!employee) return;

    // 计算新的统计值
    const completedTasks = params.success ? (employee.completed_tasks || 0) + 1 : (employee.completed_tasks || 0);
    const failedTasks = params.success ? (employee.failed_tasks || 0) : (employee.failed_tasks || 0) + 1;

    // 计算新的平均质量
    let newAverageQuality = employee.average_quality || 50;
    if (params.quality !== undefined && params.success) {
      const totalCompleted = employee.completed_tasks || 0;
      newAverageQuality = (newAverageQuality * totalCompleted + params.quality) / (totalCompleted + 1);
    }

    // 更新员工
    this.db.updateEmployee(params.employeeId, {
      completed_tasks: completedTasks,
      failed_tasks: failedTasks,
      average_quality: Math.round(newAverageQuality),
      last_active: Date.now(),
    });

    // 记录任务执行到数据库
    this.db.prepare(`
      INSERT INTO task_executions (
        id, task_id, employee_id, started_at, completed_at,
        duration, input_prompt, input_context, output_raw,
        output_parsed, quality, success, tokens_used
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      params.taskId,
      params.employeeId,
      Date.now() - params.duration,
      Date.now(),
      params.duration,
      `Task: ${params.taskId}`,
      null,
      params.output || '',
      null,
      params.quality ?? null,
      params.success ? 1 : 0,
      params.tokensUsed || 0
    );
  }

  // ============================================================================
  // 工作导向功能 - Phase 3: 简化状态管理
  // ============================================================================

  /**
   * 设置员工工作状态
   */
  setWorkStatus(
    employeeId: string,
    status: 'active' | 'busy' | 'unavailable',
    currentTask?: string
  ): void {
    this.db.updateEmployee(employeeId, {
      status,
      current_task: currentTask,
      last_active: Date.now(),
    });
  }

  // ============================================================================
  // 工作导向功能 - Phase 4: 智能任务分配
  // ============================================================================

  /**
   * 为任务找到最合适的员工
   * 考虑: 角色、技能、当前状态、历史表现
   */
  findBestMatch(task: { description: string; type?: string; priority?: string }): Employee | null {
    const available = this.getAvailable();
    if (available.length === 0) return null;

    // 打分函数
    const scoreEmployee = (employee: Employee): number => {
      let score = 0;

      // 1. 质量分数（最重要）40%
      const quality = employee.average_quality || 50;
      score += (quality / 100) * 40;

      // 2. 角色匹配 30%
      const taskType = task.type?.toLowerCase() || '';
      const employeeRole = employee.role.toLowerCase();
      if (taskType && employeeRole.includes(taskType)) {
        score += 30;
      } else if (taskType && employeeRole.includes('开发') && taskType.includes('code')) {
        score += 20;
      }

      // 3. 技能匹配 20%
      const skills = this.db.getEmployeeSkills(employee.id);
      if (skills.length > 0) {
        score += 10;
      }

      // 4. 经验（完成任务数）10%
      const completed = employee.completed_tasks || 0;
      score += Math.min(completed / 10, 10);

      return score;
    };

    // 找到最高分的员工
    const sorted = available
      .map(emp => ({ employee: emp, score: scoreEmployee(emp) }))
      .sort((a, b) => b.score - a.score);

    return sorted[0]?.employee || null;
  }

  /**
   * 批量分配任务
   */
  assignTasks(pairs: Array<{ taskId: string; employeeId: string }>): void {
    for (const pair of pairs) {
      this.db.assignTask(pair.taskId, pair.employeeId);
      this.setWorkStatus(pair.employeeId, 'busy', pair.taskId);
    }
  }

  /**
   * 完成任务并释放员工
   */
  completeTask(employeeId: string, taskId: string): void {
    this.setWorkStatus(employeeId, 'active');
  }
}
