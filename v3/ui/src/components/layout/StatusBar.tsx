import { useAppStore } from '@/stores/appStore';
import { formatDuration } from '@/lib/utils';

export function StatusBar() {
  const { status, isConnected } = useAppStore();

  if (!status) return null;

  return (
    <div className="h-10 bg-gray-800 text-white text-sm px-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              status.engineRunning ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span>{status.engineRunning ? '引擎运行中' : '引擎已停止'}</span>
        </div>
        <div className="text-gray-400">|</div>
        <div>目标：{status.activeGoals}</div>
        <div className="text-gray-400">|</div>
        <div>任务：{status.activeTasks} 进行中 / {status.pendingTasks} 等待</div>
        <div className="text-gray-400">|</div>
        <div>员工：{status.activeEmployees}</div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-gray-400">
          运行：{formatDuration(status.uptime * 1000)}
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-yellow-500'
            }`}
          />
          <span>{isConnected ? '已连接' : '未连接'}</span>
        </div>
      </div>
    </div>
  );
}
