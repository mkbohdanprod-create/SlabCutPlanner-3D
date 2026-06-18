import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { del } from 'idb-keyval';

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
          
          <details className="w-full max-w-2xl bg-white p-4 rounded-lg shadow-inner border border-red-100 mb-6 cursor-pointer group">
            <summary className="text-sm font-medium text-red-800 outline-none select-none">Технічні деталі (клікніть, щоб розгорнути)</summary>
            <div className="mt-4 relative">
              <pre className="text-xs text-red-800 font-mono overflow-x-auto whitespace-pre-wrap">
                {this.state.error?.stack || this.state.error?.toString()}
              </pre>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(this.state.error?.stack || this.state.error?.toString() || '');
                  alert('Текст помилки скопійовано!');
                }}
                className="absolute top-0 right-0 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium border border-slate-300"
              >
                Скопіювати
              </button>
            </div>
          </details>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => this.setState({ hasError: false })}
              className="flex items-center gap-2 px-6 py-2.5 bg-slate-600 hover:bg-slate-700 text-white rounded-lg shadow-sm transition-colors font-medium"
            >
              <RefreshCcw className="w-4 h-4" />
              Спробувати знову
            </button>
            
            <button 
              onClick={async () => {
                if (confirm('Увага! Це видалить всі незбережені локальні дані поточного проекту. Продовжити?')) {
                  try {
                    await del('slab_cut_planner_current_project');
                  } catch (e) {
                    console.error("Failed to delete IDB", e);
                  } finally {
                    localStorage.removeItem('slab_cut_planner_current_project');
                    window.location.reload();
                  }
                }
              }}
              className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-sm transition-colors font-medium"
            >
              Скинути локальний проект
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
