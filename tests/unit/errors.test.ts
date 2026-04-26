import { describe, it, expect } from 'vitest';
import {
  AuthError,
  RateLimitError,
  NotFoundError,
  ValidationError,
  unauthorized,
  forbidden,
  notFound,
} from '@/lib/errors';

describe('errors', () => {
  describe('AuthError', () => {
    it('captures status 401', () => {
      const e = new AuthError('UNAUTH', 401);
      expect(e.status).toBe(401);
      expect(e.name).toBe('AuthError');
      expect(e.message).toBe('UNAUTH');
      expect(e).toBeInstanceOf(Error);
    });

    it('captures status 403', () => {
      const e = new AuthError('FORBIDDEN', 403);
      expect(e.status).toBe(403);
    });
  });

  describe('RateLimitError', () => {
    it('has standard message and name', () => {
      const e = new RateLimitError();
      expect(e.message).toBe('RATE_LIMIT_EXCEEDED');
      expect(e.name).toBe('RateLimitError');
      expect(e).toBeInstanceOf(Error);
    });
  });

  describe('NotFoundError', () => {
    it('uses default message', () => {
      const e = new NotFoundError();
      expect(e.message).toBe('NOT_FOUND');
      expect(e.name).toBe('NotFoundError');
    });

    it('accepts custom message', () => {
      const e = new NotFoundError('expense not found');
      expect(e.message).toBe('expense not found');
    });
  });

  describe('ValidationError', () => {
    it('preserves message', () => {
      const e = new ValidationError('amount must be positive');
      expect(e.message).toBe('amount must be positive');
      expect(e.name).toBe('ValidationError');
    });
  });

  describe('factory helpers', () => {
    it('unauthorized() returns AuthError(401)', () => {
      const e = unauthorized();
      expect(e).toBeInstanceOf(AuthError);
      expect(e.status).toBe(401);
      expect(e.message).toBe('UNAUTHORIZED');
    });

    it('unauthorized(custom) preserves message', () => {
      const e = unauthorized('SESSION_EXPIRED');
      expect(e.message).toBe('SESSION_EXPIRED');
    });

    it('forbidden() returns AuthError(403)', () => {
      const e = forbidden();
      expect(e).toBeInstanceOf(AuthError);
      expect(e.status).toBe(403);
      expect(e.message).toBe('FORBIDDEN');
    });

    it('notFound() returns NotFoundError', () => {
      const e = notFound();
      expect(e).toBeInstanceOf(NotFoundError);
      expect(e.message).toBe('NOT_FOUND');
    });

    it('notFound(custom) preserves message', () => {
      const e = notFound('USER_NOT_FOUND');
      expect(e.message).toBe('USER_NOT_FOUND');
    });
  });
});
