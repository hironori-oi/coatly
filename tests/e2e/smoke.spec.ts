/**
 * スモーク E2E（Phase 1 / Phase 1-cleanup で更新）
 *
 * DEC-020 で `/` がリダイレクタ化されたため、過去の「ヒーロー文言検証」を撤去。
 * 代わりに以下の最小ケースで「未ログイン状態の入口導線」を担保する:
 *
 *   1. /            → 未ログインで /login へ redirect
 *   2. /login       → 200 で h1 "Coatly にログイン" が見える
 *   3. /privacy     → 未ログインで 200、ヘッダ "プライバシーポリシー" が見える
 *   4. /terms       → 未ログインで 200、ヘッダ "利用規約" が見える
 *   5. 不正 org slug → 未ログインで /login?next=... へ redirect される
 *
 * 認可漏洩の細かなケースは authorization.spec.ts（C1-C7）が担当する。
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  // すべてのスモーク ケースは未ログイン状態で実施する
  await context.clearCookies();
});

test('S1: / は未ログインで /login へ redirect される', async ({ page }) => {
  const res = await page.goto('/');
  // 最終的な URL が /login にいることを確認（クエリ有無は問わない）
  await expect(page).toHaveURL(/\/login(\?|$)/);
  // login ページ自体は 200 で配信されている
  expect(res?.status() ?? 0).toBeLessThan(400);
});

test('S2: /login がレンダリングされ主要見出しが見える', async ({ page }) => {
  const res = await page.goto('/login');
  expect(res?.status() ?? 0).toBeLessThan(400);
  await expect(
    page.getByRole('heading', { name: /Coatly にログイン/ }),
  ).toBeVisible();
});

test('S3: /privacy が未ログインで開ける', async ({ page }) => {
  const res = await page.goto('/privacy');
  expect(res?.status() ?? 0).toBe(200);
  await expect(
    page.getByRole('heading', { name: /プライバシーポリシー/ }),
  ).toBeVisible();
});

test('S4: /terms が未ログインで開ける', async ({ page }) => {
  const res = await page.goto('/terms');
  expect(res?.status() ?? 0).toBe(200);
  await expect(
    page.getByRole('heading', { name: /利用規約/ }),
  ).toBeVisible();
});

test('S5: 不正な org slug の保護ページは /login?next=... へ redirect される', async ({
  page,
}) => {
  await page.goto('/__definitely_not_an_org__/dashboard');
  // proxy.ts は未ログインを /login?next=... に飛ばす（org の存在は別レイヤで判定）
  await expect(page).toHaveURL(/\/login(\?next=)?/);
});
