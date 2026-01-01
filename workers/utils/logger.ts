/**
 * Conditional Logger Utility
 * 
 * LOW Issue #26 Fix: Replace direct console.log calls with conditional logging
 * that respects the environment (development vs production).
 * 
 * In Cloudflare Workers, console.log output appears in:
 * - `wrangler tail` for production logs
 * - Terminal output during local development
 * 
 * This logger adds:
 * - Environment-aware debug logging (only in development)
 * - Consistent log format with timestamps and levels
 * - Type-safe logging interface
 */

/**
 * Log levels from least to most severe
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Check if running in production environment
 * In Cloudflare Workers, check the ENVIRONMENT binding
 */
function isProduction(): boolean {
  // In Workers, we can't access process.env directly
  // The ENVIRONMENT variable is passed via wrangler.json or dashboard
  // During builds, this will be undefined, defaulting to production behavior
  return typeof globalThis !== 'undefined' && 
         (globalThis as unknown as { ENVIRONMENT?: string }).ENVIRONMENT === 'production';
}

/**
 * Format a log message with timestamp and level
 */
function formatLog(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  
  if (context && Object.keys(context).length > 0) {
    return `${prefix} ${message} ${JSON.stringify(context)}`;
  }
  return `${prefix} ${message}`;
}

/**
 * Structured log entry for JSON logging
 */
interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Create a structured log object (for JSON logging in production)
 */
function createStructuredLog(level: LogLevel, message: string, context?: Record<string, unknown>): StructuredLog {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context && { context })
  };
}

/**
 * Logger instance with environment-aware methods
 */
export const logger = {
  /**
   * Debug logs - only output in development
   * Use for verbose debugging information
   */
  debug(message: string, context?: Record<string, unknown>): void {
    if (!isProduction()) {
      console.log(formatLog('debug', message, context));
    }
  },

  /**
   * Info logs - always output
   * Use for general operational information
   */
  info(message: string, context?: Record<string, unknown>): void {
    console.log(formatLog('info', message, context));
  },

  /**
   * Warning logs - always output
   * Use for potentially problematic situations
   */
  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(formatLog('warn', message, context));
  },

  /**
   * Error logs - always output
   * Use for errors that need attention
   * Note: Never include sensitive data (passwords, tokens, etc.)
   */
  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    // Safely extract error information without leaking stack traces in production
    const errorInfo: Record<string, unknown> = { ...context };
    
    if (error instanceof Error) {
      errorInfo.errorMessage = error.message;
      errorInfo.errorName = error.name;
      // Only include stack in development
      if (!isProduction()) {
        errorInfo.stack = error.stack;
      }
    } else if (error !== undefined) {
      errorInfo.errorValue = String(error);
    }
    
    console.error(formatLog('error', message, errorInfo));
  },

  /**
   * Structured JSON log - for complex logging needs
   * Always outputs as JSON for easier parsing in log aggregators
   */
  json(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const entry = createStructuredLog(level, message, context);
    
    switch (level) {
      case 'error':
        console.error(JSON.stringify(entry));
        break;
      case 'warn':
        console.warn(JSON.stringify(entry));
        break;
      default:
        // Skip debug in production
        if (level === 'debug' && isProduction()) return;
        console.log(JSON.stringify(entry));
    }
  },

  /**
   * Security event log - always outputs as structured JSON
   * Use for security-relevant events (login attempts, auth failures, etc.)
   */
  security(event: string, details?: {
    requestId?: string;
    userId?: string;
    ip?: string;
    path?: string;
    method?: string;
    success?: boolean;
    reason?: string;
    extra?: Record<string, unknown>;
  }): void {
    const entry = {
      timestamp: new Date().toISOString(),
      type: 'security',
      event,
      ...details
    };
    console.log(JSON.stringify(entry));
  },

  /**
   * Performance log - for timing operations
   * Use to track slow operations
   */
  perf(operation: string, durationMs: number, context?: Record<string, unknown>): void {
    const entry = {
      timestamp: new Date().toISOString(),
      type: 'performance',
      operation,
      durationMs,
      ...context
    };
    
    // Log slow operations as warnings
    if (durationMs > 1000) {
      console.warn(JSON.stringify(entry));
    } else if (!isProduction()) {
      console.log(JSON.stringify(entry));
    }
  }
};

/**
 * Create a timer for measuring operation duration
 * @returns Object with stop() method that logs the duration
 */
export function startTimer(operation: string, context?: Record<string, unknown>): { stop: () => number } {
  const start = Date.now();
  return {
    stop(): number {
      const duration = Date.now() - start;
      logger.perf(operation, duration, context);
      return duration;
    }
  };
}

export default logger;
