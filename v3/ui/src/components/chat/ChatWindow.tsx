import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { MessageItem } from './MessageList';

export function ChatWindow() {
  const { messages, currentConversationId, fetchConversations } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!currentConversationId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p className="text-lg mb-2">欢迎来到 AI Company v3</p>
          <p className="text-sm">选择或创建一个会话开始对话</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      {messages.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <div className="inline-flex flex-col items-center rounded-3xl bg-white/80 px-8 py-6 shadow-sm">
            <p className="text-base">开始对话吧！</p>
            <p className="text-xs text-gray-400 mt-1">与 CEO 保持持续交流</p>
          </div>
        </div>
      ) : (
        <>
          {messages.map((message) => (
            <MessageItem key={message.id} message={message} />
          ))}
          <div ref={messagesEndRef} />
        </>
      )}
    </div>
  );
}
