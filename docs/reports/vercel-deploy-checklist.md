# Coatly Vercel デプロイチェックリスト

> PRJ-015 W3 成果物 — Vercel Hobby に Coatly を本番デプロイするための手順と確認項目。

最終更新: 2026-04-26（W3 完了時点）

---

## 0. 前提

| 項目 | 値 |
|------|----|
| Framework | Next.js 16（App Router / Turbopack） |
| Region | `hnd1`（Tokyo） |
| Plan | Hobby（個人開発者の無料枠） |
| Domain | 既定 `coatly.vercel.app` ／ Preview `*.coatly-preview.vercel.app` |
| Build Command | `pnpm build`（Vercel が自動検出） |
| Output Mode | Serverless Functions（`force-dynamic` ルートあり） |

`vercel.json`（リポジトリ同梱）で region / function memory / maxDuration を固定済み。
`github.silent: true` で Slack 等への自動通知は抑止する。

---

## 1. Vercel プロジェクト作成

1. Vercel ダッシュボード → "Add New..." → "Project"
2. GitHub リポジトリ `claude-code-company` を Import
3. **Root Directory** を `projects/PRJ-015/app` に設定（重要）
4. Framework Preset: **Next.js** を確認（自動検出されるはず）
5. Install Command / Build Command / Output Directory はデフォルトのまま
6. "Environment Variables" は §2 を参照しながら全部入れる
7. "Deploy" を押して初回デプロイ

---

## 2. 環境変数（Vercel Environment Variables）

`Settings → Environment Variables` で以下を登録する。
**Production / Preview 両方** にチェックを入れること（Development はローカルで `.env.local` を使う）。

### 2.1 必須（これが揃わないと起動しない）

| Key | 用途 | 取得方法 |
|-----|------|---------|
| `TURSO_DATABASE_URL` | Turso libSQL 接続 URL | `turso db show coatly --url` |
| `TURSO_AUTH_TOKEN` | Turso 認証トークン | `turso db tokens create coatly` |
| `BETTER_AUTH_SECRET` | Cookie 暗号化キー（32 byte 以上） | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Better Auth が認識する base URL | Production: `https://coatly.vercel.app` ／ Preview: `https://$VERCEL_URL` を直接書くと不可 → Preview は preview ドメインを別環境で固定するか、Production のみ設定で OK |
| `NEXT_PUBLIC_APP_URL` | クライアント側 / メールリンクで使う URL | Production: `https://coatly.vercel.app` |

### 2.2 必須（ファイルアップロード）

| Key | 用途 | 取得方法 |
|-----|------|---------|
| `R2_ACCOUNT_ID` | Cloudflare R2 アカウント ID | Cloudflare ダッシュボード → R2 → Overview |
| `R2_ACCESS_KEY_ID` | R2 API Access Key ID | Cloudflare → R2 → Manage R2 API Tokens → Create API Token（Object Read & Write） |
| `R2_SECRET_ACCESS_KEY` | R2 API Secret Access Key | 同上（発行時に 1 回しか表示されないので保管必須） |
| `R2_BUCKET_NAME` | バケット名 | 推奨値: `coatly-receipts` |

R2 側の追加作業:
1. バケット `coatly-receipts` を作成（Public Access: Disabled）
2. CORS Policy を以下で登録:
   ```json
   [
     {
       "AllowedOrigins": [
         "https://coatly.vercel.app",
         "https://*.coatly-preview.vercel.app",
         "http://localhost:3000"
       ],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

### 2.3 必須（メール送信）

| Key | 用途 | 取得方法 |
|-----|------|---------|
| `RESEND_API_KEY` | Resend API キー | [https://resend.com/api-keys](https://resend.com/api-keys) で発行 |
| `RESEND_FROM` | 送信元アドレス（任意・既定 `Coatly <onboarding@resend.dev>`） | 独自ドメイン認証を行わない間は `onboarding@resend.dev` で OK |

> **注**: `RESEND_API_KEY` 未設定でも build は成功する（`src/lib/email/resend.ts` が console.log fallback に切り替わる）。本番では必ず登録する。

### 2.4 任意（Phase 1 では未使用でも OK）

| Key | 用途 |
|-----|------|
| `KV_REST_API_URL` | Vercel KV Rate Limit（未接続でも build 可） |
| `KV_REST_API_TOKEN` | 同上 |

---

## 3. ドメイン / OAuth / Cookie 設定

| 項目 | 設定 |
|------|------|
| Production Domain | `coatly.vercel.app`（または独自ドメイン） |
| Preview Domains | `*.coatly-preview.vercel.app`（`next.config.ts` の `serverActions.allowedOrigins` で許可済み） |
| HSTS | Vercel が自動付与（コードでは未設定） |
| Cookie | Better Auth は SameSite=Lax + Secure を自動設定 |

`next.config.ts` の CSP には以下が含まれる（変更不要）:
- `connect-src` に `https://*.turso.io`, `https://*.r2.cloudflarestorage.com`, `https://*.vercel.app`, `https://api.resend.com`
- `img-src` に R2 / Vercel Blob

---

## 4. デプロイ後の検証

### 4.1 Health Check

```bash
curl -i https://coatly.vercel.app/api/health
```

期待値:
```json
{ "ok": true, "timestamp": "...", "version": "<7-char-sha>", "db": "up" }
```

`db: "down"` が返る場合は `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` を再確認。

### 4.2 認証フロー

1. `https://coatly.vercel.app/login` に遷移
2. メール / パスワードでログイン or Magic Link を要求
3. Magic Link メールが届けば Resend が動いている
4. ログイン後 `/<organization-slug>` に遷移できれば認証 OK

### 4.3 認可ガード

未ログイン状態で `https://coatly.vercel.app/<any-org-slug>/expenses` にアクセス → `/login?next=...` にリダイレクトされること。

### 4.4 セキュリティヘッダー

```bash
curl -I https://coatly.vercel.app/
```

以下のヘッダーが返ること:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com; ...`
- `Strict-Transport-Security`（Vercel が自動付与）

### 4.5 メール送信疎通

1. `/admin/invitations` から自分の別アドレスに招待メール送信
2. 受信できれば Resend → DNS / 受信ボックスまで疎通済み
3. Production logs に `[email] resend error` が出ていないこと

---

## 5. 初回 Seed データ投入（本番 DB）

ローカルから本番 Turso DB に向けて seed を流す手順:

```bash
# 一時的に .env.local を本番 Turso URL に切り替えるか、
# .env.production.local を作って本番値を書く
cd projects/PRJ-015/app
pnpm db:migrate              # 本番 DB に schema 適用
pnpm db:seed                 # 組織 + 5 県 + FY2026 予算
pnpm db:seed:managers        # 5 県 manager アカウント
```

**注意**: `pnpm db:seed:e2e` は本番では絶対に実行しない（テスト用 fixture が混入する）。

---

## 6. Hobby プラン制約への配慮

| 項目 | 制限 | 対応 |
|------|------|------|
| Build Time | 45 min/build | 現状 build は 60 秒以内で収まっている |
| Bandwidth | 100 GB/month | R2 を直接 GET させるため `next/image` は通さない方針 |
| Function Invocations | 100 GB-hour/month | health check / cron は polling 頻度を控える |
| Function Duration | 10 sec/req（Hobby 既定） | `vercel.json` で auth route のみ 15s に拡張 |
| Function Memory | 1024 MB（Hobby 既定） | upload-url=256MB / health=128MB / auth=512MB に絞る |
| KV Free | 30k commands/day | Phase 1 は KV 未接続のため考慮不要 |

---

## 7. ロールバック手順

1. Vercel ダッシュボード → "Deployments"
2. 直前の安定 deployment の "..." → "Promote to Production"
3. DB schema のロールバックは行わない（Drizzle は forward-only）

---

## 8. 既知の制約 / 残課題（W3 時点）

- **CRON / 定期処理**: Hobby は cron 1 件のみ。月次レポートメールは Phase 2 以降
- **Resend ドメイン認証**: `onboarding@resend.dev` のままだとスパム判定されやすい。本番運用前に独自ドメインの DNS 認証を行うこと
- **Vercel Analytics**: 未導入（W4 / Phase 2 検討）
- **Sentry**: 未導入（同上）

---

## 9. 参照

- `vercel.json`（リポジトリルート: `projects/PRJ-015/app/vercel.json`）
- `next.config.ts`（CSP / serverActions allowedOrigins）
- `.env.example`（環境変数テンプレ）
- `reports/security-baseline.md`（セキュリティ要件）
- `reports/dev-technical-spec-v2.md` §13（デプロイ）
