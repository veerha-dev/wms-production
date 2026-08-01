import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

/**
 * The filter is the last thing between a raw driver error and the client. Two
 * properties matter: the status must be the client's fault when it is the
 * client's fault (a duplicate key is a 409, not a 500), and no SQL, table name
 * or constraint name may ever reach a production response body.
 */

interface Captured {
  status: number;
  body: any;
}

/** A minimal pg driver error — `severity` is what marks it as server-side. */
const pgError = (code: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error('duplicate key value violates unique constraint "customers_code_key"'), {
    code,
    severity: 'ERROR',
    routine: '_bt_check_unique',
    file: 'nbtinsert.c',
    detail: 'Key (code)=(CUST-001) already exists.',
    table: 'customers',
    constraint: 'customers_code_key',
    ...extra,
  });

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let captured: Captured;
  let host: ArgumentsHost;
  const originalEnv = process.env.NODE_ENV;

  const run = (exception: unknown): Captured => {
    filter.catch(exception, host);
    return captured;
  };

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    captured = { status: 0, body: undefined };

    const json = (body: any) => {
      captured.body = body;
    };
    const response = { status: (code: number) => ((captured.status = code), { json }) };
    const request = { method: 'POST', url: '/api/customers' };

    host = {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
    } as unknown as ArgumentsHost;

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────── envelope ──────

  describe('error envelope', () => {
    it('always reports success: false', () => {
      expect(run(new NotFoundException('nope')).body.success).toBe(false);
      expect(run(pgError('23505')).body.success).toBe(false);
      expect(run(new Error('boom')).body.success).toBe(false);
    });

    it('carries BOTH a top-level message and error.message', () => {
      // The frontend reads errors inconsistently — both must be present.
      for (const ex of [new NotFoundException('Customer x not found'), pgError('23505'), new Error('boom')]) {
        const { body } = run(ex);
        expect(typeof body.message).toBe('string');
        expect(body.message.length).toBeGreaterThan(0);
        expect(body.error.message).toBe(body.message);
      }
    });

    it('always carries a machine-readable error.code', () => {
      for (const ex of [new NotFoundException('x'), pgError('23505'), new Error('boom')]) {
        const { body } = run(ex);
        expect(typeof body.error.code).toBe('string');
        expect(body.error.code).toMatch(/^[A-Z0-9_]+$/);
      }
    });

    it('omits error.details entirely rather than emitting undefined', () => {
      process.env.NODE_ENV = 'production';
      const { body } = run(new NotFoundException('x'));
      expect('details' in body.error).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────── postgres codes ─────

  describe('Postgres error mapping', () => {
    it('23505 unique violation → 409 DUPLICATE_ENTRY', () => {
      const { status, body } = run(pgError('23505'));
      expect(status).toBe(HttpStatus.CONFLICT);
      expect(status).toBe(409);
      expect(body.error.code).toBe('DUPLICATE_ENTRY');
      expect(body.message).toBe('Duplicate entry');
    });

    it('23503 foreign key violation → 409 FOREIGN_KEY_VIOLATION', () => {
      const { status, body } = run(pgError('23503'));
      expect(status).toBe(409);
      expect(body.error.code).toBe('FOREIGN_KEY_VIOLATION');
      expect(body.message).toBe('Record is referenced by other data');
    });

    it('23502 not-null violation → 400 MISSING_REQUIRED_FIELD', () => {
      const { status, body } = run(pgError('23502'));
      expect(status).toBe(400);
      expect(body.error.code).toBe('MISSING_REQUIRED_FIELD');
      expect(body.message).toBe('Missing required field');
    });

    it('22P02 invalid text representation → 400 INVALID_INPUT', () => {
      // e.g. a non-UUID id in the path: a client mistake, not a server fault.
      const { status, body } = run(pgError('22P02'));
      expect(status).toBe(400);
      expect(body.error.code).toBe('INVALID_INPUT');
      expect(body.message).toBe('Invalid input format');
    });

    it.each(['42703', '42P01', '40001', '53300'])(
      'an unmapped SQLSTATE %s → 500 DATABASE_ERROR',
      (code) => {
        const { status, body } = run(pgError(code));
        expect(status).toBe(500);
        expect(body.error.code).toBe('DATABASE_ERROR');
        expect(body.message).toBe('Database error');
      },
    );

    it('never returns a 2xx for a driver error', () => {
      for (const code of ['23505', '23503', '23502', '22P02', '42703']) {
        expect(run(pgError(code)).status).toBeGreaterThanOrEqual(400);
      }
    });
  });

  // ──────────────────────────────────────────────────────── the pg guard ─────

  describe('isPgError guard', () => {
    it('does NOT treat a Node EPIPE error as a Postgres error', () => {
      // 'EPIPE' is five uppercase characters and would match a naive
      // SQLSTATE test — the guard must require a pg-only field.
      const nodeError = Object.assign(new Error('write EPIPE'), {
        code: 'EPIPE',
        errno: -32,
        syscall: 'write',
      });

      const { status, body } = run(nodeError);

      expect(status).toBe(500);
      expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(body.message).toBe('Internal server error');
      expect(body.message).not.toBe('Database error');
    });

    // EPERM/EBUSY are also five uppercase characters — the guard must reject
    // them on the missing pg-only field, not on the shape of the code.
    it.each(['EPERM', 'EBUSY', 'ENOENT'])(
      'does not treat Node error code %s as Postgres',
      (code) => {
        const { body } = run(Object.assign(new Error('node'), { code }));
        expect(body.error.code).not.toBe('DATABASE_ERROR');
        expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
      },
    );

    it('accepts a driver error identified by `routine` alone', () => {
      const err = Object.assign(new Error('x'), { code: '23505', routine: '_bt_check_unique' });
      expect(run(err).status).toBe(409);
    });

    it('accepts a driver error identified by `file` alone', () => {
      const err = Object.assign(new Error('x'), { code: '23505', file: 'nbtinsert.c' });
      expect(run(err).status).toBe(409);
    });

    it('ignores a non-object throwable', () => {
      expect(run('a bare string').status).toBe(500);
      expect(run(null).status).toBe(500);
      expect(run(undefined).status).toBe(500);
      expect(run(42).status).toBe(500);
    });

    it('ignores a numeric `code` that is not a SQLSTATE string', () => {
      const err = Object.assign(new Error('x'), { code: 23505, severity: 'ERROR' });
      expect(run(err).status).toBe(500);
      expect(captured.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  // ─────────────────────────────────────────────────────────── leakage ───────

  describe('production leakage', () => {
    const secrets = [
      'customers_code_key',
      'CUST-001',
      'nbtinsert.c',
      'duplicate key value violates unique constraint',
      'customers',
    ];

    it('leaks no driver text for a Postgres error when NODE_ENV=production', () => {
      process.env.NODE_ENV = 'production';
      const { body } = run(pgError('23505'));
      const serialized = JSON.stringify(body);
      for (const secret of secrets) expect(serialized).not.toContain(secret);
      expect(body.error.details).toBeUndefined();
    });

    it.each(['23505', '23503', '23502', '22P02', '42703'])(
      'leaks nothing for SQLSTATE %s in production',
      (code) => {
        process.env.NODE_ENV = 'production';
        const { body } = run(pgError(code));
        const serialized = JSON.stringify(body);
        for (const secret of secrets) expect(serialized).not.toContain(secret);
      },
    );

    it('leaks no unknown-error message in production', () => {
      process.env.NODE_ENV = 'production';
      const { body } = run(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
      expect(JSON.stringify(body)).not.toContain('10.0.0.5');
      expect(body.error.details).toBeUndefined();
      expect(body.message).toBe('Internal server error');
    });

    it('DOES attach driver detail outside production, for debugging', () => {
      process.env.NODE_ENV = 'development';
      const { body } = run(pgError('23505'));
      expect(body.error.details).toEqual({
        pgCode: '23505',
        detail: 'Key (code)=(CUST-001) already exists.',
        table: 'customers',
        constraint: 'customers_code_key',
      });
    });

    it('attaches the unknown-error message outside production', () => {
      process.env.NODE_ENV = 'test';
      const { body } = run(new Error('kaboom'));
      expect(body.error.details).toEqual({ message: 'kaboom' });
    });

    it('keeps the client-facing status and message identical in both environments', () => {
      process.env.NODE_ENV = 'production';
      const prod = run(pgError('23505'));
      process.env.NODE_ENV = 'development';
      const dev = run(pgError('23505'));
      expect(prod.status).toBe(dev.status);
      expect(prod.body.message).toBe(dev.body.message);
      expect(prod.body.error.code).toBe(dev.body.error.code);
    });
  });

  // ───────────────────────────────────────────────────── HttpExceptions ──────

  describe('HttpException passthrough', () => {
    it.each([
      [new NotFoundException('Customer x not found'), 404, 'NOT_FOUND', 'Customer x not found'],
      [new ConflictException('Code in use'), 409, 'CONFLICT', 'Code in use'],
      [new ForbiddenException('Only an admin can do that'), 403, 'FORBIDDEN', 'Only an admin can do that'],
      [new UnauthorizedException('No tenant context'), 401, 'UNAUTHORIZED', 'No tenant context'],
      [new BadRequestException('phone is required'), 400, 'BAD_REQUEST', 'phone is required'],
    ] as Array<[HttpException, number, string, string]>)('preserves %#: status, code and message', (ex, status, code, message) => {
      const res = run(ex);
      expect(res.status).toBe(status);
      expect(res.body.error.code).toBe(code);
      expect(res.body.message).toBe(message);
    });

    it('flattens a class-validator message array into details', () => {
      const ex = new BadRequestException({
        statusCode: 400,
        message: ['name should not be empty', 'phone must be a string'],
        error: 'Bad Request',
      });

      const { status, body } = run(ex);

      expect(status).toBe(400);
      expect(body.message).toBe('Validation failed');
      expect(body.error.details).toEqual(['name should not be empty', 'phone must be a string']);
      expect(body.error.code).toBe('BAD_REQUEST');
    });

    it('keeps a validation array even in production (it is client input, not server internals)', () => {
      process.env.NODE_ENV = 'production';
      const { body } = run(new BadRequestException({ message: ['name should not be empty'] }));
      expect(body.error.details).toEqual(['name should not be empty']);
    });

    it('accepts a plain string response body', () => {
      const { status, body } = run(new HttpException('boom', 418));
      expect(status).toBe(418);
      expect(body.message).toBe('boom');
    });

    it('derives the code from a custom `error` string, upper-snake-cased', () => {
      const { body } = run(new HttpException({ message: 'x', error: 'Credit Limit Exceeded' }, 402));
      expect(body.error.code).toBe('CREDIT_LIMIT_EXCEEDED');
    });

    it('falls back to HTTP_<status> for a status with no Nest name', () => {
      const { body } = run(new HttpException('odd', 599));
      expect(body.error.code).toBe('HTTP_599');
    });

    it('logs 5xx HttpExceptions', () => {
      const errorLog = jest.spyOn(Logger.prototype, 'error');
      run(new InternalServerErrorException('downstream failed'));
      expect(errorLog).toHaveBeenCalled();
    });

    it('does not log a routine 404 as a server error', () => {
      const errorLog = jest.spyOn(Logger.prototype, 'error');
      errorLog.mockClear();
      run(new NotFoundException('nope'));
      expect(errorLog).not.toHaveBeenCalled();
    });

    it('an HttpException is never re-classified as a database error', () => {
      // A ConflictException raised by the service must keep its own message.
      const { body } = run(new ConflictException('A customer with GSTIN 33... already exists'));
      expect(body.message).not.toBe('Duplicate entry');
      expect(body.error.code).toBe('CONFLICT');
    });
  });

  // ─────────────────────────────────────────────────────────── unknown ───────

  describe('unknown exceptions', () => {
    it('a plain Error becomes a generic 500', () => {
      const { status, body } = run(new Error('something odd'));
      expect(status).toBe(500);
      expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(body.message).toBe('Internal server error');
    });

    it('a thrown string becomes a generic 500 without crashing the filter', () => {
      const { status, body } = run('just a string');
      expect(status).toBe(500);
      expect(body.message).toBe('Internal server error');
    });

    it('a thrown object without a message becomes a generic 500', () => {
      const { status, body } = run({ weird: true });
      expect(status).toBe(500);
      expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });
});
