export interface ErrorDetails {
  recoverable?: boolean;
  suggestedCommand?: string;
  details?: Record<string, unknown>;
}

export class WorkManagerError extends Error {
  readonly code: string;
  readonly recoverable: boolean;
  readonly suggestedCommand?: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, options: ErrorDetails = {}) {
    super(`${code}: ${message}`);
    this.name = 'WorkManagerError';
    this.code = code;
    this.recoverable = options.recoverable ?? false;
    this.suggestedCommand = options.suggestedCommand;
    this.details = options.details;
  }
}

export function toWorkManagerError(error: unknown, fallbackCode = 'UNEXPECTED_ERROR'): WorkManagerError {
  if (error instanceof WorkManagerError) return error;
  return new WorkManagerError(fallbackCode, error instanceof Error ? error.message : String(error), { recoverable: true });
}
