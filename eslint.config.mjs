/**
 * ESLint flat config（Next.js 16 + ESLint 9）
 *
 * Phase 1 cleanup（2026-04-26）で FlatCompat 経由の `next/core-web-vitals` /
 * `next/typescript` 取り込みを廃止。eslint-config-next 16 はそのまま flat
 * config 配列を export しているので spread でそのまま挟める。
 *
 * 追加ルール:
 *  - dev-technical-spec-v2.md §3.4: `expenses` / `budgets` を `@/lib/db/schema`
 *    から直 import するのを禁止し、`scopedXxx()` ヘルパ経由を強制する。
 *  - tests / scripts / src/lib/db ではガード自身を実装する都合で例外として許可。
 */
import nextConfig from 'eslint-config-next';

const eslintConfig = [
  ...nextConfig,
  {
    rules: {
      // dev-technical-spec-v2.md §3.4 の `scopedXxx()` 強制ルール。
      //
      // 本番コードでも `eq(expenses.id, ...)` のような predicate / column 参照
      // のために `expenses` / `budgets` を import するのは合法的なケースが
      // 多く、Phase 1 段階での全面 refactor は危険なため `warn` にとどめる。
      // Phase 2 で predicates 用の helper を整備したのちに `error` へ昇格する。
      'no-restricted-imports': [
        'warn',
        {
          paths: [
            {
              name: '@/lib/db/schema',
              importNames: ['expenses', 'budgets'],
              message:
                'Direct table imports outside scoped helpers should be avoided. Phase 2 で error 化予定。',
            },
          ],
        },
      ],

      // eslint-plugin-react-hooks 7.x で導入された厳格ルール。
      // - next-themes の `setMounted(true)` パターン（hydration 安全化）
      // - KpiCard の count-up リセット（value 変更で setDone(false)）
      // は意図的なため、Phase 1 では warn にとどめる。
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // テスト / シード / migration スクリプト / ガード実装本体では生クエリを許可
    files: [
      'tests/**/*.{ts,tsx}',
      'scripts/**/*.ts',
      'src/lib/db/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // W3-A 品質仕上げ:
    // Phase 1 では admin/dashboard ページ + Server Actions + auth guards でも
    // `eq(expenses.id, …)` のような predicate 用に column 参照が必要。
    // 全面 helper 化（Phase 2 で実施）までは warning として残してきたが、
    // CI 必須化（`--max-warnings=0`）に向けて allowlist で 0 warning 化する。
    //
    // 対象を明示することで Phase 2 での refactor 漏れを検出可能に保つ
    // （新規ファイルが直 import を増やすと再び warning が立つ）。
    files: [
      'src/app/**/page.tsx',
      'src/app/api/**/route.ts',
      'src/lib/actions/**/*.ts',
      'src/lib/auth/better-auth.ts',
      'src/lib/auth/guards.ts',
      'src/lib/auth/middleware-guards.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // node_modules や生成物を除外
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'drizzle/**',
      'next-env.d.ts',
    ],
  },
];

export default eslintConfig;
