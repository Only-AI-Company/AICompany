import { formatTimestamp } from '@/lib/utils';
import { type Message } from '@/lib/api';

interface MessageProps {
  message: Message;
}

export function MessageItem({ message }: MessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-5`}>
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm ${
          isUser
            ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white'
            : isSystem
            ? 'bg-gray-200 text-gray-700'
            : 'bg-white text-gray-900'
        }`}
      >
        <div className="text-sm whitespace-pre-wrap">{message.content}</div>
        <div
          className={`text-xs mt-2 ${
            isUser ? 'text-indigo-100' : isSystem ? 'text-gray-500' : 'text-gray-500'
          }`}
        >
          {formatTimestamp(message.created_at)}
        </div>
      </div>
    </div>
  );
}
