/**
 * AI Company v3 - Employee Recruiter
 *
 * 员工招募器
 *
 * 职责：
 * 1. 根据任务需求自动招募新员工
 * 2. 检测并解雇表现差的员工
 * 3. 支持员工学习新技能
 * 4. 员工绩效评估和优化
 */

import type { Employee, Task, TaskResult, Review } from './types.js';
import { getAIProvider } from './ai/AIProvider.js';
import { EmployeeFactory } from './Employee.js';
import { generateId } from './utils.js';
import { getDatabase, getDatabaseSync } from './database/index.js';
import { EventEmitter } from 'eventemitter3';

// ============================================================================
// Types
// ============================================================================

export interface RecruitmentConfig {
  // 最大员工数量
  maxEmployees: number;
  // 最小绩效分数（低于此分数考虑解雇）
  minPerformance: number;
  // 招募阈值：连续失败多少次后考虑招募新员工
  recruitmentThreshold: number;
  // 解雇阈值：连续失败多少次后解雇
  firingThreshold: number;
}

export interface SkillGapAnalysis {
  hasEmployee: boolean;
  requiredSkills: string[];
  availableSkills: string[];
  missingSkills: string[];
  suggestedRole: string;
  shouldRecruit: boolean;
  confidence: number;
}

// ============================================================================
// Employee Recruiter
// ============================================================================

export class EmployeeRecruiter extends EventEmitter {
  private aiProvider = getAIProvider();
  private db?: ReturnType<typeof getDatabaseSync>;

  // 员工失败计数
  private employeeFailures = new Map<string, number>();

  // 任务失败计数（按技能需求）
  private skillFailures = new Map<string, number>();

  // 配置
  private config: RecruitmentConfig;

  constructor(config?: Partial<RecruitmentConfig>) {
    super();

    this.config = {
      maxEmployees: 10,
      minPerformance: 30,
      recruitmentThreshold: 3,
      firingThreshold: 5,
      ...config,
    };

    this.tryInitDatabase();
  }

  /**
   * 尝试初始化数据库
   */
  private tryInitDatabase(): void {
    try {
      this.db = getDatabaseSync();
    } catch (error: any) {
      console.log('[EmployeeRecruiter] Database not yet initialized');
    }
  }

  /**
   * 分析技能缺口
   *
   * @param requiredCapabilities 任务需要的能力
   * @param currentEmployees 当前员工列表
   * @returns 技能缺口分析结果
   */
  async analyzeSkillGap(
    requiredCapabilities: string[],
    currentEmployees: Employee[]
  ): Promise<SkillGapAnalysis> {
    console.log(`[EmployeeRecruiter] Analyzing skill gap for: ${requiredCapabilities.join(', ')}`);

    // 收集所有可用技能
    const availableSkills = new Set<string>();
    for (const emp of currentEmployees) {
      for (const skill of emp.skills) {
        availableSkills.add(skill);
      }
      for (const cap of emp.capabilities) {
        availableSkills.add(cap);
      }
    }

    // 检查是否有员工具备所需技能
    const hasEmployee = currentEmployees.some(emp => {
      const empSkills = new Set([...emp.skills, ...emp.capabilities]);
      return requiredCapabilities.some(cap => empSkills.has(cap));
    });

    // 找出缺失的技能
    const missingSkills = requiredCapabilities.filter(
      cap => !availableSkills.has(cap)
    );

    // 使用 LLM 判断是否需要招募
    let shouldRecruit = missingSkills.length > 0;
    let suggestedRole = '通用员工';
    let confidence = 0.7;

    if (missingSkills.length > 0 && this.aiProvider) {
      try {
        const systemPrompt = `你是 AI Company 的人力资源专家。

请分析技能需求，返回 JSON 格式：
{
  "shouldRecruit": true/false,
  "suggestedRole": "建议的职位名称",
  "confidence": 0.8,
  "reasoning": "分析理由"
}

判断标准：
- 缺失核心技能 → 应该招募
- 有相似技能可替代 → 暂不招募
- 员工数量已达上限 → 不招募`;

        const userPrompt = `需要的能力：${requiredCapabilities.join(', ')}
可用技能：${Array.from(availableSkills).join(', ')}
缺失技能：${missingSkills.join(', ')}
当前员工数：${currentEmployees.length}/${this.config.maxEmployees}

请分析是否需要招募新员工。`;

        const response = await this.aiProvider.prompt(userPrompt, systemPrompt);
        const content = typeof response.content === 'string'
          ? response.content
          : response.getText?.() || JSON.stringify(response.content);

        const result = JSON.parse(content);

        shouldRecruit = result.shouldRecruit;
        suggestedRole = result.suggestedRole || '通用员工';
        confidence = result.confidence || 0.7;
      } catch (error: any) {
        console.warn('[EmployeeRecruiter] LLM analysis failed, using fallback:', error.message);
      }
    }

    return {
      hasEmployee,
      requiredSkills: requiredCapabilities,
      availableSkills: Array.from(availableSkills),
      missingSkills,
      suggestedRole,
      shouldRecruit,
      confidence,
    };
  }

  /**
   * 招募新员工
   *
   * @param role 职位名称
   * @param skills 所需技能
   * @returns 新创建的员工
   */
  async recruitEmployee(role: string, skills: string[]): Promise<Employee> {
    console.log(`[EmployeeRecruiter] Recruiting new employee: ${role}`);

    // 检查员工数量限制
    if (this.db) {
      const allEmployees = this.db.getAllEmployees();
      if (allEmployees.length >= this.config.maxEmployees) {
        throw new Error(`Employee limit reached (${this.config.maxEmployees})`);
      }
    }

    // 生成员工名称
    const name = `${role}_${this.generateEmployeeNumber()}`;

    // 创建新员工
    const employee = EmployeeFactory.createCustomEmployee(name, role, skills);

    // 持久化到数据库
    if (this.db) {
      try {
        this.db.insertEmployee({
          id: employee.id,
          name: employee.name,
          role: employee.role,
          skills: employee.skills,
          level: employee.level,
          performance: employee.performance,
          satisfaction: employee.satisfaction,
          systemPrompt: employee.systemPrompt,
          capabilities: employee.capabilities,
          createdAt: employee.createdAt,
        });
        console.log(`[EmployeeRecruiter] Employee ${employee.id} saved to database`);
      } catch (error: any) {
        console.error('[EmployeeRecruiter] Failed to save employee:', error.message);
      }
    }

    // 发出招募事件
    this.emit('employee.recruited', {
      type: 'employee.recruited',
      timestamp: Date.now(),
      data: { employeeId: employee.id, name, role, skills },
    });

    console.log(`[EmployeeRecruiter] Recruited: ${employee.name} (${role})`);

    return employee;
  }

  /**
   * 自动招募（基于技能缺口分析）
   *
   * @param requiredCapabilities 所需能力
   * @param currentEmployees 当前员工
   * @returns 新招募的员工（如果有）
   */
  async autoRecruit(
    requiredCapabilities: string[],
    currentEmployees: Employee[]
  ): Promise<Employee | null> {
    // 分析技能缺口
    const analysis = await this.analyzeSkillGap(requiredCapabilities, currentEmployees);

    if (!analysis.shouldRecruit) {
      console.log('[EmployeeRecruiter] No recruitment needed');
      return null;
    }

    // 记录技能失败
    for (const skill of analysis.missingSkills) {
      const count = this.skillFailures.get(skill) || 0;
      this.skillFailures.set(skill, count + 1);

      if (count + 1 >= this.config.recruitmentThreshold) {
        // 达到招募阈值，创建新员工
        console.log(`[EmployeeRecruiter] Skill "${skill}" failed ${count + 1} times, recruiting...`);

        const newEmployee = await this.recruitEmployee(
          analysis.suggestedRole,
          analysis.missingSkills
        );

        // 重置失败计数
        this.skillFailures.delete(skill);

        return newEmployee;
      }
    }

    return null;
  }

  /**
   * 评估员工绩效
   *
   * @param employee 员工
   * @param review 复盘结果
   * @returns 是否应该解雇
   */
  evaluatePerformance(employee: Employee, review: Review): boolean {
    // 检查绩效分数
    if (employee.performance < this.config.minPerformance) {
      console.warn(`[EmployeeRecruiter] ${employee.name} performance below threshold: ${employee.performance}`);
      return true;
    }

    // 检查复盘评分
    if (review.score < 4) {
      const failures = this.employeeFailures.get(employee.id) || 0;
      this.employeeFailures.set(employee.id, failures + 1);

      if (failures + 1 >= this.config.firingThreshold) {
        console.warn(`[EmployeeRecruiter] ${employee.name} failed ${failures + 1} times, considering firing`);
        return true;
      }
    } else {
      // 重置失败计数
      this.employeeFailures.delete(employee.id);
    }

    return false;
  }

  /**
   * 解雇员工
   *
   * @param employeeId 员工ID
   * @param reason 解雇原因
   */
  async fireEmployee(employeeId: string, reason: string): Promise<void> {
    console.log(`[EmployeeRecruiter] Firing employee ${employeeId}: ${reason}`);

    // 从数据库删除（软删除：标记为非活跃）
    if (this.db) {
      try {
        // 实际应该使用软删除，这里简化为直接删除
        // TODO: 实现 soft delete
        console.log(`[EmployeeRecruiter] Employee ${employeeId} would be removed from database`);
      } catch (error: any) {
        console.error('[EmployeeRecruiter] Failed to fire employee:', error.message);
      }
    }

    // 清理失败计数
    this.employeeFailures.delete(employeeId);

    // 发出解雇事件
    this.emit('employee.fired', {
      type: 'employee.fired',
      timestamp: Date.now(),
      data: { employeeId, reason },
    });

    console.log(`[EmployeeRecruiter] Employee ${employeeId} fired`);
  }

  /**
   * 让员工学习新技能
   *
   * @param employee 员工
   * @param newSkills 新技能列表
   */
  async trainEmployee(employee: Employee, newSkills: string[]): Promise<void> {
    console.log(`[EmployeeRecruiter] Training ${employee.name}: ${newSkills.join(', ')}`);

    // 调用员工的 evolve 方法
    if (employee.evolve) {
      employee.evolve(newSkills);
    } else {
      // 手动添加技能
      for (const skill of newSkills) {
        if (!employee.skills.includes(skill)) {
          employee.skills.push(skill);
        }
      }
    }

    // 更新数据库
    if (this.db) {
      try {
        this.db.updateEmployee(employee.id, {
          skills: employee.skills,
        });
      } catch (error: any) {
        console.error('[EmployeeRecruiter] Failed to update employee skills:', error.message);
      }
    }

    // 发出事件
    this.emit('employee.trained', {
      type: 'employee.trained',
      timestamp: Date.now(),
      data: { employeeId: employee.id, newSkills },
    });
  }

  /**
   * 根据复盘结果推荐技能学习
   *
   * @param review 复盘结果
   * @returns 推荐学习的技能
   */
  async recommendSkillsFromReview(review: Review): Promise<string[]> {
    // 从改进点中提取技能建议
    const skillSuggestions: string[] = [];

    // 使用 LLM 分析
    if (this.aiProvider) {
      try {
        const systemPrompt = `你是 AI Company 的培训专家。

请从任务复盘中提取需要学习的技能，返回 JSON 格式：
{
  "skills": ["技能1", "技能2", "技能3"],
  "reasoning": "分析理由"
}

技能提取原则：
- 从改进点中提取技能需求
- 优先提取可复用的技能
- 避免过于宽泛的描述`;

        const userPrompt = `改进点：${review.improvements.join(', ')}
经验教训：${review.learnings.join(', ')}

请提取需要学习的技能。`;

        const response = await this.aiProvider.prompt(userPrompt, systemPrompt);
        const content = typeof response.content === 'string'
          ? response.content
          : response.getText?.() || JSON.stringify(response.content);

        const result = JSON.parse(content);
        skillSuggestions.push(...(result.skills || []));
      } catch (error: any) {
        console.warn('[EmployeeRecruiter] LLM skill extraction failed:', error.message);
      }
    }

    // Fallback: 从改进点中简单提取
    if (skillSuggestions.length === 0) {
      for (const improvement of review.improvements) {
        // 简单的关键词提取
        const keywords = improvement.match(/需要?([^，。,.\s]+)/g);
        if (keywords) {
          skillSuggestions.push(...keywords.map(k => k.replace(/需要?/g, '')));
        }
      }
    }

    return [...new Set(skillSuggestions)]; // 去重
  }

  /**
   * 获取员工招募统计
   */
  getStats(): {
    totalFailures: number;
    failuresByEmployee: Map<string, number>;
    failuresBySkill: Map<string, number>;
  } {
    let totalFailures = 0;

    for (const count of this.employeeFailures.values()) {
      totalFailures += count;
    }

    for (const count of this.skillFailures.values()) {
      totalFailures += count;
    }

    return {
      totalFailures,
      failuresByEmployee: new Map(this.employeeFailures),
      failuresBySkill: new Map(this.skillFailures),
    };
  }

  /**
   * 重置失败计数
   */
  resetFailureCounters(): void {
    this.employeeFailures.clear();
    this.skillFailures.clear();
    console.log('[EmployeeRecruiter] Failure counters reset');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * 生成员工编号
   */
  private generateEmployeeNumber(): number {
    if (!this.db) {
      return Date.now() % 10000;
    }

    try {
      const employees = this.db.getAllEmployees();
      return employees.length + 1;
    } catch (error: any) {
      return Date.now() % 10000;
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let recruiterInstance: EmployeeRecruiter | null = null;

export function getEmployeeRecruiter(): EmployeeRecruiter {
  if (!recruiterInstance) {
    recruiterInstance = new EmployeeRecruiter();
  }
  return recruiterInstance;
}

export function resetEmployeeRecruiter(): void {
  recruiterInstance = null;
}
