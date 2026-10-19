import { create } from 'zustand';
import { api, type Conversation, type Message } from '../lib/api';

interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Message[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchConversations: () => Promise<void>;
  createConversation: (title?: string) => Promise<string>;
  selectConversation: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  isLoading: false,
  error: null,

  fetchConversations: async () => {
    try {
      const data = await api.getConversations();
      set({ conversations: data.conversations });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  createConversation: async (title?: string) => {
    try {
      const data = await api.createConversation(title);
      const newConv: Conversation = {
        id: data.id,
        title: data.title || 'New Conversation',
        status: 'active',
        created_at: data.createdAt,
        updated_at: data.createdAt,
      };
      set((state) => ({
        conversations: [newConv, ...state.conversations],
        currentConversationId: data.id,
      }));
      return data.id;
    } catch (error: any) {
      set({ error: error.message });
      return '';
    }
  },

  selectConversation: async (id: string) => {
    set({ isLoading: true, currentConversationId: id });
    try {
      const data = await api.getMessages(id, 100);
      set({ messages: data.messages, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  sendMessage: async (content: string) => {
    const { currentConversationId } = get();
    if (!currentConversationId) {
      set({ error: 'No conversation selected' });
      return;
    }

    // Add user message optimistically
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: currentConversationId,
      role: 'user',
      content,
      created_at: Date.now(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
    }));

    try {
      const data = await api.sendMessage(currentConversationId, content);

      // Replace temp message with actual and add assistant response
      set((state) => ({
        messages: [
          ...state.messages.filter(m => m.id !== userMessage.id),
          userMessage,
          data.message,
        ],
      }));
    } catch (error: any) {
      set({ error: error.message });
      // Remove temp message on error
      set((state) => ({
        messages: state.messages.filter(m => m.id !== userMessage.id),
      }));
    }
  },

  deleteConversation: async (id: string) => {
    try {
      await api.deleteConversation(id);
      set((state) => ({
        conversations: state.conversations.filter(c => c.id !== id),
        currentConversationId: state.currentConversationId === id ? null : state.currentConversationId,
        messages: state.currentConversationId === id ? [] : state.messages,
      }));
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  clearError: () => set({ error: null }),
}));
