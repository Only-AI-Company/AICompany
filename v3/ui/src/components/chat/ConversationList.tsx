import React from 'react';
import { useChatStore } from '../../stores/chatStore';
import { Button } from '../ui/Button';
import { formatTimestamp } from '../../lib/utils';

export function ConversationList() {
  const { conversations, currentConversationId, selectConversation, createConversation, deleteConversation } =
    useChatStore();

  const handleNewConversation = async () => {
    const title = prompt('会话名称 (可选):') || undefined;
    const id = await createConversation(title);
    if (id) {
      selectConversation(id);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('确定要删除此会话吗？')) {
      await deleteConversation(id);
    }
  };

  return (
    <div className="w-72 bg-white/70 backdrop-blur border border-white/60 rounded-[28px] shadow-lg flex flex-col overflow-hidden">
      <div className="p-4 border-b border-white/60">
        <Button onClick={handleNewConversation} variant="primary" className="w-full rounded-full shadow-sm">
          + 新建会话
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-6 text-sm text-gray-500 text-center">暂无会话</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => selectConversation(conv.id)}
              className={`m-3 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 cursor-pointer transition-all hover:shadow-md ${
                currentConversationId === conv.id ? 'shadow-md ring-1 ring-indigo-200' : ''
              }`}
            >
              <div className="font-medium text-sm truncate">{conv.title || '未命名会话'}</div>
              <div className="text-xs text-gray-500 mt-1 flex justify-between">
                <span>{formatTimestamp(conv.updated_at)}</span>
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
