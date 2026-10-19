import { create } from 'zustand';
import { api, type SystemStatus, type Employee } from '../lib/api';

interface AppState {
  status: SystemStatus | null;
  employees: Employee[];
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchStatus: () => Promise<void>;
  fetchEmployees: () => Promise<void>;
  setConnected: (connected: boolean) => void;
  clearError: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  status: null,
  employees: [],
  isConnected: false,
  isLoading: false,
  error: null,

  fetchStatus: async () => {
    try {
      const data = await api.getStatus();
      set({ status: data, error: null });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  fetchEmployees: async () => {
    try {
      const data = await api.getEmployees();
      set({ employees: data.employees });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  setConnected: (connected: boolean) => {
    set({ isConnected: connected });
  },

  clearError: () => set({ error: null }),
}));
