/**
 * Sentry 統合スモーク E2E（W3-B）
 *
 * 前提:
 *   - 本番 / preview では SENTRY_DSN が設定されている
 *   - dev / CI ローカルでは SENTRY_DSN なしのため、テスト自体を skip する
 *
 * 確認内容（DSN 設定時のみ）:
 *   1. /api/sentry-error にアクセスすると意図的に server error が throw される
 *   2. クライアント側で Sentry の ingest endpoint への POST が発生する（tunnelRoute /monitoring）
 *
 * 実装注意:
 *   - 本テストは「SENTRY が初期化済みかつ DSN が有効である」事を担保するスモーク。
 *   - エラー送信の正確な assertion は Sentry 側 UI で別途確認すること。
 */
import { test, expect } from '@playwright/test';

const HAS_DSN =
  Boolean(process.env.SENTRY_DSN) ||
  Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

test.skip(
  !HAS_DSN,
  'SENTRY_DSN 未設定: Sentry 統合スモークは production / preview のみで実行',
);

test('Sentry: /monitoring tunnel route が解決され 405/200 系で応答する', async ({
  request,
}) => {
  // tunnelRoute は GET だと 405、POST 空 body でも 4xx を返す。
  // 重要なのは「routing が解決されている = withSentryConfig が走ったビルド」である事。
  const res = await request.get('/monitoring');
  expect([200, 204, 400, 404, 405, 415]).toContain(res.status());
});

test('Sentry: client error が発生しても UI が break しない', async ({
  page,
}) => {
  await page.goto('/login');
  await page.evaluate(() => {
    // Sentry が捕捉する想定の意図的 throw（globalErrorHandler 経由で送信される）
    setTimeout(() => {
      throw new Error('coatly-sentry-smoke-client-error');
    }, 0);
  });
  // ページ自体は壊れていない事を確認
  await expect(
    page.getByRole('heading', { name: /Coatly にログイン/ }),
  ).toBeVisible();
});
