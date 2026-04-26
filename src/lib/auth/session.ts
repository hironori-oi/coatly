/**
 * セッション Cookie ヘルパ
 *
 * proxy.ts（Next 16 middleware）から呼び出され、未ログインなら /login へ
 * リダイレクトする判定に使用する。
 *
 * Better Auth の session_token cookie の存在チェックのみ行う簡易版。
 * 実際の検証は Server Action / Route Handler で auth.api.getSession() で行う。
 */
import type { NextRequest } from 'next/server';

export const SESSION_COOKIE_NAMES = [
  'better-auth.session_token',
  'session_token',
] as const;

export async function getSessionCookie(req: NextRequest): Promise<string | null> {
  for (const name of SESSION_COOKIE_NAMES) {
    const c = req.cookies.get(name);
    if (c?.value) return c.value;
  }
  return null;
}
