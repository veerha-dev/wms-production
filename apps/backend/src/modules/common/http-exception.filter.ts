import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

/**
 * Global exception filter (registered as APP_FILTER in AppModule).
 *
 * Error envelope:
 *   { success: false, message, error: { code, message, details? } }
 *
 * Both a top-level `message` and `error.message` are included because the
 * frontend reads errors inconsistently (some hooks use
 * e.response?.data?.error?.message, others e.response?.data?.message).
 *
 * Postgres driver errors are mapped to safe, generic messages — raw driver
 * messages/SQL are never leaked in production; outside production the raw
 * detail is attached under error.details for debugging.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_SERVER_ERROR';
    let details: any;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = codeFromStatus(status);
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object') {
        const body = res as any;
        if (Array.isArray(body.message)) {
          // class-validator errors: keep the full array as details
          message = 'Validation failed';
          details = body.message;
        } else {
          message = body.message || exception.message || message;
        }
        if (typeof body.error === 'string' && body.error) {
          code = body.error.toUpperCase().replace(/\s+/g, '_');
        }
      } else {
        message = exception.message;
      }
    } else if (isPgError(exception)) {
      const pg = exception as any;
      switch (pg.code) {
        case '23505':
          status = HttpStatus.CONFLICT;
          code = 'DUPLICATE_ENTRY';
          message = 'Duplicate entry';
          break;
        case '23503':
          status = HttpStatus.CONFLICT;
          code = 'FOREIGN_KEY_VIOLATION';
          message = 'Record is referenced by other data';
          break;
        case '23502':
          status = HttpStatus.BAD_REQUEST;
          code = 'MISSING_REQUIRED_FIELD';
          message = 'Missing required field';
          break;
        case '22P02':
          // Malformed input syntax (e.g. a non-UUID id in the path) is a
          // client error, not a server fault.
          status = HttpStatus.BAD_REQUEST;
          code = 'INVALID_INPUT';
          message = 'Invalid input format';
          break;
        default:
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          code = 'DATABASE_ERROR';
          message = 'Database error';
          break;
      }
      // Never leak raw driver messages/SQL in production.
      if (process.env.NODE_ENV !== 'production') {
        details = {
          pgCode: pg.code,
          detail: pg.detail ?? pg.message,
          table: pg.table,
          constraint: pg.constraint,
        };
      }
      this.logger.error(
        `Postgres error ${pg.code} on ${request?.method} ${request?.url}: ${pg.message}`,
      );
    } else {
      // Unknown error — log the real thing server-side, return a generic 500.
      const err = exception as Error;
      this.logger.error(
        `Unhandled exception on ${request?.method} ${request?.url}: ${err?.message ?? exception}`,
        err?.stack,
      );
      if (process.env.NODE_ENV !== 'production' && err?.message) {
        details = { message: err.message };
      }
    }

    // Log 5xx HttpExceptions too — they indicate server-side faults.
    if (exception instanceof HttpException && status >= 500) {
      this.logger.error(
        `HTTP ${status} on ${request?.method} ${request?.url}: ${message}`,
        exception.stack,
      );
    }

    response.status(status).json({
      success: false,
      message,
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    });
  }
}

function isPgError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as any;
  // A SQLSTATE-shaped code alone also matches Node errors such as EPIPE, so
  // require a field only the pg driver sets on server-side errors.
  return (
    typeof e.code === 'string' &&
    /^[0-9A-Z]{5}$/.test(e.code) &&
    (typeof e.severity === 'string' || typeof e.routine === 'string' || typeof e.file === 'string')
  );
}

function codeFromStatus(status: number): string {
  const name = HttpStatus[status];
  return typeof name === 'string' ? name : `HTTP_${status}`;
}
