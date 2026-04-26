/**
 * 統一エラーヘルパ
 *
 * Server Actions / Route Handlers / Guards で投げる例外を統一。
 * クライアントには内部詳細を漏らさず、401/403/404/429/500 を返却する。
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends Error {
  constructor() {
    super('RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'NOT_FOUND') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function unauthorized(message = 'UNAUTHORIZED'): AuthError {
  return new AuthError(message, 401);
}

export function forbidden(message = 'FORBIDDEN'): AuthError {
  return new AuthError(message, 403);
}

export function notFound(message = 'NOT_FOUND'): NotFoundError {
  return new NotFoundError(message);
}
