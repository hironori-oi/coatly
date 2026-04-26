import { describe, it, expect } from 'vitest';
import {
  SESSION_COOKIE_NAMES,
  getSessionCookie,
} from '@/lib/auth/session';
import type { NextRequest } from 'next/server';

function makeReq(cookies: Record<string, string>): NextRequest {
  return {
    cookies: {
      get: (name: string) =>
        cookies[name] !== undefined ? { name, value: cookies[name] } : undefined,
    },
  } as unknown as NextRequest;
}

describe('SESSION_COOKIE_NAMES', () => {
  it('contains better-auth and legacy names (no prefix)', () => {
    expect(SESSION_COOKIE_NAMES).toContain('better-auth.session_token');
    expect(SESSION_COOKIE_NAMES).toContain('session_token');
  });

  it('contains __Secure- prefixed names (production https)', () => {
    expect(SESSION_COOKIE_NAMES).toContain(
      '__Secure-better-auth.session_token',
    );
    expect(SESSION_COOKIE_NAMES).toContain('__Secure-session_token');
  });

  it('contains __Host- prefixed names (host-only mode)', () => {
    expect(SESSION_COOKIE_NAMES).toContain(
      '__Host-better-auth.session_token',
    );
    expect(SESSION_COOKIE_NAMES).toContain('__Host-session_token');
  });

  it('has 6 candidate names total (2 base × 3 prefix)', () => {
    expect(SESSION_COOKIE_NAMES.length).toBe(6);
  });
});

describe('getSessionCookie', () => {
  it('returns null when no cookie present', async () => {
    expect(await getSessionCookie(makeReq({}))).toBeNull();
  });

  it('returns better-auth cookie value when present', async () => {
    expect(
      await getSessionCookie(
        makeReq({ 'better-auth.session_token': 'abc' }),
      ),
    ).toBe('abc');
  });

  it('falls back to legacy session_token cookie', async () => {
    expect(
      await getSessionCookie(makeReq({ session_token: 'legacy-val' })),
    ).toBe('legacy-val');
  });

  it('prefers better-auth name when both are set', async () => {
    expect(
      await getSessionCookie(
        makeReq({
          'better-auth.session_token': 'new',
          session_token: 'old',
        }),
      ),
    ).toBe('new');
  });

  it('returns null when cookie value is empty string', async () => {
    expect(
      await getSessionCookie(makeReq({ 'better-auth.session_token': '' })),
    ).toBeNull();
  });

  it('detects __Secure- prefixed cookie in production', async () => {
    expect(
      await getSessionCookie(
        makeReq({ '__Secure-better-auth.session_token': 'prod-token' }),
      ),
    ).toBe('prod-token');
  });

  it('detects __Host- prefixed cookie', async () => {
    expect(
      await getSessionCookie(
        makeReq({ '__Host-better-auth.session_token': 'host-only' }),
      ),
    ).toBe('host-only');
  });

  it('detects __Secure- prefixed legacy session_token', async () => {
    expect(
      await getSessionCookie(makeReq({ '__Secure-session_token': 'legacy-prod' })),
    ).toBe('legacy-prod');
  });
});
