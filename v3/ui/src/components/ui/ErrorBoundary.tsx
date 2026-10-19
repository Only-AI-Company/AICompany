import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-red-600 mb-2">
                  出错了
                </h2>
                <p className="text-gray-600 mb-4">
                  应用程序遇到了一个错误
                </p>
                {this.state.error && (
                  <pre className="text-xs text-left bg-gray-100 p-3 rounded mb-4 overflow-auto max-h-40">
                    {this.state.error.message}
                  </pre>
                )}
                <div className="flex gap-2 justify-center">
                  <Button onClick={this.handleReset} variant="primary">
                    返回首页
                  </Button>
                  <Button
                    onClick={() => window.location.reload()}
                    variant="outline"
                  >
                    刷新页面
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
