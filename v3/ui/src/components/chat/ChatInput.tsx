import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { Button } from '../ui/Button';

interface ChatInputProps {
  onSend?: (content: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage } = useChatStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || disabled) return;

    if (onSend) {
      onSend(content);
    } else {
      sendMessage(content);
    }
    setContent('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [content]);

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 items-end">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息... (Shift+Enter 换行)"
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none px-5 py-3 border border-white/70 rounded-2xl bg-white/80 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
        style={{ minHeight: '48px' }}
      />
      <Button type="submit" variant="primary" disabled={!content.trim() || disabled} className="rounded-2xl shadow-sm px-6">
        发送
      </Button>
    </form>
  );
}
