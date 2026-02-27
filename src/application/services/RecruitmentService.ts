import type { AIDatabase } from '../../infrastructure/database/index.js';
import type { HumanProfile, CreateHumanInput } from '../../types/human.js';
import { getClaudeCLIManager } from '../../infrastructure/claude/index.js';
import { HumanService } from './HumanService.js';

export class RecruitmentService {
  private humanService: HumanService;

  constructor(
    private db: AIDatabase,
    private claude = getClaudeCLIManager()
  ) {
    this.humanService = new HumanService(db);
  }

  findHuman(criteria: {
    name?: string;
    gender?: 'male' | 'female' | 'other';
    skills?: string[];
    personalityTraits?: string[];
    hobbies?: string[];
    weaknesses?: string[];
  }): HumanProfile | undefined {
    return this.humanService.findHuman(criteria);
  }

  async findOrCreateHuman(role: string, context?: string): Promise<HumanProfile> {
    const byRole = this.humanService.findHuman({ skills: [role] });
    if (byRole) return byRole;
    const input = await this.generateHumanByAI(role, context);
    return this.humanService.createHuman(input);
  }

  /**
   * 招募员工（别名方法，兼容性）
   */
  async recruit(role: string, context?: string): Promise<{ id: string; name: string; role: string }> {
    const human = await this.findOrCreateHuman(role, context);
    // 创建员工
    const employee = this.db.createEmployee({
      name: human.name,
      nickname: human.name,
      role: role,
      model: 'claude-sonnet-4-5-20250929',
    });

    // 添加技能
    for (const skill of human.skills || []) {
      // 技能可能已存在，使用 cacheSkill
      try {
        this.db.cacheSkill({
          id: skill,
          name: skill,
          category: 'general',
          description: `技能：${skill}`,
          system_prompt: '',
          version: '1.0',
        });
      } catch {}
      try {
        this.db.addEmployeeSkill(employee.id, { name: skill, version: '1.0' });
      } catch {}
    }

    return {
      id: employee.id,
      name: employee.name,
      role: employee.role,
    };
  }

  private async generateHumanByAI(role: string, context?: string): Promise<CreateHumanInput> {
    const requirement = context ? `招聘要求：${context}` : '招聘要求：无';
    const prompt = `你是资深招聘专家。

岗位：${role}
${requirement}

请生成一个真实可信、能力超预期的人类候选人档案，必须满足岗位需求。

输出 JSON：
{
  "name": "姓名（2-3个字）",
  "gender": "male/female/other",
  "personalityTraits": ["特质1","特质2","特质3"],
  "hobbies": ["爱好1","爱好2"],
  "workPreferences": {
    "preferredHours": "9-18",
    "communicationStyle": "direct/diplomatic/minimal",
    "workEnvironment": "quiet/collaborative/flexible"
  },
  "skills": ["技能1","技能2","技能3"],
  "weaknesses": ["弱点1","弱点2"],
  "notes": "一句话补充说明"
}

要求：
- 姓名真实，不要用张三李四
- 技能与岗位强相关
- 性格特质要体现高潜力与高执行力
- 文字精简`;

    try {
      const response = await this.claude.prompt(prompt, { print: false });
      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
    } catch {
    }

    return {
      name: '候选人',
      gender: 'other',
      personalityTraits: ['高潜力', '执行力强', '自驱'],
      hobbies: ['阅读', '运动'],
      workPreferences: {
        preferredHours: '9-18',
        communicationStyle: 'direct',
        workEnvironment: 'collaborative',
      },
      skills: [role],
      weaknesses: ['过于追求完美'],
      notes: '默认候选人',
    };
  }
}
