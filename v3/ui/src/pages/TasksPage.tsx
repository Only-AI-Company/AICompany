import { TaskList } from '@/components/tasks/TaskList';

export function TasksPage() {
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">任务管理</h2>
        <p className="text-sm text-gray-500">查看和管理所有任务</p>
      </div>
      <TaskList />
    </div>
  );
}
