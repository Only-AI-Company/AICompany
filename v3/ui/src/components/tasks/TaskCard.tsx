import { type Task } from '@/lib/api';
import { Badge } from '../ui/Badge';
import { formatTimestamp } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  const statusColors: Record<string, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
    pending: 'default',
    scheduled: 'info',
    executing: 'warning',
    completed: 'success',
    failed: 'error',
  };

  const priorityColors: Record<string, 'default' | 'info' | 'warning' | 'error'> = {
    low: 'default',
    medium: 'info',
    high: 'warning',
    critical: 'error',
  };

  const statusLabels: Record<string, string> = {
    pending: '待处理',
    scheduled: '已调度',
    executing: '执行中',
    completed: '已完成',
    failed: '失败',
  };

  const priorityLabels: Record<string, string> = {
    low: '低',
    medium: '中',
    high: '高',
    critical: '紧急',
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">{task.description}</h3>
          <div className="flex gap-2 mt-2">
            <Badge variant={statusColors[task.status]}>
              {statusLabels[task.status]}
            </Badge>
            <Badge variant={priorityColors[task.priority]}>
              {priorityLabels[task.priority]}
            </Badge>
          </div>
        </div>
        <div className="text-xs text-gray-500">
          {formatTimestamp(task.created_at)}
        </div>
      </div>
    </div>
  );
}
