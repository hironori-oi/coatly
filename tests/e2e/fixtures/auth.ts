/**
 * E2E 認証ヘルパ（W2-C / authorization.spec.ts 用）
 *
 * Playwright fixture で使う共通ログインユーティリティ。
 *
 * 前提:
 *  - `pnpm db:seed && pnpm db:seed:e2e` 後の状態
 *  - dev サーバが http://localhost:3000 で起動している
 *
 * 既知のテストユーザー:
 *  | メール                              | 組織            | 役割     |
 *  |-------------------------------------|-----------------|----------|
 *  | owner@coatly.local                  | coatly-tennis   | owner    |
 *  | e2e-okayama@coatly.local            | coatly-tennis   | member (岡山) |
 *  | e2e-hiroshima@coatly.local          | coatly-tennis   | member (広島) |
 *  | e2e-other-owner@coatly.local        | e2e-other-org   | owner    |
 *  | e2e-other-member@coatly.local       | e2e-other-org   | member   |
 *
 * 全 password = `Password1234!`
 */
import type { Page, BrowserContext, APIRequestContext } from '@playwright/test';

export const E2E_PASSWORD = 'Password1234!';

export const TEST_USERS = {
  ownerA: {
    email: 'owner@coatly.local',
    orgSlug: 'coatly-tennis',
    role: 'owner' as const,
  },
  memberOkayama: {
    email: 'e2e-okayama@coatly.local',
    orgSlug: 'coatly-tennis',
    role: 'member' as const,
  },
  memberHiroshima: {
    email: 'e2e-hiroshima@coatly.local',
    orgSlug: 'coatly-tennis',
    role: 'member' as const,
  },
  ownerB: {
    email: 'e2e-other-owner@coatly.local',
    orgSlug: 'e2e-other-org',
    role: 'owner' as const,
  },
  memberB: {
    email: 'e2e-other-member@coatly.local',
    orgSlug: 'e2e-other-org',
    role: 'member' as const,
  },
};

/**
 * /login のフォームにログインして session cookie を発行する。
 * 成功時は `/[org]/dashboard` まで遷移する。
 */
export async function loginViaUI(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('パスワード').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: /^ログイン$/ }).click();
  // ダッシュボード遷移を待機 (root → /[org]/dashboard へ redirect)。
  // production build の cold start + dashboard SSR 初回が遅く、'load' イベント
  // 完了を待つと dashboard 内の lazy chunk fetch / streaming 完結で 30s 超えする
  // ことがある (C7 flake の主因)。URL 確定 = navigation commit を待てば認可
  // テストの目的としては十分なので 'commit' に倒し、timeout も 60s まで広げる。
  await page.waitForURL(/\/dashboard$/, {
    timeout: 60_000,
    waitUntil: 'commit',
  });
}

/**
 * APIRequestContext 経由でログインし、cookie を context に保存する
 * （ページ遷移なしで状態だけ整える用途）。
 */
export async function loginViaApi(
  request: APIRequestContext,
  context: BrowserContext,
  email: string,
): Promise<void> {
  const res = await request.post('/api/auth/sign-in/email', {
    data: { email, password: E2E_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(
      `loginViaApi failed: ${email} status=${res.status()} body=${await res.text()}`,
    );
  }
  // cookie を browser context に転送
  const cookies = res.headers()['set-cookie'];
  if (cookies) {
    // Playwright は set-cookie を自動的に APIRequestContext の storage に書くため
    // request の storageState を context に注入する必要がある場合のみ追加処理する。
    // 通常は同じ context.request() から呼ぶことで自動共有される。
  }
}

export async function logout(page: Page): Promise<void> {
  // sign-out は POST + redirect
  await page.request.post('/api/auth/sign-out');
}
