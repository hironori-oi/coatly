/**
 * アクセシビリティ E2E（acceptance-criteria-v1.md T-3 a11y / W3-A）
 *
 * 検査方法:
 *  - @axe-core/playwright で各ページ DOM を解析し、`violations.length === 0` を必須条件にする。
 *  - WCAG 2.1 AA 相当の rule set（wcag2a + wcag2aa + wcag21a + wcag21aa）を有効化。
 *  - 0 違反でなければ console に詳細を出して失敗させる（CI で原因が読めるように）。
 *
 * 対象ページ:
 *  - public:  /login, /privacy, /terms
 *  - app (member):  /[org]/dashboard, /[org]/expenses, /[org]/expenses/new
 *  - app (admin):   /[org]/admin/overview, /[org]/admin/budgets, /[org]/admin/members
 *  - settings:      /[org]/settings
 *
 * 既知の妥協:
 *  - color-contrast は OS dark/light theme + tailwind の設計によって一時的に
 *    不安定になり得るため、`disableRules` で外していない（=必須）。落ちたら
 *    CSS を修正する方針。Phase 1 cleanup 段階で全ページ対応済み。
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { TEST_USERS, loginViaUI } from './fixtures/auth';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function checkA11y(page: import('@playwright/test').Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .analyze();

  if (result.violations.length > 0) {
    // violations の詳細を CI ログで読めるように落としておく
    const summary = result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
      target: v.nodes[0]?.target,
    }));

    console.error(`[a11y] ${label} violations:`, JSON.stringify(summary, null, 2));
  }
  expect(
    result.violations,
    `a11y violations on ${label}: ${result.violations
      .map((v) => `${v.id} (${v.nodes.length})`)
      .join(', ')}`,
  ).toEqual([]);
}

test.describe('a11y: public pages', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('A1: /login is accessible', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await checkA11y(page, '/login');
  });

  test('A2: /privacy is accessible', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForLoadState('networkidle');
    await checkA11y(page, '/privacy');
  });

  test('A3: /terms is accessible', async ({ page }) => {
    await page.goto('/terms');
    await page.waitForLoadState('networkidle');
    await checkA11y(page, '/terms');
  });
});

test.describe('a11y: app pages (member)', () => {
  test('A4: /[org]/dashboard is accessible', async ({ page }) => {
    await loginViaUI(page, TEST_USERS.memberOkayama.email);
    await page.goto(`/${TEST_USERS.memberOkayama.orgSlug}/dashboard`);
    await page.waitForLoadState('networkidle');
    await checkA11y(page, '/dashboard');
  });

  test('A5: /[org]/expenses is accessible', async ({ page }) => {
    await loginViaUI(page, TEST_USERS.memberOkayama.email);
    await page.goto(`/${TEST_USERS.memberOkayama.orgSlug}/expenses`);
    await page.waitForLoadState('networkidle');
    await checkA11y(page, '/expenses');
  });

  test('A6: /[org]/expenses/new is accessible', async ({ page }) => {
    await loginViaUI(page, TEST_USERS.memberOkayama.email);
    await page.goto(`/${TEST_USERS.memberOkayama.orgSlug}/expenses/new`);
    await page.waitForLoadState('networkidle');
    await checkA11y(page, '/expenses/new');
  });
});

test.describe('a11y: app pages (admin)', () => {
  test('A7: /[org]/admin/overview is accessible', async ({ page }) => {
    await loginViaUI(page, TEST_USERS.ownerA.email);
    await page.goto(`/${TEST_USERS.ownerA.orgSlug}/admin/overview`);
    await page.waitForLoadState('networkidle');
    await checkA11y(page, '/admin/overview');
  });

  test('A8: /[org]/admin/budgets is accessible', async ({ page }) => {
    await loginViaUI(page, TEST_USERS.ownerA.email);
    await page.goto(`/${TEST_USERS.ownerA.orgSlug}/admin/budgets`);
    await page.waitForLoadState('networkidle');
    await checkA11y(page, '/admin/budgets');
  });

  test('A9: /[org]/admin/members is accessible', async ({ page }) => {
    await loginViaUI(page, TEST_USERS.ownerA.email);
    await page.goto(`/${TEST_USERS.ownerA.orgSlug}/admin/members`);
    await page.waitForLoadState('networkidle');
    await checkA11y(page, '/admin/members');
  });
});

test.describe('a11y: settings', () => {
  test('A10: /[org]/settings is accessible', async ({ page }) => {
    await loginViaUI(page, TEST_USERS.memberOkayama.email);
    await page.goto(`/${TEST_USERS.memberOkayama.orgSlug}/settings`);
    await page.waitForLoadState('networkidle');
    await checkA11y(page, '/settings');
  });
});
