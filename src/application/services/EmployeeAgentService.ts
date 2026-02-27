import type { AIDatabase } from '../../infrastructure/database/index.js';
import type { EmployeeAgentMapping } from '../../types/index.js';
import { getClaudeCLIManager } from '../../infrastructure/claude/index.js';

export interface EnsureEmployeeAgentOptions {
  scope?: 'user' | 'project';
  agentName?: string;
  cwd?: string;
}

export class EmployeeAgentService {
  constructor(
    private db: AIDatabase,
    private claude = getClaudeCLIManager()
  ) {}

  ensureEmployeeAgent(employeeId: string, options: EnsureEmployeeAgentOptions = {}): EmployeeAgentMapping {
    const employee = this.db.getEmployee(employeeId);
    if (!employee) {
      throw new Error(`员工不存在: ${employeeId}`);
    }

    const agentName = options.agentName || this.buildAgentName(employee.id);
    const description = `${employee.name} (${employee.role})`;
    const prompt = employee.system_prompt || `你是${employee.name}，担任${employee.role}。`;
    const scope = options.scope || 'project';
    const agents = this.claude.listAgents(scope, options.cwd);
    if (!agents[agentName]) {
      this.claude.createAgentViaCommand(agentName, description, prompt, scope, options.cwd);
    }
    const configPath = this.claude.getAgentFilePath(scope, agentName, options.cwd);

    const metadata = {
      employeeName: employee.name,
      role: employee.role,
      model: employee.model,
    };

    return this.db.upsertEmployeeAgent({
      employee_id: employee.id,
      agent_name: agentName,
      scope,
      config_path: configPath,
      status: 'active',
      metadata_json: JSON.stringify(metadata),
    });
  }

  listEmployeeAgents(): EmployeeAgentMapping[] {
    return this.db.listEmployeeAgents();
  }

  getEmployeeAgent(employeeId: string): EmployeeAgentMapping | undefined {
    return this.db.getEmployeeAgentByEmployeeId(employeeId);
  }

  private buildAgentName(employeeId: string): string {
    return `emp-${employeeId}`;
  }
}
