# Coatly

中国地方テニス部の予算と活動費を管理する Web アプリ（PRJ-015）。

> **部費が、散らからない。**

- **スタック**: Next.js 16 + Turso (libSQL) + Drizzle ORM + Better Auth + Cloudflare R2 + Resend + Vercel Hobby
- **デザイン**: Quiet Luxury Sport（design-concept.md）
- **状態**: Phase 1 W1〜W3 完了（認証 / Server Actions / dashboard / メール / Vercel デプロイ準備）

詳細仕様は `docs/reports/dev-technical-spec-v2.md`、本番デプロイ手順は `docs/reports/vercel-deploy-checklist.md` を参照。

---

## セットアップ

### 1. 依存インストール

```bash
pnpm install
```

`pnpm` がない場合は `npm i -g pnpm` で入れる、または `npm install` でも動作する想定（lockfile は pnpm 推奨）。

### 2. 環境変数

```bash
cp .env.example .env.local
```

`.env.local` を編集し、以下を埋める。

#### Turso

```bash
turso db create coatly
turso db show coatly --url        # → TURSO_DATABASE_URL
turso db tokens create coatly     # → TURSO_AUTH_TOKEN
```

#### Better Auth

```bash
openssl rand -base64 32  # → BETTER_AUTH_SECRET
```

`BETTER_AUTH_URL` は開発時 `http://localhost:3000`、本番は Vercel デフォルトドメイン。

#### Cloudflare R2

1. Cloudflare ダッシュボード → R2 → "Create Bucket"（名前: `coatly-receipts`、Public Access: Disabled）
2. R2 → "Manage R2 API Tokens" → "Create API Token"（permissions: Object Read & Write）
3. 取得した `Account ID / Access Key ID / Secret Access Key` を `.env.local` に設定
4. CORS 設定（バケット → CORS Policy）:
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://coatly.vercel.app"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

#### Resend

[https://resend.com/api-keys](https://resend.com/api-keys) で API Key 発行 → `.env.local` に。

### 3. DB マイグレーション

```bash
pnpm db:generate    # schema.ts から SQL 生成
pnpm db:migrate     # Turso DB に適用
```

### 4. Seed データ投入

```bash
pnpm db:seed              # 組織 + 5 県 + FY2026 予算 (¥800,000 = ¥300K + ¥100K × 5)
pnpm db:seed:managers     # 5 県 manager アカウント（W3 で追加）
```

テストアカウント一覧は `docs/reports/w3-mail-deploy-report.md` の「テストアカウント」セクションを参照。

### 5. 開発サーバ起動

```bash
pnpm dev
```

[http://localhost:3000](http://localhost:3000) でランディングが表示される。

---

## スクリプト

| Command | 説明 |
|---------|------|
| `pnpm dev` | 開発サーバ起動（Turbopack） |
| `pnpm build` | 本番ビルド |
| `pnpm start` | ビルド済みアプリの起動 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest（unit + integration） |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm db:generate` | Drizzle migration 生成 |
| `pnpm db:migrate` | Drizzle migration 適用 |
| `pnpm db:studio` | Drizzle Studio 起動 |
| `pnpm db:seed` | seed データ投入（組織 + 5 県 + FY2026 予算） |
| `pnpm db:seed:e2e` | E2E 用 seed |
| `pnpm db:seed:managers` | 5 県 manager アカウント（W3） |
| `pnpm email:dev` | react-email プレビュー（http://localhost:3001） |
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
├── scripts/
│   ├── seed.ts             # 組織 + 5 県 + FY2026 予算
│   ├── seed-e2e.ts         # E2E fixture
│   └── seed-managers.ts    # 5 県 manager（W3）
├── tests/                  # vitest + playwright
├── public/                 # 静的資産（chugoku-map.svg 等）
├── next.config.ts          # CSP / serverActions
└── vercel.json             # Vercel デプロイ設定（W3）
```

---

## 注意事項

- **無料運用必須**: Turso Free / R2 Free / Vercel Hobby / Better Auth OSS
- **認可は三層防衛**: middleware（proxy.ts）/ requireXxxRole / scopedXxx — 生クエリ禁止
- **Next.js 16**:
  - `middleware.ts` → `proxy.ts` リネーム
  - `useSearchParams()` は `<Suspense>` 必須
  - `useEffect + setState` は `useSyncExternalStore` 推奨

---

## 参照

- `docs/decisions.md`（意思決定ログ DEC-001〜DEC-033）
- `docs/project-brief.md`（プロジェクト全体像）
- `docs/reports/dev-technical-spec-v2.md`（正式技術仕様 v2）
- `docs/reports/security-baseline.md`
- `docs/reports/legal-privacy-policy.md`
- `docs/reports/design-concept.md`
- `docs/reports/design-tokens.md`
- `docs/reports/wow-elements-spec.md`（驚き要素 3 点の仕様）
- `docs/reports/acceptance-criteria-v1.md`（受入基準）
- `docs/reports/vercel-deploy-checklist.md`（本番デプロイ手順）
- `docs/reports/phase1-cleanup-report.md`（Phase 1 クリーンナップ完了報告）
- `RUNBOOK.md`（インシデント対応 / ロールバック / 障害フォールバック）

## ライセンス

Private. © 2026 hironori-oi. All rights reserved.
