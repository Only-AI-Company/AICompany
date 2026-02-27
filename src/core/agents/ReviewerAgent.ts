import type { AIDatabase } from '../../infrastructure/database/index.js';
import type { Employee } from '../../types/index.js';
import { getClaudeCLIManager } from '../../infrastructure/claude/index.js';

export interface ReviewResult {
  overall: 'approved' | 'needs_revision' | 'rejected';
  score: number;
  feedback: string;
  issues: Array<{
    severity: 'critical' | 'major' | 'minor';
    category: string;
    description: string;
    location?: string;
  }>;
  suggestions: string[];
}

export class ReviewerAgent {
  constructor(
    private db: AIDatabase,
    private claude = getClaudeCLIManager()
  ) {}

  async reviewStep(requirement: string, workDir: string): Promise<ReviewResult> {
    const stepOutputs = this.getStepOutputs(workDir);

    // 分析任务类型
    const taskType = this.analyzeTaskType(requirement);

    const prompt = `# AI Company 质量验收系统

## 你的角色
你是 AI Company 的专业验收专家。你的职责是：
1. **严格验收**：根据需求评估产出质量
2. **发现问题**：识别所有潜在问题和风险
3. **提供反馈**：给出可执行的改进建议
4. **保证质量**：确保交付物达到可使用标准

## 任务信息
- **需求**: ${requirement}
- **任务类型**: ${taskType}

## 产出内容
${stepOutputs.map(o => `---\n${o}\n---`).join('\n\n')}

---

## 验收标准

### A. 功能完整性（30分）
- ✅ 完全满足需求的所有要求
- ✅ 功能正确，无明显错误
- ✅ 边界情况得到处理
- ⚠️ 部分功能缺失或有缺陷
- ❌ 核心功能缺失或错误

### B. 产出质量（25分）
- ✅ 代码结构清晰，命名规范
- ✅ 文档内容完整，格式规范
- ✅ 分析结果有数据支持
- ⚠️ 代码可读性差，文档不完整
- ❌ 代码混乱，无法维护

### C. 可用性（25分）
- ✅ 产出物可直接使用
- ✅ 有明确的使用说明
- ✅ 依赖项清晰说明
- ⚠️ 需要额外配置才能使用
- ❌ 无法使用或缺少必要说明

### D. 验证性（20分）
- ✅ 有测试或验证步骤
- ✅ 结果可重现
- ✅ 有明确的执行结果说明
- ⚠️ 验证不充分
- ❌ 无法验证结果

---

## 评分标准

| 分数区间 | 等级 | 含义 | 通过标准 |
|---------|------|------|----------|
| 90-100 | 优秀 | 完全符合所有标准 | ✅ approved |
| 75-89 | 良好 | 基本符合，有小问题 | ✅ approved |
| 60-74 | 及格 | 勉强符合，需要改进 | ⚠️ needs_revision |
| 40-59 | 不及格 | 有重大问题 | ⚠️ needs_revision |
| 0-39 | 失败 | 完全不符合要求 | ❌ rejected |

## 问题分级

| 级别 | 说明 | 示例 |
|------|------|------|
| critical | 阻碍使用 | 代码无法运行、核心功能错误 |
| major | 影响质量 | 逻辑缺陷、安全问题 |
| minor | 改进建议 | 代码风格、注释缺失 |

## 输出格式（严格 JSON）

\`\`\`json
{
  "overall": "approved|needs_revision|rejected",
  "score": 0-100,
  "feedback": "详细的总体评价，说明评分理由",
  "issues": [
    {
      "severity": "critical|major|minor",
      "category": "功能/质量/可用性/验证",
      "description": "具体问题描述",
      "location": "文件名或位置（可选）"
    }
  ],
  "suggestions": ["具体的改进建议1", "改进建议2"]
}
\`\`\`

## 重要提醒
1. **客观公正**：严格按照标准评分，不偏不倚
2. **详细反馈**：feedback 必须详细说明评分理由
3. **可执行建议**：suggestions 必须是具体的、可执行的
4. **质量优先**：宁可严一点，也不要放低质量

现在，请根据以上标准对产出内容进行严格验收。`;

    try {
      const response = await this.claude.prompt(prompt, {
        outputFormat: 'json',
        print: false,
      });

      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }

      throw new Error('解析失败');
    } catch (error) {
      return {
        overall: 'needs_revision',
        score: 60,
        feedback: '审查失败，请人工验收',
        issues: [],
        suggestions: [],
      };
    }
  }

  /**
   * 分析任务类型
   */
  private analyzeTaskType(requirement: string): string {
    const lower = requirement.toLowerCase();

    if (lower.includes('代码') || lower.includes('函数') || lower.includes('功能') ||
        lower.includes('code') || lower.includes('function')) {
      return '代码开发';
    }

    if (lower.includes('文档') || lower.includes('说明') || lower.includes('手册') ||
        lower.includes('document') || lower.includes('doc')) {
      return '文档编写';
    }

    if (lower.includes('分析') || lower.includes('报告') || lower.includes('研究') ||
        lower.includes('analyze') || lower.includes('report')) {
      return '分析研究';
    }

    if (lower.includes('脚本') || lower.includes('自动化') || lower.includes('部署') ||
        lower.includes('script') || lower.includes('deploy')) {
      return '脚本工具';
    }

    return '综合任务';
  }

  async reviewCode(code: string, context?: {
    language?: string;
    file?: string;
    requirements?: string[];
  }): Promise<ReviewResult> {
    const prompt = `你是代码审查专家。

【代码】
\`\`\`
${code}
\`\`\`

${context ? `
【上下文】
- 语言: ${context.language || '未知'}
- 文件: ${context.file || '未知'}
- 需求: ${context.requirements?.join(', ') || '无'}
` : ''}

【审查要点】
1. 代码可读性
2. 逻辑正确性
3. 边界情况
4. 安全问题
5. 性能问题
6. 最佳实践

返回 JSON 格式的审查结果。`;

    try {
      const response = await this.claude.prompt(prompt, {
        outputFormat: 'json',
        print: false,
      });

      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }

      throw new Error('解析失败');
    } catch {
      return {
        overall: 'approved',
        score: 70,
        feedback: '代码审查失败，默认通过',
        issues: [],
        suggestions: [],
      };
    }
  }

  private getStepOutputs(workDir: string): string[] {
    const { readdirSync, readFileSync, existsSync } = require('fs');
    const { join } = require('path');

    const outputs: string[] = [];

    if (!existsSync(workDir)) {
      return outputs;
    }

    const files = readdirSync(workDir);
    for (const file of files) {
      if (file.endsWith('.txt') || file.endsWith('.md') || file.endsWith('.json')) {
        const content = readFileSync(join(workDir, file), 'utf-8');
        outputs.push(`文件: ${file}\n${content}`);
      }
    }

    return outputs;
  }

  generateReviewReport(result: ReviewResult): string {
    const lines: string[] = [];
    lines.push('# 代码审查报告\n');
    lines.push(`**总体评价**: ${result.overall}`);
    lines.push(`**评分**: ${result.score}/100\n`);
    lines.push(`**反馈**\n${result.feedback}\n`);

    if (result.issues.length > 0) {
      lines.push('## 问题\n');
      for (const issue of result.issues) {
        const emoji = issue.severity === 'critical' ? '❌' : issue.severity === 'major' ? '⚠️' : 'ℹ️';
        lines.push(`${emoji} **${issue.category}**: ${issue.description}`);
      }
      lines.push('');
    }

    if (result.suggestions.length > 0) {
      lines.push('## 改进建议\n');
      result.suggestions.forEach((s, i) => {
        lines.push(`${i + 1}. ${s}`);
      });
    }

    return lines.join('\n');
  }
}
