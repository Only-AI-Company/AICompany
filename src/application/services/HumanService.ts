import type { AIDatabase } from '../../infrastructure/database/index.js';
import type { HumanProfile, CreateHumanInput } from '../../types/human.js';

export interface HumanSearchFilters {
  name?: string;
  gender?: 'male' | 'female' | 'other';
  location?: string;
  skills?: string[];
  personalityTraits?: string[];
  hobbies?: string[];
  weaknesses?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'name';
  order?: 'asc' | 'desc';
}

export interface HumanMatchCriteria {
  name?: string;
  gender?: 'male' | 'female' | 'other';
  location?: string;
  skills?: string[];
  personalityTraits?: string[];
  hobbies?: string[];
  weaknesses?: string[];
}

export class HumanService {
  constructor(private db: AIDatabase) {}
  
  // 创建人类档案
  async createHuman(input: CreateHumanInput): Promise<HumanProfile> {
    return this.db.createHuman(input);
  }
  
  // 获取人类档案
  getHuman(id: string): HumanProfile | undefined {
    return this.db.getHuman(id);
  }
  
  // 更新人类档案
  updateHuman(id: string, updates: Partial<CreateHumanInput>): HumanProfile | undefined {
    return this.db.updateHuman(id, updates);
  }
  
  // 删除人类档案
  deleteHuman(id: string): boolean {
    const result = this.db.prepare('DELETE FROM humans WHERE id = ?').run(id);
    return result.changes > 0;
  }
  
  // 获取所有人类档案
  getAllHumans(): HumanProfile[] {
    const rows = this.db.prepare('SELECT * FROM humans ORDER BY created_at DESC').all() as Array<Record<string, any>>;
    return rows.map(row => this.normalizeHumanRow(row));
  }

  getHumanByName(name: string): HumanProfile | undefined {
    return this.searchHumans({ name, limit: 1 })[0];
  }

  findHumansByName(name: string): HumanProfile[] {
    return this.searchHumans({ name });
  }

  findHuman(criteria: HumanMatchCriteria): HumanProfile | undefined {
    return this.searchHumans({
      name: criteria.name,
      gender: criteria.gender,
      location: criteria.location,
      skills: criteria.skills,
      personalityTraits: criteria.personalityTraits,
      hobbies: criteria.hobbies,
      weaknesses: criteria.weaknesses,
      limit: 1,
    })[0];
  }

  searchHumans(filters: HumanSearchFilters = {}): HumanProfile[] {
    let humans = this.getAllHumans();

    if (filters.name) {
      const keyword = filters.name.toLowerCase();
      humans = humans.filter(h => h.name.toLowerCase().includes(keyword));
    }

    if (filters.gender) {
      humans = humans.filter(h => h.gender === filters.gender);
    }

    if (filters.location) {
      const keyword = filters.location.toLowerCase();
      humans = humans.filter(h => h.location?.toLowerCase().includes(keyword));
    }

    if (filters.skills && filters.skills.length > 0) {
      const expected = this.normalizeList(filters.skills);
      humans = humans.filter(h => this.hasAny(h.skills, expected));
    }

    if (filters.personalityTraits && filters.personalityTraits.length > 0) {
      const expected = this.normalizeList(filters.personalityTraits);
      humans = humans.filter(h => this.hasAny(h.personalityTraits, expected));
    }

    if (filters.hobbies && filters.hobbies.length > 0) {
      const expected = this.normalizeList(filters.hobbies);
      humans = humans.filter(h => this.hasAny(h.hobbies, expected));
    }

    if (filters.weaknesses && filters.weaknesses.length > 0) {
      const expected = this.normalizeList(filters.weaknesses);
      humans = humans.filter(h => this.hasAny(h.weaknesses, expected));
    }

    const order = filters.order === 'asc' ? 1 : -1;
    const sortBy = filters.sortBy || 'createdAt';
    humans.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name) * order;
      }
      const av = sortBy === 'updatedAt' ? a.updatedAt : a.createdAt;
      const bv = sortBy === 'updatedAt' ? b.updatedAt : b.createdAt;
      return (av - bv) * order;
    });

    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? humans.length;
    return humans.slice(offset, offset + limit);
  }

  appendNotes(id: string, notes: string): HumanProfile | undefined {
    const human = this.getHuman(id);
    if (!human) return undefined;
    const merged = human.notes ? `${human.notes}\n${notes}` : notes;
    return this.updateHuman(id, { notes: merged });
  }

  setWorkPreferences(id: string, workPreferences: NonNullable<CreateHumanInput['workPreferences']>): HumanProfile | undefined {
    return this.updateHuman(id, { workPreferences });
  }

  addSkills(id: string, skills: string[]): HumanProfile | undefined {
    return this.mergeListField(id, 'skills', skills, []);
  }

  removeSkills(id: string, skills: string[]): HumanProfile | undefined {
    return this.mergeListField(id, 'skills', [], skills);
  }

  addPersonalityTraits(id: string, traits: string[]): HumanProfile | undefined {
    return this.mergeListField(id, 'personalityTraits', traits, []);
  }

  removePersonalityTraits(id: string, traits: string[]): HumanProfile | undefined {
    return this.mergeListField(id, 'personalityTraits', [], traits);
  }

  addHobbies(id: string, hobbies: string[]): HumanProfile | undefined {
    return this.mergeListField(id, 'hobbies', hobbies, []);
  }

  removeHobbies(id: string, hobbies: string[]): HumanProfile | undefined {
    return this.mergeListField(id, 'hobbies', [], hobbies);
  }

  addWeaknesses(id: string, weaknesses: string[]): HumanProfile | undefined {
    return this.mergeListField(id, 'weaknesses', weaknesses, []);
  }

  removeWeaknesses(id: string, weaknesses: string[]): HumanProfile | undefined {
    return this.mergeListField(id, 'weaknesses', [], weaknesses);
  }

  async upsertHumanByName(input: CreateHumanInput): Promise<HumanProfile> {
    const existing = this.getHumanByName(input.name);
    if (existing) {
      return this.updateHuman(existing.id, input) ?? existing;
    }
    return this.createHuman(input);
  }

  setLocation(id: string, location: string): HumanProfile | undefined {
    return this.updateHuman(id, { location });
  }

  setBirthday(id: string, birthday: string): HumanProfile | undefined {
    return this.updateHuman(id, { birthday });
  }

  setAppearance(id: string, appearance: string): HumanProfile | undefined {
    return this.updateHuman(id, { appearance });
  }

  private mergeListField(
    id: string,
    field: 'skills' | 'personalityTraits' | 'hobbies' | 'weaknesses',
    add: string[],
    remove: string[]
  ): HumanProfile | undefined {
    const human = this.getHuman(id);
    if (!human) return undefined;
    const current = this.normalizeList(human[field]);
    const addList = this.normalizeList(add);
    const removeList = new Set(this.normalizeList(remove));
    const merged = Array.from(new Set([...current, ...addList])).filter(item => !removeList.has(item));
    const update: Partial<CreateHumanInput> = {};
    if (field === 'skills') update.skills = merged;
    if (field === 'personalityTraits') update.personalityTraits = merged;
    if (field === 'hobbies') update.hobbies = merged;
    if (field === 'weaknesses') update.weaknesses = merged;
    return this.updateHuman(id, update);
  }

  private normalizeList(items?: string[]): string[] {
    if (!items) return [];
    return items.map(item => item.trim()).filter(Boolean);
  }

  private normalizeHumanRow(row: Record<string, any>): HumanProfile {
    const parse = (value: unknown) => {
      if (!value) return undefined;
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return [value];
        }
      }
      return undefined;
    };
    return {
      id: row.id,
      name: row.name,
      gender: row.gender || undefined,
      location: row.location || undefined,
      birthday: row.birthday || undefined,
      appearance: row.appearance || undefined,
      personalityTraits: parse(row.personality_traits),
      hobbies: parse(row.hobbies),
      workPreferences: row.work_preferences ? JSON.parse(row.work_preferences) : undefined,
      skills: parse(row.skills),
      weaknesses: parse(row.weaknesses),
      notes: row.notes || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private hasAny(list?: string[], expected?: string[]): boolean {
    if (!list || !expected || expected.length === 0) return false;
    const set = new Set(this.normalizeList(list).map(item => item.toLowerCase()));
    return expected.some(item => set.has(item.toLowerCase()));
  }
}
