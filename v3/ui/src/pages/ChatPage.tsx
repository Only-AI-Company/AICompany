import { ChatWindow } from '@/components/chat/ChatWindow';
import { ChatInput } from '@/components/chat/ChatInput';
import { ConversationList } from '@/components/chat/ConversationList';

export function ChatPage() {
  return (
    <div className="flex flex-1 overflow-hidden bg-gradient-to-br from-slate-100 via-indigo-50 to-purple-50 p-6 gap-6">
      <ConversationList />
      <div className="flex-1 flex flex-col min-w-0 rounded-[28px] bg-white/70 backdrop-blur border border-white/60 shadow-xl overflow-hidden">
        <div className="border-b border-white/60 bg-white/70 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">CEO 对话</h2>
          <p className="text-sm text-gray-500">与 CEO 直接对话，制定战略和目标</p>
        </div>
        <ChatWindow />
        <div className="border-t border-white/60 bg-white/70 p-4">
          <ChatInput />
        </div>
      </div>
    </div>
  );
}
