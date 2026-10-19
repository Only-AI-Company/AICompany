import { useEffect, useState } from 'react';
import { useTaskStore } from '../../stores/taskStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { formatTimestamp } from '../../lib/utils';
import { type Goal } from '../../lib/api';

export function GoalsPage() {
  const { goals, fetchGoals, createGoal } = useTaskStore();
  const [newGoal, setNewGoal] = useState('');
  const [timeframe, setTimeframe] = useState('30 天');

  useEffect(() => {
    fetchGoals();
  }, []);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoal.trim()) return;

    await createGoal(newGoal, timeframe);
    setNewGoal('');
  };

  const statusColors: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
    active: 'default',
    completed: 'success',
    failed: 'error',
    paused: 'warning',
  };

  const statusLabels: Record<string, string> = {
    active: '进行中',
    completed: '已完成',
    failed: '失败',
    paused: '已暂停',
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">创建目标</h3>
        </div>
        <CardContent>
          <form onSubmit={handleCreateGoal} className="flex gap-2 items-end">
            <Input
              value={newGoal}
              onChange={(e) => setNewGoal(e.target.value)}
              placeholder="目标描述..."
              className="flex-1"
            />
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="7 天">7 天</option>
              <option value="14 天">14 天</option>
              <option value="30 天">30 天</option>
              <option value="1 个月">1 个月</option>
              <option value="3 个月">3 个月</option>
              <option value="6 个月">6 个月</option>
              <option value="1 年">1 年</option>
              <option value="永久">永久</option>
            </select>
            <Button type="submit" variant="primary" disabled={!newGoal.trim()}>
              创建
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4">
        {goals.map((goal: Goal) => (
          <Card key={goal.id}>
            <CardContent>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-lg text-gray-900">{goal.description}</h3>
                    <Badge variant={statusColors[goal.status]}>
                      {statusLabels[goal.status]}
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-500 mb-2">
                    时间框架：{goal.timeframe}
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${goal.progress || 0}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    进度：{goal.progress || 0}%
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  创建于 {formatTimestamp(goal.created_at)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {goals.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            暂无目标
          </div>
        )}
      </div>
    </div>
  );
}
