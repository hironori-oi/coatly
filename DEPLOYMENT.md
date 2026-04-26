# Coatly DEPLOYMENT

PRJ-015 Coatly の本番デプロイ手順書（5/12 リリース対応）。

- **最終更新**: 2026-04-26（W3-A 仕上げ）
- **本番ドメイン**: `coatly-mu.vercel.app`（Vercel デフォルト。独自 DN は将来検討）
- **対象 Phase**: Phase 1 MVP リリース（5/12）

---

## 1. 前提

- **Vercel プラン**: Hobby / Pro いずれでも可（MVP は Hobby で運用）
  - Hobby 制限: Function invocations 100GB-Hours、Bandwidth 100GB/月、Build 6,000 分/月
  - 5/12 リリース時点では Hobby で十分
- **Turso プラン**: Free（DB 数: 500、reads 1B/月、writes 25M/月、storage 9GB）
- **Cloudflare R2 プラン**: Free（10GB storage、Class A 1M ops/月、Class B 10M ops/月）
- **Resend プラン**: Free（3,000 emails/月、`improver.jp` ドメイン認証済み）
- **Sentry プラン**: Developer（5K errors/月、10K transactions/月、無料）

---

## 2. 初回セットアップ

### 2.1 Vercel project 作成

1. https://vercel.com/new で `hironori-oi/coatly` を import
2. **Framework Preset**: Next.js（自動検出）
3. **Root Directory**: `projects/PRJ-015/app`（monorepo 構成）
4. **Build Command**: `pnpm build`（自動検出）
5. **Install Command**: `pnpm install`
6. **Output Directory**: `.next`（自動）

### 2.2 Vercel Environment Variables 設定

以下 14 keys（必須）+ 4 keys（Sentry / 任意）+ 2 keys（Vercel KV / optional）を Production / Preview / Development に登録する。

#### 必須 14 keys

| Key | Production 値 | 用途 |
|---|---|---|
| `TURSO_DATABASE_URL` | `libsql://coatly-xxxxx.turso.io` | Turso DB |
| `TURSO_AUTH_TOKEN` | `ey...`（72h ローテ推奨）| Turso DB token |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` の出力 | session 署名 |
| `BETTER_AUTH_URL` | `https://coatly-mu.vercel.app` | Better Auth base URL |
| `R2_ACCOUNT_ID` | Cloudflare account id | R2 接続 |
| `R2_ACCESS_KEY_ID` | R2 token の Access Key | R2 PUT/GET |
| `R2_SECRET_ACCESS_KEY` | R2 token の Secret | R2 PUT/GET |
| `R2_BUCKET_NAME` | `coatly-receipts` | R2 bucket |
| `RESEND_API_KEY` | `re_xxxx` | メール送信 |
| `EMAIL_FROM` | `Coatly <noreply@improver.jp>` | 送信者 |
| `EMAIL_REPLY_TO` | `support@improver.jp` | 返信先 |
| `NEXT_PUBLIC_APP_URL` | `https://coatly-mu.vercel.app` | クライアント参照（公開可）|
| `NODE_ENV` | `production`（Vercel 自動）| 環境識別 |
| `VERCEL_ENV` | `production`（Vercel 自動）| デプロイ環境 |

#### Sentry 4 keys（推奨）

| Key | 用途 |
|---|---|
| `SENTRY_DSN` | エラー送出先 DSN |
| `SENTRY_ORG` | sourcemap upload 用 org slug |
| `SENTRY_PROJECT` | sourcemap upload 用 project slug |
| `SENTRY_AUTH_TOKEN` | Vercel build で sourcemap upload する token |

#### Vercel KV 2 keys（optional / Phase 2）

| Key | 用途 |
|---|---|
| `KV_REST_API_URL` | rate limit ストア（Phase 1 は Better Auth 内蔵 in-memory で代替）|
| `KV_REST_API_TOKEN` | 同上 |

### 2.3 Turso 本番 DB 作成

```bash
# 既存 dev DB と分けて prod DB を作る
turso db create coatly-prod --location nrt  # Tokyo (ap-northeast-1 相当)

# URL / token 取得
turso db show coatly-prod --url       # → TURSO_DATABASE_URL
turso db tokens create coatly-prod    # → TURSO_AUTH_TOKEN（推奨: --expiration 90d）
```

`coatly-prod` の URL / token を Vercel env vars（Production scope）に登録。

### 2.4 R2 bucket 作成

1. Cloudflare ダッシュボード → R2 → **Create Bucket**
   - Name: `coatly-receipts`
   - Public Access: **Disabled**
   - Location: Asia-Pacific（自動）
2. **Manage R2 API Tokens** → **Create API Token**
   - Permissions: Object Read & Write
   - Resources: 当該 bucket のみに限定
3. CORS Policy（Bucket → Settings → CORS Policy）:
   ```json
   [
     {
       "AllowedOrigins": [
         "https://coatly-mu.vercel.app",
         "http://localhost:3000"
       ],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

### 2.5 Resend domain authenticate

`improver.jp` は既に認証済み。新規ドメインに切り替える場合は:

1. Resend ダッシュボード → **Domains** → **Add Domain**
2. SPF / DKIM / DMARC レコードを DNS provider（Cloudflare 等）に設定
3. **Verify** をクリックし、Status が `Verified` になるまで待つ（通常 5〜15 分）

---

## 3. リリース手順（5/12 本番リリース）

### 3.1 通常デプロイ

1. `main` ブランチに merge → Vercel が自動 deploy
2. Vercel ダッシュボードで **Production deployment** が `Ready` を確認
3. 必要に応じて本番 migrate:
   ```bash
   TURSO_DATABASE_URL=libsql://coatly-prod-xxxxx.turso.io \
   TURSO_AUTH_TOKEN=ey... \
   pnpm db:migrate
   ```
   - schema 変更が無い release では **不要**
   - 破壊的変更を含む場合は §3.4 ロールバック準備を済ませてから実行

### 3.2 e2e cleanup（初回リリース前は必須）

E2E テスト用の seed user / 組織が本番に残るのを防ぐため、初回リリース前に **必ず実行する**:

```bash
# 件数のみ確認（dry-run）
pnpm db:cleanup-e2e -- --dry-run

# 問題なければ実削除
pnpm db:cleanup-e2e -- --commit
```

- 削除対象: `users.email LIKE 'e2e-%@coatly.local'` + `organizations.slug='e2e-other-org'` 配下
- スクリプト: `scripts/cleanup-e2e-users.ts`（Dev-B 作成）
- 環境変数 `TURSO_DATABASE_URL` が prod を指していることを必ず確認

### 3.3 smoke test

1. https://coatly-mu.vercel.app/login にアクセス
2. 既存ユーザでログイン（owner / admin / member それぞれ）
3. `/dashboard` 表示確認（KPI count-up が動く / 月次グラフが表示される）
4. `/expenses` 一覧確認（pagination / フィルタ）
5. `/expenses/new` で新規申請 → submit → 別アカウントで承認 → メール受信確認
6. `/api/health` が `200 + db: 'up'` を返すこと

### 3.4 Lighthouse CI 結果確認

GitHub Actions の `lighthouse-ci.yml` ワークフロー結果を確認:

- Performance: ≥ 85
- Accessibility: ≥ 95
- Best Practices: ≥ 95
- SEO: ≥ 95

未達の場合はリリース判断を CEO に escalate。

---

## 4. ロールバック手順

### 4.1 アプリケーション

`RUNBOOK.md §5.1` 参照。Vercel Deployments → 直前 Ready → **Promote to Production**。

### 4.2 DB（Drizzle migration の rollback 注意点）

> **Drizzle Kit は forward-only**。自動 down マイグレーションは無い。

破壊的変更（`DROP COLUMN` / `DROP TABLE` / `RENAME` / 既存 column の `NOT NULL` 化等）を含む release は事前準備が必須:

1. **PR 段階**: 対応する down SQL を `drizzle/rollback/<n>_down.sql` に置く
2. **本番適用前**: `turso db dump coatly-prod > backups/<timestamp>.sql` でバックアップ
3. **ロールバック時**:
   ```bash
   turso db shell coatly-prod < drizzle/rollback/<n>_down.sql
   ```
4. アプリ側を §4.1 で旧版に promote（schema と app version の整合）

非破壊的変更（`ADD COLUMN NULLABLE` / `ADD INDEX`）は §4.1 のアプリ promote のみで OK。

### 4.3 緊急 session 一斉ログアウト

`BETTER_AUTH_SECRET` rotate 時 / セキュリティインシデント時:
```sql
DELETE FROM auth_sessions;
```
事前にユーザに告知すること。

---

## 5. 既知の制約 / 注意点

### 5.1 Vercel Hobby の制限

- **Function timeout**: 10s（Free）/ 60s（Pro）
- **Function memory**: 1024MB
- **Bandwidth**: 100GB/月
- **Build minutes**: 6,000 分/月
- 5/12 リリース時点ではいずれも余裕あり。Phase 2 で利用増の場合 Pro 移行検討（DEC-040）

### 5.2 Turso Free の DB 数

- **DB 数上限**: 500（実質無制限）
- **DB size**: 9GB（領収書は R2 なのでメタデータのみ。通常 100MB 未満で推移）
- **embedded replicas**: Free でも 3 リージョンまで可能（Phase 2 検討）

### 5.3 R2 Free の制約

- **Storage**: 10GB
- **Class A operations**（PUT 等）: 1M / 月
- **Class B operations**（GET 等）: 10M / 月
- 領収書 1 枚 ≤ 5MB の制限を `src/lib/validation/expense.ts` で enforce

### 5.4 Resend Free の制約

- **送信量**: 3,000 emails / 月
- 想定: 招待 + 申請通知 + 承認結果通知で 1 ユーザあたり月 5 通程度 → 600 ユーザまで対応可能

### 5.5 Better Auth + libsql の制約

- session 検証は毎リクエスト DB 引きになるため、`cookieCache: { enabled: true, maxAge: 5*60 }` で 5 分キャッシュ
- 副作用として、ban / inactive 化が cookie cache 期限まで有効になる（最大 5 分のラグ）→ `RUNBOOK.md §4.4` で緊急時の cookieCache 無効化手順を記載

---

## 6. デプロイ後チェック（リリース後 24h）

- [ ] Vercel Analytics: P95 / P99 / エラーレートが baseline 内
- [ ] Sentry: 新規 issue が無い、もしくは noise レベル
- [ ] Resend: bounce / complaint 率が 1% 以下
- [ ] Turso: reads / writes が想定範囲内
- [ ] サポート問い合わせの量と内容を記録
- [ ] Lighthouse CI が GitHub Actions で PASS している

---

## 7. 参照ドキュメント

- `README.md` — セットアップ / スクリプト
- `RUNBOOK.md` — 障害対応 playbook
- `ARCHITECTURE.md` — 技術アーキテクチャ
- `docs/reports/vercel-deploy-checklist.md` — Vercel 設定 checklist（W3 で作成）
- `docs/reports/security-baseline.md` — セキュリティ baseline
- `docs/decisions.md` — 意思決定ログ（DEC-038 〜 DEC-045）
