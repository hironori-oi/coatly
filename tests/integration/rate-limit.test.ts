/**
 * Better Auth rate limit 統合テスト
 *
 * 検証観点:
 *  - /api/auth/sign-in/email に対し 5 req/min/IP の制限が効くこと
 *  - 6 回目の連続 POST が 429 を返すこと
 *  - 別 IP（X-Forwarded-For 切替）からは独立してカウントされること
 *
 * 実装メモ:
 *  - Better Auth は customRules の rate limit を `auth.handler` 入口で評価し、
 *    超過時は 429 を直接返す（DB / DRizzle adapter は触らない）。
 *  - そのため DB は memory 用のダミーで初期化すれば十分。
 *  - 'memory' storage はプロセス内 Map のため、テスト間で残るとフレークの
 *    原因になる。各テスト先頭で別 IP を使い、衝突を回避する。
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// 1〜5 回目の失敗 sign-in は user lookup で DB を叩くが、本テストの主旨は
// 「6 回目に 429 が返る」こと。DB 側は libsql の in-memory で十分。
// テストの集中性を上げるため、単純に findUser が常に "no user" を返す drizzle ライクな
// ダミーを噛ませる。drizzle-adapter は db.select().from(...).where(...) という
// chain を使うため Proxy で fluent 化する。
const fluent: unknown = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'then') return undefined; // not a thenable
      // 末端の execute / get 系は空配列を返す
      if (
        prop === 'all' ||
        prop === 'execute' ||
        prop === 'get' ||
        prop === 'run' ||
        Symbol.asyncIterator === prop
      ) {
        return () => Promise.resolve([]);
      }
      return () => fluent;
    },
  },
);

vi.mock('@/lib/db/client', () => ({
  db: fluent as unknown,
}));

// Better Auth 内部の logger error をテスト出力から黙らせる
let restoreError: (() => void) | null = null;
beforeAll(() => {
  const orig = console.error;
  console.error = () => {};
  restoreError = () => {
    console.error = orig;
  };
});
afterAll(() => {
  restoreError?.();
});

vi.mock('@/lib/email/notify', () => ({
  notifyInvitation: vi.fn(),
  notifyMagicLink: vi.fn(),
  notifyExpenseSubmitted: vi.fn(),
  notifyExpenseApproved: vi.fn(),
}));

async function postSignIn(ip: string): Promise<Response> {
  // dynamic import: vi.mock を反映させたい
  const { auth } = await import('@/lib/auth/better-auth');
  const req = new Request('http://localhost:3000/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
      origin: 'http://localhost:3000',
    },
    body: JSON.stringify({
      email: 'noone@rate-limit.test',
      password: 'wrong-password-1234567890',
    }),
  });
  return await auth.handler(req);
}

describe('Better Auth rate limit (POST /api/auth/sign-in/email)', () => {
  it('returns 429 on the 6th consecutive request from the same IP within 60s', async () => {
    const ip = '203.0.113.10';

    // 1〜5 回目: 認証は失敗するが status は 200 / 401 系（rate limit ではない）
    for (let i = 0; i < 5; i++) {
      const res = await postSignIn(ip);
      expect(
        res.status,
        `request ${i + 1} should NOT be rate-limited (got ${res.status})`,
      ).not.toBe(429);
    }

    // 6 回目: 429 を返すこと
    const sixth = await postSignIn(ip);
    expect(sixth.status).toBe(429);
  });

  it('counts per IP (different IP not affected by previous limit)', async () => {
    // 別 IP は 1 回目から普通に処理される
    const res = await postSignIn('203.0.113.99');
    expect(res.status).not.toBe(429);
  });
});
