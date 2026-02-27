import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { AIDatabase } from '../src/infrastructure/database/Database.js';
import { HumanService } from '../src/application/services/HumanService.js';

const homeDir = mkdtempSync(join(tmpdir(), 'ai-company-test-'));
process.env.HOME = homeDir;

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(__dirname, '..', 'src', 'infrastructure', 'database', 'schema.sql'), 'utf-8');

const db = new AIDatabase();
db.initialize(schema);
const humanService = new HumanService(db);

const tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];
const test = (name: string, fn: () => Promise<void> | void) => tests.push({ name, fn });

test('human 管理接口', async () => {
  const created = await humanService.createHuman({
    name: '李雷',
    gender: 'male',
    personalityTraits: ['认真'],
    hobbies: ['跑步'],
    workPreferences: {
      preferredHours: '9-18',
      communicationStyle: 'direct',
    },
    skills: ['JS'],
    weaknesses: ['急躁'],
    notes: '初始',
  });

  assert.ok(created.id);
  const fetched = humanService.getHuman(created.id);
  assert.equal(fetched?.name, '李雷');

  const updated = humanService.updateHuman(created.id, {
    notes: '更新',
    skills: ['JS', 'TS'],
  });
  assert.deepEqual(updated?.skills, ['JS', 'TS']);
  assert.equal(updated?.notes, '更新');

  const appended = humanService.appendNotes(created.id, '补充');
  assert.ok(appended?.notes?.includes('补充'));

  const afterAdd = humanService.addSkills(created.id, ['Node']);
  assert.ok(afterAdd?.skills?.includes('Node'));

  const afterRemove = humanService.removeSkills(created.id, ['JS']);
  assert.ok(afterRemove?.skills && !afterRemove.skills.includes('JS'));

  const found = humanService.findHuman({ skills: ['TS'] });
  assert.equal(found?.id, created.id);

  const search = humanService.searchHumans({ skills: ['TS'], limit: 1 });
  assert.equal(search.length, 1);

  const deleted = humanService.deleteHuman(created.id);
  assert.ok(deleted);
  assert.equal(humanService.getHuman(created.id), undefined);
});

test('employee 管理接口', () => {
  const created = db.createEmployee({
    name: '测试员工',
    role: '测试工程师',
  });

  assert.ok(created.id);
  const fetched = db.getEmployee(created.id);
  assert.equal(fetched?.name, '测试员工');

  const updated = db.updateEmployee(created.id, {
    status: 'busy',
    current_task: '测试任务',
  });
  assert.equal(updated?.status, 'busy');
  assert.equal(updated?.current_task, '测试任务');

  const all = db.getAllEmployees();
  assert.ok(all.some(e => e.id === created.id));

  const deleted = db.deleteEmployee(created.id);
  assert.ok(deleted);
  assert.equal(db.getEmployee(created.id), undefined);
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`✓ ${t.name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${t.name}`);
    console.error(error);
  }
}

db.close();
rmSync(homeDir, { recursive: true, force: true });

if (failed > 0) {
  process.exit(1);
}
