import { GoalsPage } from '@/components/goals/GoalsPage';

export function GoalsPageWrapper() {
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">目标管理</h2>
        <p className="text-sm text-gray-500">设定和追踪公司目标</p>
      </div>
      <GoalsPage />
    </div>
  );
}
