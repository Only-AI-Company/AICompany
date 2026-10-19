import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/chat', label: 'CEO 对话' },
  { path: '/tasks', label: '任务' },
  { path: '/goals', label: '目标' },
  { path: '/memory', label: '记忆' },
  { path: '/settings', label: '设置' },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <div className="w-56 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">AI Company v3</h1>
        <p className="text-xs text-gray-500 mt-1">Autonomous AI Company</p>
      </div>
      <nav className="flex-1 p-2">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              'block px-3 py-2 rounded-md text-sm font-medium transition-colors',
              location.pathname === item.path
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-200 text-xs text-gray-500">
        <p>v3.0.0</p>
        <p className="mt-1">2026 AI Company</p>
      </div>
    </div>
  );
}
