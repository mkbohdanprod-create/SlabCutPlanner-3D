/**
 * Blackbox Logger
 * Перехоплює `console.error` та `window.onerror` для збереження останніх N помилок
 * Це допомагає при формуванні баг-репорту.
 */

export interface LogEntry {
  timestamp: string;
  type: 'error' | 'warn' | 'info';
  message: string;
  stack?: string;
}

class BlackboxTracker {
  private logs: LogEntry[] = [];
  private maxLogs = 50;
  private originalConsoleError: typeof console.error;
  private originalConsoleWarn: typeof console.warn;

  constructor() {
    this.originalConsoleError = console.error;
    this.originalConsoleWarn = console.warn;
  }

  public init() {
    // Override console.error
    console.error = (...args: any[]) => {
      this.addLog('error', args);
      this.originalConsoleError.apply(console, args);
    };

    // Override console.warn
    console.warn = (...args: any[]) => {
      this.addLog('warn', args);
      this.originalConsoleWarn.apply(console, args);
    };

    // Global error handler
    window.addEventListener('error', (event) => {
      this.logs.push({
        timestamp: new Date().toISOString(),
        type: 'error',
        message: `[Global] ${event.message}`,
        stack: event.error?.stack,
      });
      this.trimLogs();
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.logs.push({
        timestamp: new Date().toISOString(),
        type: 'error',
        message: `[Promise] ${event.reason?.message || event.reason}`,
        stack: event.reason?.stack,
      });
      this.trimLogs();
    });
  }

  private addLog(type: 'error' | 'warn' | 'info', args: any[]) {
    const message = args.map(arg => {
      if (arg instanceof Error) return arg.message;
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return '[Circular object]';
        }
      }
      return String(arg);
    }).join(' ');

    const stack = args.find(arg => arg instanceof Error)?.stack;

    this.logs.push({
      timestamp: new Date().toISOString(),
      type,
      message,
      stack,
    });

    this.trimLogs();
  }

  private trimLogs() {
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(this.logs.length - this.maxLogs);
    }
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clear() {
    this.logs = [];
  }
}

export const blackbox = new BlackboxTracker();
