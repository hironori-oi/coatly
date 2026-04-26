# Coatly

> **部費が、散らからない。** — 中国地方テニス部の予算と活動費を管理する Web アプリ（PRJ-015）

[![CI](https://github.com/hironori-oi/coatly/actions/workflows/ci.yml/badge.svg)](https://github.com/hironori-oi/coatly/actions/workflows/ci.yml)
[![Lighthouse CI](https://github.com/hironori-oi/coatly/actions/workflows/lighthouse-ci.yml/badge.svg)](https://github.com/hironori-oi/coatly/actions/workflows/lighthouse-ci.yml)
[![Mozilla Observatory](https://github.com/hironori-oi/coatly/actions/workflows/observatory.yml/badge.svg)](https://github.com/hironori-oi/coatly/actions/workflows/observatory.yml)
[![Coverage](https://img.shields.io/badge/coverage-85%25-brightgreen)](./coverage/index.html)
[![Vercel](https://img.shields.io/badge/deploy-Vercel-black?logo=vercel)](https://coatly-mu.vercel.app)

![Dashboard screenshot](./docs/screenshots/dashboard.png)

---

## 概要

- **スタック**: Next.js 16 (App Router) + Turso (libSQL) + Drizzle ORM + Better Auth + Cloudflare R2 + Resend + Vercel Hobby
- **デザイン**: Quiet Luxury Sport（`docs/reports/design-concept.md`）
- **状態**: Phase 1 W1〜W3-A 完了（認証 / Server Actions / dashboard / メール / Vercel デプロイ準備 / 品質仕上げ）
- **リリース**: 2026-05-12（予定）
- **観測**: Sentry + Vercel Analytics + Vercel Speed Insights + Lighthouse CI + Mozilla Observatory（週次）

詳細仕様は `docs/reports/dev-technical-spec-v2.md`、本番デプロイ手順は `DEPLOYMENT.md` を参照。

---

## 主要機能

- 経費申請（領収書添付・状態 FSM: draft → submitted → approved → charged）
- 承認ワークフロー（manager / org admin / owner の三段権限、reclassify による充当先変更）
- 予算管理（org 全体予算 + group 別予算、消化率の可視化）
- 組織 / グループ管理（kind=tennis_club / community / pta などマルチテナント）
- メール招待（Resend + react-email、招待リンクからのオンボーディング）
- 退会（自己退会・soft delete・退会後 cookie 無効化）
- ダッシュボード（月次・年度集計、KPI count-up、予算消化率）
- CSV エクスポート（admin 限定、scope-aware）

---

## Quick Start

```bash
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm` がない場合は `npm i -g pnpm`（または `npm install` でも動作する想定。lockfile は pnpm 推奨）。

[http://localhost:3000](http://localhost:3000) でランディングが表示される。テストアカウントの一覧は `docs/reports/w3-mail-deploy-report.md` の「テストアカウント」セクションを参照。

---

## 環境変数

`.env.local`（local）または Vercel Environment Variables（prod）に以下を設定する。

| キー | 必須 | 用途 |
|---|---|---|
| `TURSO_DATABASE_URL` | yes | Turso DB URL（`turso db show coatly --url`）|
| `TURSO_AUTH_TOKEN` | yes | Turso DB token（`turso db tokens create coatly`）|
| `BETTER_AUTH_SECRET` | yes | 32 byte 以上のランダム文字列（`openssl rand -base64 32`）|
| `BETTER_AUTH_URL` | yes | アプリ URL（local: `http://localhost:3000` / prod: `https://coatly-mu.vercel.app`）|
| `R2_ACCOUNT_ID` | yes | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | yes | R2 API Token の Access Key |
| `R2_SECRET_ACCESS_KEY` | yes | R2 API Token の Secret |
| `R2_BUCKET_NAME` | yes | R2 bucket 名（既定: `coatly-receipts`）|
| `RESEND_API_KEY` | yes | Resend の API key |
| `EMAIL_FROM` | yes | 送信者表示（例: `Coatly <noreply@improver.jp>`）|
| `EMAIL_REPLY_TO` | yes | 返信先（例: `support@improver.jp`）|
| `KV_REST_API_URL` | optional | Vercel KV（rate limit 用、Phase 1 では optional）|
| `KV_REST_API_TOKEN` | optional | Vercel KV |
| `NEXT_PUBLIC_APP_URL` | yes | クライアント側参照 URL（公開可）|
| `SENTRY_DSN` | optional | Sentry DSN（無いときは Sentry 送出スキップ）|
| `SENTRY_ORG` | optional | Sentry org slug（sourcemap upload 用）|
| `SENTRY_PROJECT` | optional | Sentry project slug |
| `SENTRY_AUTH_TOKEN` | optional | Sentry auth token（CI/Vercel build で sourcemap upload）|

`.env.example` がテンプレ。Sentry 系は `next.config.ts` で `withSentryConfig` のオプションとして読まれる。

---

## スクリプト

| Command | 説明 |
|---------|------|
| `pnpm dev` | 開発サーバ（Turbopack）|
| `pnpm build` | 本番ビルド |
| `pnpm start` | ビルド済みアプリ起動 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest（unit + integration）|
| `pnpm test:e2e` | Playwright E2E |
| `pnpm db:generate` | Drizzle migration 生成 |
| `pnpm db:migrate` | Drizzle migration 適用 |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm db:seed` | seed データ投入（組織 + 5 県 + FY2026 予算）|
| `pnpm db:seed:e2e` | E2E 用 seed |
| `pnpm db:seed:managers` | 5 県 manager アカウント（W3）|
| `pnpm email:dev` | react-email プレビュー（http://localhost:3001）|
| `pnpm email:export` | メールテンプレを HTML で書き出し |

---

## ディレクトリ構造

```
app/
├── src/
│   ├── app/                # Next.js App Router（pages / API / layout）
│   ├── components/         # UI コンポーネント
│   ├── emails/             # react-email テンプレ（W3）
│   ├── lib/
│   │   ├── db/             # Drizzle schema / client / scoped helpers
│   │   ├── auth/           # Better Auth / guards
│   │   ├── email/          # Resend ラッパ + notify ヘルパ（W3）
│   │   ├── r2/             # Cloudflare R2 クライアント / 署名 URL
│   │   ├── validation/     # Zod schema
│   │   ├── actions/        # Server Actions
│   │   └── utils/          # cn / format-jpy / invoice
│   └── proxy.ts            # Next 16 proxy（旧 middleware）
├── drizzle/                # migration SQL
├── scripts/                # seed / migrate / cleanup
├── tests/                  # vitest（unit + integration）+ playwright（e2e）
├── docs/                   # decisions / brief / reports / screenshots
├── public/                 # 静的資産（chugoku-map.svg 等）
├── next.config.ts          # CSP / serverActions / Sentry
└── vercel.json             # Vercel デプロイ設定
```

---

## ドキュメント

- `ARCHITECTURE.md` — 技術アーキテクチャ（mermaid 図 / レイヤ / セキュリティモデル）
- `DEPLOYMENT.md` — 本番デプロイ手順（Vercel + Turso + R2 + Resend）
- `RUNBOOK.md` — 障害対応 playbook（DB / R2 / Resend / 認証 / パフォーマンス / ロールバック）
- `docs/decisions.md` — 意思決定ログ（DEC-001 〜）
- `docs/project-brief.md` — プロジェクト全体像
- `docs/reports/dev-technical-spec-v2.md` — 正式技術仕様 v2
- `docs/reports/security-baseline.md` — セキュリティ baseline
- `docs/reports/legal-privacy-policy.md` — プライバシーポリシー / 利用規約
- `docs/reports/design-concept.md` / `design-tokens.md` — デザイン仕様
- `docs/reports/wow-elements-spec.md` — 驚き要素 3 点の仕様
- `docs/reports/acceptance-criteria-v1.md` — 受入基準

---

## 注意事項

- **無料運用必須**: Turso Free / R2 Free / Vercel Hobby / Better Auth OSS
- **認可は三層防衛**: middleware（`proxy.ts`）/ `requireXxxRole` / `scopedXxx` — 生クエリ禁止
- **Next.js 16**:
  - `middleware.ts` → `proxy.ts` リネーム
  - `useSearchParams()` は `<Suspense>` 必須
  - `useEffect + setState` は `useSyncExternalStore` 推奨

---

## ライセンス

Proprietary. © 2026 hironori-oi. All rights reserved.
