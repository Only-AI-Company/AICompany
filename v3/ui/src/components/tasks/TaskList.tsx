import { useEffect, useState } from 'react';
import { useTaskStore } from '../../stores/taskStore';
import { TaskCard } from './TaskCard';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card, CardContent } from '../ui/Card';

export function TaskList() {
  const { tasks, fetchTasks, createTask, isLoading } = useTaskStore();
  const [newTask, setNewTask] = useState('');
  const [priority, setPriority] = useState('medium');

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;

    await createTask(newTask, priority);
    setNewTask('');
  };

  const filteredTasks = {
    pending: tasks.filter((t) => t.status === 'pending' || t.status === 'scheduled'),
    executing: tasks.filter((t) => t.status === 'executing'),
    completed: tasks.filter((t) => t.status === 'completed'),
    failed: tasks.filter((t) => t.status === 'failed'),
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">创建任务</h3>
        </div>
        <CardContent>
          <form onSubmit={handleCreateTask} className="flex gap-2 items-end">
            <Input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="任务描述..."
              className="flex-1"
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
              <option value="critical">紧急</option>
            </select>
            <Button type="submit" variant="primary" disabled={!newTask.trim()}>
              创建
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTasks.pending.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">待处理 ({filteredTasks.pending.length})</h3>
            <div className="space-y-2">
              {filteredTasks.pending.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </div>
        )}

        {filteredTasks.executing.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">执行中 ({filteredTasks.executing.length})</h3>
            <div className="space-y-2">
              {filteredTasks.executing.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </div>
        )}

        {filteredTasks.completed.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">已完成 ({filteredTasks.completed.length})</h3>
            <div className="space-y-2">
              {filteredTasks.completed.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </div>
        )}

        {filteredTasks.failed.length > 0 && (
          <div>
            <h3 className="font-semibold text-red-700 mb-2">失败 ({filteredTasks.failed.length})</h3>
            <div className="space-y-2">
              {filteredTasks.failed.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </div>
        )}

        {tasks.length === 0 && !isLoading && (
          <div className="col-span-full text-center text-gray-500 py-8">
            暂无任务
          </div>
        )}
      </div>
    </div>
  );
}
