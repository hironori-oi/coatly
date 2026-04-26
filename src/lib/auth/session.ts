/**
 * セッション Cookie ヘルパ
 *
 * proxy.ts（Next 16 middleware）から呼び出され、未ログインなら /login へ
 * リダイレクトする判定に使用する。
 *
 * Better Auth の session_token cookie の存在チェックのみ行う簡易版。
 * 実際の検証は Server Action / Route Handler で auth.api.getSession() で行う。
 *
 * Cookie 名は環境によって prefix が変わる（RFC 6265 / __Secure- / __Host-）:
 *  - 開発（http localhost）          : `better-auth.session_token`
 *  - 本番（https / secure: true）    : `__Secure-better-auth.session_token`
 *  - host-only モード（Domain なし） : `__Host-better-auth.session_token`
 *
 * Better Auth は config の `advanced.cookies.session_token.attributes.secure` が
 * true の場合に自動で `__Secure-` prefix を付ける。production で
 * `secure: process.env.NODE_ENV === 'production'` を設定しているため、
 * 本番では prefix 付きで Set-Cookie される。middleware が prefix なしの
 * 名前しか見ないと「サインインは成功しているのに認可で /login へ戻される」
 * 現象が発生する（W2-C 由来の見逃し、production でしか再現しない）。
 */
import type { NextRequest } from 'next/server';

const SESSION_COOKIE_BASE_NAMES = [
  'better-auth.session_token',
  'session_token',
] as const;

const COOKIE_PREFIXES = ['', '__Secure-', '__Host-'] as const;

/**
 * 検索対象クッキー名の全組合せ（base × prefix）。
 * テストや log 表示で参照できるよう export する。
 */
export const SESSION_COOKIE_NAMES = COOKIE_PREFIXES.flatMap((prefix) =>
  SESSION_COOKIE_BASE_NAMES.map((base) => `${prefix}${base}` as const),
);

export async function getSessionCookie(
  req: NextRequest,
): Promise<string | null> {
  for (const name of SESSION_COOKIE_NAMES) {
    const c = req.cookies.get(name);
    if (c?.value) return c.value;
  }
  return null;
}
