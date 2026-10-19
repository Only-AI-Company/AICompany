import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Layout } from './components/layout/Layout';
import { Sidebar } from './components/layout/Sidebar';
import { StatusBar } from './components/layout/StatusBar';
import { ChatPage } from './pages/ChatPage';
import { TasksPage } from './pages/TasksPage';
import { GoalsPageWrapper } from './pages/GoalsPage';
import { MemoryPage } from './pages/MemoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { useAppStore } from './stores/appStore';
import { useChatStore } from './stores/chatStore';
import { useTaskStore } from './stores/taskStore';
import { getWebSocketClient } from './lib/websocket';

function AppContent() {
  const { fetchStatus, setConnected } = useAppStore();
  const { fetchConversations } = useChatStore();
  const { fetchTasks, fetchGoals } = useTaskStore();

  useEffect(() => {
    // Initial data fetch
    fetchStatus();
    fetchConversations();
    fetchTasks();
    fetchGoals();

    // Setup WebSocket
    const wsClient = getWebSocketClient();

    wsClient.on('connected', () => {
      setConnected(true);
      fetchStatus();
    });

    wsClient.on('disconnected', () => {
      setConnected(false);
    });

    wsClient.on('system_status', (payload: any) => {
      if (payload.engineStatus) {
        fetchStatus();
      }
    });

    wsClient.on('task_updated', () => {
      fetchTasks();
    });

    wsClient.on('goal_updated', () => {
      fetchGoals();
    });

    wsClient.on('auth_error', (payload: any) => {
      console.error('[App] Authentication error:', payload.message);
    });

    wsClient.on('auth_failed', () => {
      console.error('[App] Authentication failed, please refresh the page');
    });

    wsClient.connect();

    // Periodic status update
    const interval = setInterval(fetchStatus, 5000);

    return () => {
      wsClient.disconnect();
      clearInterval(interval);
    };
  }, [fetchStatus, setConnected, fetchConversations, fetchTasks, fetchGoals]);

  return (
    <Layout>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-auto">
          <Routes>
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/goals" element={<GoalsPageWrapper />} />
            <Route path="/memory" element={<MemoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/" element={<Navigate to="/chat" replace />} />
          </Routes>
        </div>
        <StatusBar />
      </div>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
