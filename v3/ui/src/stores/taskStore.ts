import { create } from 'zustand';
import { api, type Task, type Goal } from '../lib/api';

interface TaskState {
  tasks: Task[];
  goals: Goal[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchTasks: () => Promise<void>;
  fetchGoals: () => Promise<void>;
  createTask: (description: string, priority?: string) => Promise<void>;
  createGoal: (description: string, timeframe?: string) => Promise<void>;
  clearError: () => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  goals: [],
  isLoading: false,
  error: null,

  fetchTasks: async () => {
    try {
      const data = await api.getTasks();
      set({ tasks: data.tasks });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  fetchGoals: async () => {
    try {
      const data = await api.getGoals();
      set({ goals: data.goals });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  createTask: async (description: string, priority?: string) => {
    try {
      await api.createTask(description, priority);
      // Refresh tasks
      const data = await api.getTasks();
      set({ tasks: data.tasks });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  createGoal: async (description: string, timeframe?: string) => {
    try {
      await api.createGoal(description, timeframe);
      // Refresh goals
      const data = await api.getGoals();
      set({ goals: data.goals });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  clearError: () => set({ error: null }),
}));
