import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary] Caught error in ${this.props.componentName || 'a component'}:`, error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-8 m-4 bg-red-50 border border-red-200 rounded-xl max-w-full overflow-hidden">
          <div className="flex items-center gap-3 text-red-600 mb-4">
            <AlertTriangle className="w-8 h-8" />
            <h3 className="text-xl font-bold">Щось пішло не так</h3>
          </div>
          <p className="text-red-700 text-center mb-6 max-w-md">
            Виникла критична помилка під час відображення компонента {this.props.componentName ? `«${this.props.componentName}»` : ''}.
          </p>
          <div className="w-full max-w-2xl bg-white p-4 rounded-lg shadow-inner border border-red-100 overflow-x-auto text-left mb-6">
            <pre className="text-xs text-red-800 font-mono">
              {this.state.error?.toString()}
            </pre>
          </div>
          <button 
            onClick={() => this.setState({ hasError: false })}
            className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-sm transition-colors font-medium"
          >
            <RefreshCcw className="w-4 h-4" />
            Спробувати знову
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
