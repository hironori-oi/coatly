/**
 * 視覚スナップショット（W2-C 報告書添付用）
 *
 * Light / Dark 双方の dashboard を 1 枚ずつ保存する。
 * Playwright のシステムがディスクに png を書き出すだけのため、
 * このテストは「スクリーンショット保存」が主目的で assert は最小。
 */
import { test } from '@playwright/test';
import path from 'node:path';
import { loginViaUI, TEST_USERS } from './fixtures/auth';

const SCREENSHOT_DIR = path.resolve(
  __dirname,
  '../../../reports/screenshots',
);

test('snapshot: dashboard light', async ({ page }) => {
  await loginViaUI(page, TEST_USERS.ownerA.email);
  // wow 要素のアニメーションが完了するのを待つ
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'dashboard-light.png'),
    fullPage: true,
  });
});

test.describe('dark snapshot', () => {
  test.use({ colorScheme: 'dark' });

  test('snapshot: dashboard dark', async ({ page }) => {
    await loginViaUI(page, TEST_USERS.ownerA.email);
    // 念のため <html> にも dark クラスを付与（system mode の next-themes 想定）
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    });
    // スタイル再計算 + アニメーション完了
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'dashboard-dark.png'),
      fullPage: true,
    });
  });
});
