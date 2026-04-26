# PRJ-015 Coatly セキュリティベースライン（Web アプリ）

- **案件ID**: PRJ-015
- **案件名**: Coatly（中国地方テニス部 予算管理 Webアプリ）
- **作成日**: 2026-04-26
- **作成者**: 開発部門 + レビュー部門
- **目的**: DEC-006 残条件 C-02（セキュリティテンプレ追記）の解消。
- **対象範囲**: Phase 1 MVP（Next.js 16 App Router + Turso + Drizzle ORM + Better Auth/Auth.js + Vercel Blob/R2 + Vercel）
- **参照**:
  - `organization/rules/review-checklist.md` §1 セキュリティ
  - `projects/PRJ-015/reports/dev-technical-spec.md`
  - `projects/PRJ-015/decisions.md` DEC-006 / DEC-010
  - PRJ-002 / PRJ-003 KPT（CSRF / Rate Limit / セキュリティヘッダーのテンプレ確立）
  - OWASP Top 10 2021 / OWASP ASVS 4.0

**Phase ラベル定義**:
- **【P1必須】** = Phase 1 MVP リリース時点で実装必須。未実装ならリリース不可。
- **【P2望ましい】** = Phase 2 で実装。MVP 段階では運用回避でカバーする。
- **【P3余裕で】** = Phase 3 以降の拡張テーマ。やれたら良い。

---

## 0. エグゼクティブサマリー

| カテゴリ | Phase 1 必須項目 | 主要対策 |
|---------|-----------------|---------|
| CSRF | Server Action 標準 + Route Handler Origin 検証 | Next.js 16 標準 + 自前ヘルパ |
| Rate Limit | ログイン / 招待検証 / 申請作成 / アップロード | Vercel KV or Upstash Redis（Free tier） |
| ヘッダー | CSP / X-Frame-Options / X-CTO / Referrer-Policy / Permissions-Policy | `next.config.ts` `headers()` |
| 入力検証 | 全 Server Action / Route Handler に Zod | `lib/validators/` |
| SQL Injection | Drizzle のパラメータバインディング徹底 | 生 SQL 禁止 |
| XSS | 危険な innerHTML 直挿入 API の禁止 / sanitize-html | Markdown レンダ無し方針 |
| ファイルアップロード | MIME / size / リネーム / 署名 URL | Vercel Blob or R2 |
| シークレット | Vercel Env Variables / `.gitignore` 厳守 | `.env*` コミット禁止 |
| 依存監査 | Dependabot + `pnpm audit` を CI で | high+ ゼロ |

---

## 1. CSRF 対策

### 1.1 Server Actions（Next.js 16 標準）

- Next.js 16 の Server Actions は **Origin / Host ヘッダの一致検証** を標準で行う（Same-origin policy）。CSRF トークンの自前実装は **不要**。
- ただし以下を **【P1必須】** として明示する:
  - `next.config.ts` の `experimental.serverActions.allowedOrigins` を本番 origin（Vercel default domain）にホワイトリスト指定する。
  - **Server Action から外部 origin への遷移は禁止**（`redirect()` の URL は同一 origin のみ）。

```ts
// next.config.ts
const config: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        "coatly.vercel.app",          // 本番
        "*.coatly-preview.vercel.app", // PR Preview
        "localhost:3000",
      ],
      bodySizeLimit: "12mb",          // 領収証 10MB + 余裕
    },
  },
};
```

### 1.2 Route Handler（`/api/*`）

- Route Handler は Server Actions の同一オリジン保護対象外。**【P1必須】** として明示的なヘルパを実装する。

```ts
// lib/security/csrf.ts
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) throw new Response("forbidden", { status: 403 });
  const url = new URL(origin);
  if (url.host !== host) throw new Response("forbidden", { status: 403 });
}
```

- 適用対象:
  - `/api/exports/*`（CSV ダウンロード等）
  - `/api/webhooks/*` は **別ロジック**（HMAC 署名検証）で保護（後述 §1.3）

### 1.3 Webhook 受信（Phase 2 以降）

- **【P2望ましい】**: Resend / Stripe 等の Webhook は HMAC 署名検証を必須化。
- Phase 1 では Webhook 受信エンドポイントを公開しない方針（メール配信ステータスは Vercel Analytics / Resend ダッシュボード参照で代替）。

### 1.4 SameSite Cookie

- **【P1必須】**: 認証セッション Cookie は `SameSite=Strict; HttpOnly; Secure` を強制。
  - Better Auth / Auth.js v5 の設定で `cookies.sessionToken.options.sameSite = "strict"` を明示。

---

## 2. Rate Limiting

### 2.1 推奨実装

| 候補 | 無料枠 | 推奨用途 |
|------|--------|---------|
| **Vercel KV**（Upstash 由来） | 30,000 req/月、256MB | **Phase 1 第一候補**（Vercel ネイティブ統合・設定 1 分） |
| Upstash Redis | 10,000 cmd/日、256MB | Vercel KV を超える規模の場合 |
| メモリ（Map） | - | **禁止**（PRJ-003 で分散環境動作不可と確認済み） |

### 2.2 適用ポリシー（【P1必須】）

| エンドポイント | 制限 | キー | アクション |
|--------------|------|-----|-----------|
| ログイン試行（メール+PW / Magic Link 発行） | **5 回 / 15 分** / email + IP | `auth:login:{email}:{ip}` | 5 回到達でアカウントロック 15 分 + 監査ログ |
| 招待トークン検証 | **3 回 / 分** / IP | `auth:invite:{ip}` | 3 回到達で 10 分ロック |
| パスワードリセット送信 | **3 回 / 1 時間** / email | `auth:reset:{email}` | 3 回到達で 1 時間ロック |
| 申請作成（createExpense） | **30 件 / 時間** / user | `expense:create:{userId}` | 連続作成 spam 防止 |
| 添付アップロード（signed URL 発行） | **20 件 / 時間** / user | `upload:sign:{userId}` | 大量アップロード抑止 |
| Server Action 全般（fallback） | **120 req / 分** / user | `sa:{userId}` | 全体的な暴走防止 |

### 2.3 実装テンプレ

```ts
// lib/security/rate-limit.ts
import { kv } from "@vercel/kv";

export type RateLimitConfig = {
  key: string;        // 一意なキー
  limit: number;      // 上限回数
  windowSec: number;  // 時間窓（秒）
};

export async function rateLimit(cfg: RateLimitConfig) {
  const now = Date.now();
  const bucket = `rl:${cfg.key}:${Math.floor(now / (cfg.windowSec * 1000))}`;
  const count = await kv.incr(bucket);
  if (count === 1) await kv.expire(bucket, cfg.windowSec);
  if (count > cfg.limit) {
    throw new Error("RATE_LIMIT_EXCEEDED");
  }
  return { remaining: cfg.limit - count };
}
```

### 2.4 アカウントロック仕様（【P1必須】）

- 5 回連続ログイン失敗で **15 分間ロック**。ロック中は正しいパスワードでも拒否。
- ロック発動時に監査ログ（`audit_logs`）に `action='account_locked'` レコードを INSERT。
- ロック解除はロック時間経過 or admin による手動解除（admin UI は Phase 2、Phase 1 は DB 直叩き運用で許容）。

---

## 3. セキュリティヘッダー

### 3.1 `next.config.ts`（【P1必須】）

```ts
// next.config.ts
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // HSTS は Vercel が自動付与（max-age=63072000; includeSubDomains; preload）
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com", // Vercel Analytics
      "style-src 'self' 'unsafe-inline'",                                // Tailwind CSS-in-JS
      "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.r2.cloudflarestorage.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.turso.io wss://*.turso.io https://*.public.blob.vercel-storage.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const config: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
```

### 3.2 各ヘッダーの目的

| ヘッダー | 目的 | Phase |
|---------|------|-------|
| `Strict-Transport-Security` | HTTPS 強制（Vercel 自動付与） | 【P1必須】 |
| `Content-Security-Policy` | XSS / データインジェクション抑止 | 【P1必須】 |
| `X-Frame-Options: DENY` | clickjacking 防止 | 【P1必須】 |
| `X-Content-Type-Options: nosniff` | MIME sniffing 攻撃防止 | 【P1必須】 |
| `Referrer-Policy: strict-origin-when-cross-origin` | リファラ情報漏洩抑制 | 【P1必須】 |
| `Permissions-Policy` | 不要な API 無効化（カメラ等） | 【P1必須】 |
| `Cross-Origin-Opener-Policy: same-origin` | XS-Leaks 緩和 | 【P2望ましい】 |
| `Cross-Origin-Embedder-Policy: require-corp` | サイドチャネル攻撃緩和 | 【P3余裕で】 |
| `Report-To` / `NEL` ヘッダー | CSP 違反レポート | 【P3余裕で】 |

### 3.3 検証（【P1必須】）

- **Mozilla Observatory** でグレード **A 以上** を Phase 1 リリース前に確認。
- **securityheaders.com** で **A+** を目標。
- CI で `curl -I` してヘッダー存在を assert する smoke test を追加。

---

## 4. 入力バリデーション（Zod）

### 4.1 全 Server Action / Route Handler 必須（【P1必須】）

- 受け付ける全入力（formData / JSON body / searchParams）を Zod schema で検証。
- `lib/validators/` 配下に schema を集約し再利用。

```ts
// lib/validators/expense.schema.ts
import { z } from "zod";

export const createExpenseSchema = z.object({
  date: z.coerce.date().max(new Date(), "未来日付不可"),
  description: z.string().min(1).max(500),
  amount: z.coerce.number().int().positive().max(10_000_000),
  invoiceNumber: z.string().regex(/^T\d{13}$/).optional().or(z.literal("")),
});
```

### 4.2 既存 schema が必要な箇所

| 箇所 | schema |
|------|--------|
| `createExpense` / `updateExpense` | `createExpenseSchema` / `updateExpenseSchema` |
| `inviteUser` | `inviteUserSchema`（email + role + groupId） |
| `approveExpense` / `rejectExpense` | `approveSchema`（id + classification + comment?） |
| `setBudget` | `budgetSchema`（fiscalYear + scope + amount） |
| `signedUploadUrl` 発行 | `uploadRequestSchema`（mime + size + expenseId） |

### 4.3 サーバ側で再検証（【P1必須】）

- クライアント側 RHF + Zod に頼らず、**Server Action の冒頭で必ず再検証**。
- 「クライアント検証は UX 用、サーバ検証は信頼境界」の原則。

---

## 5. SQL Injection 対策

### 5.1 Drizzle ORM のパラメータバインディング徹底（【P1必須】）

- 全クエリは Drizzle のクエリビルダ経由（`db.select().from(table).where(eq(...))`）。
- **生 SQL（`sql\`...\`` テンプレートリテラルへのユーザー入力埋め込み）は禁止**。
- 生 SQL がどうしても必要な場合は `sql.raw` を使わず `sql\`... ${param}\`` のパラメータ展開を使用。

```ts
// OK（パラメータバインディング）
const rows = await db.select().from(expenses).where(eq(expenses.userId, userId));

// OK（Drizzle sql タグでパラメータ展開）
const rows = await db.execute(sql`select * from expenses where user_id = ${userId}`);

// NG（文字列結合）
const rows = await db.execute(sql.raw(`select * from expenses where user_id = '${userId}'`));
```

### 5.2 Lint ルール（【P2望ましい】）

- ESLint カスタムルールで `sql.raw(` の使用を `error` に。
- `git grep "sql.raw"` を CI で実行し検出時 fail。

---

## 6. XSS 対策

### 6.1 危険な innerHTML 系 API の禁止（【P1必須】）

- React の `dangerously` 系 props（HTML 直挿入）の使用は **原則禁止**。レビューで検出時は CRITICAL 指摘。
- 例外的に必要な場合は ESLint disable コメント + コードオーナー承認 + `sanitize-html` 適用必須。

### 6.2 Markdown レンダリング

- **Phase 1 では Markdown 入力は受け付けない**（差戻理由 / コメントは plain text のみ）。
- **【P2望ましい】**: Phase 2 で Markdown を導入する場合は `sanitize-html` または `rehype-sanitize` を必須適用。許可タグは `p, br, strong, em, ul, ol, li, code` 等の最小集合。

### 6.3 React の自動エスケープに依存（【P1必須】）

- JSX `{value}` の自動 HTML エスケープに任せる。
- URL を href に渡す場合は `javascript:` スキームを除外（Zod schema で `url()` バリデーション）。

---

## 7. ファイルアップロード安全性（領収証 ≤ 10MB）

### 7.1 検証フロー（【P1必須】）

```
1. クライアント: <ReceiptDropzone> でファイル選択
   - MIME 検証（image/jpeg, image/png, image/webp, image/heic, application/pdf）
   - サイズ検証（≤ 10MB）
   - 拡張子検証（multi-extension 攻撃防止: ".pdf.exe" 拒否）
2. browser-image-compression で WebP 化（PDF/HEIC はそのまま）
3. Server Action: requestUploadUrl({ expenseId, mime, size })
   - Zod 再検証（MIME / size 両方）
   - rate limit (§2.2)
   - 認可（自分の draft 申請のみ）
   - Vercel Blob / R2 の signed PUT URL 発行（TTL 60 秒）
   - **ファイル名は ULID にリネーム保存**: receipts/{groupCode}/{fy}/{expenseId}/{ULID}.{ext}
4. クライアント: signed URL に PUT
5. Server Action: finalizeAttachment({ expenseId, blobUrl, fileName, mime, size })
   - 再度 MIME / size 検証
   - 同一ユーザーが発行した URL であることを sessionId 紐付けで確認
   - DB INSERT
```

### 7.2 サーバ側 MIME 検証（【P1必須】）

- クライアント側 MIME はユーザー操作で偽装可能。
- **サーバ側で magic byte（ファイル先頭バイト）チェック**を実装。
  - JPEG: `FF D8 FF`
  - PNG: `89 50 4E 47`
  - PDF: `25 50 44 46`
  - WebP: `52 49 46 46 .. .. .. .. 57 45 42 50`

```ts
// lib/security/file-magic.ts
export async function detectMime(buf: Uint8Array): Promise<string | null> {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "application/pdf";
  // WebP, HEIC は同様に拡張
  return null;
}
```

### 7.3 ファイル名サニタイズ（【P1必須】）

- アップロード時に **元ファイル名は表示用に DB に保存**するが、**ストレージ上のキーは ULID にリネーム**する。
- パストラバーサル防止: `..` / `/` / `\` を含むファイル名を拒否。

### 7.4 ウイルススキャン（【P2望ましい】）

- Phase 1 では実装せず、サイズ + MIME + ULID リネーム + 署名 URL TTL で代替。
- **【P2望ましい】**: Cloudflare R2 + Workers での スキャン or ClamAV コンテナを Vercel Function 経由で適用。
- **【P3余裕で】**: VirusTotal API 連携で多段スキャン。

### 7.5 サイズ・件数制限（【P1必須】）

| 対象 | 上限 |
|------|------|
| 1 ファイルサイズ | 10 MB |
| 1 申請あたりの添付数 | 5 ファイル |
| ユーザー単位の月間アップロード総量 | 500 MB（rate limit + 集計） |

---

## 8. シークレット管理

### 8.1 Vercel Environment Variables（【P1必須】）

| 変数 | 環境 | 露出 | 用途 |
|-----|------|-----|------|
| `TURSO_DATABASE_URL` | Production / Preview / Development | サーバのみ | Turso 接続 URL |
| `TURSO_AUTH_TOKEN` | Production / Preview / Development | サーバのみ | Turso 認証 |
| `BETTER_AUTH_SECRET` | Production / Preview / Development | サーバのみ | セッション署名 |
| `RESEND_API_KEY` | Production / Preview | サーバのみ | メール送信 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Production / Preview | サーバのみ | Vercel KV（rate limit） |
| `BLOB_READ_WRITE_TOKEN` | Production / Preview | サーバのみ | Vercel Blob |
| `NEXT_PUBLIC_APP_URL` | Production / Preview / Development | クライアント | 公開 URL のみ |

### 8.2 .gitignore 厳守（【P1必須】）

```gitignore
# Local env files
.env
.env.local
.env*.local
.env.development
.env.production

# Secrets
*.pem
*.key
secrets/
```

- **`NEXT_PUBLIC_*` 接頭辞の変数に秘密情報を入れない**ことをコードレビューで毎回確認。
- 過去事例（PRJ-002 KPT）: サーバ専用キーを `NEXT_PUBLIC_*` に置いてバンドルに混入する事故を防ぐ。

### 8.3 ローテーション方針（【P2望ましい】）

- `BETTER_AUTH_SECRET` は **6 ヶ月ごと**に手動ローテーション。
- 漏洩疑義時は即時ローテーション + 全セッション失効。
- ローテーション手順を `RUNBOOK.md` に記載。

### 8.4 .env.example のメンテ（【P1必須】）

- リポジトリに `.env.example` を置き、**値は空欄 or プレースホルダ**で必要な変数名のみ列挙。
- 新規追加時は PR 必須化。

---

## 9. 依存関係監査

### 9.1 Dependabot（【P1必須】）

- `.github/dependabot.yml` を初期コミットに含める。
- npm 週次 / GitHub Actions 月次で更新 PR 自動作成。
- security update は `security-updates` カテゴリで即時マージ可能にする。

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "monthly"
```

### 9.2 CI で `pnpm audit`（【P1必須】）

```yaml
# .github/workflows/ci.yml の audit job
audit:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v3
    - run: pnpm install --frozen-lockfile
    - run: pnpm audit --audit-level=high
```

- **HIGH 以上の脆弱性が出たら CI fail**。納品ブロッカー扱い。

### 9.3 ライセンス監査（【P2望ましい】）

- `pnpm licenses ls` で GPL 系の混入をチェック（自社プロダクト/SaaS化視野のため）。

---

## 10. OWASP Top 10 2021 対応マッピング

| OWASP 項目 | 本案件での主要リスク | 対応 §（本書）| Phase |
|-----------|---------------------|--------------|-------|
| **A01: Broken Access Control** | 県スコープ漏れ・他県の expense 閲覧 | アプリ層認可（DEC-010 R-Turso-02）/ §4 入力検証 / `requireRole` ヘルパ徹底 | 【P1必須】 |
| **A02: Cryptographic Failures** | セッション Cookie 漏洩 / 領収証 URL 漏洩 | §1.4 SameSite Strict / §3.1 HSTS / §7.1 署名 URL TTL=60s | 【P1必須】 |
| **A03: Injection（SQL/XSS/CMD）** | SQL Injection / XSS | §5 Drizzle bind / §6 React 自動エスケープ | 【P1必須】 |
| **A04: Insecure Design** | RLS が DB 層で強制できない設計（Turso） | アプリ層 `requireRole` + 認可漏れ E2E（受入基準 §C-04） | 【P1必須】 |
| **A05: Security Misconfiguration** | ヘッダー / Cookie 設定漏れ | §3 セキュリティヘッダー / §1.4 Cookie | 【P1必須】 |
| **A06: Vulnerable & Outdated Components** | 依存ライブラリ脆弱性 | §9 Dependabot + audit | 【P1必須】 |
| **A07: Identification & Auth Failures** | ブルートフォース / セッション固定 | §2.2 ログイン Rate Limit + アカウントロック / §1.4 Cookie / §8 secret rotation | 【P1必須】 |
| **A08: Software & Data Integrity Failures** | 領収証改ざん / 監査ログ改ざん | §7 ULID リネーム / `audit_logs` は INSERT only / Phase 2 でハッシュ署名 | 【P2望ましい】 |
| **A09: Security Logging & Monitoring Failures** | 不正検知の遅れ | `audit_logs` トリガ / Sentry（P1.5）/ ログイン失敗ログ | 【P1必須】 |
| **A10: Server-Side Request Forgery (SSRF)** | 外部 URL を fetch する機能なし | 該当機能なし。Phase 2 で OCR 連携時に再評価 | 【P2望ましい】 |

---

## 11. 開発・運用ルール（チェックリスト）

### 11.1 PR レビュー時必須チェック（【P1必須】）

- [ ] 全 Server Action / Route Handler に `requireAuth()` または `requireRole()`
- [ ] 全入力に Zod schema 適用
- [ ] React の HTML 直挿入 props（`dangerously` 系）の新規使用なし
- [ ] `sql.raw` の新規使用なし
- [ ] `NEXT_PUBLIC_*` への秘密情報混入なし
- [ ] `.env*` の差分なし
- [ ] 新規外部 origin（fetch / img src）が CSP に追加されている

### 11.2 リリース前 smoke test（【P1必須】）

- [ ] `curl -I {prod}` でヘッダー全項目存在を確認
- [ ] Mozilla Observatory A 以上
- [ ] securityheaders.com A+
- [ ] `pnpm audit --audit-level=high` ゼロ
- [ ] 5 回ログイン失敗でアカウントロック発動を確認
- [ ] 領収証アップロードで MIME 偽装（拡張子 `.exe` 改名）が拒否されることを確認

### 11.3 インシデント対応（【P2望ましい】）

- 個人情報漏えい時の **72 時間以内** 個人情報保護委員会通知（個人情報保護法 26 条）
- インシデント発生時の連絡フロー: オーナー → CEO → 開発 → 必要に応じ専門家
- `RUNBOOK.md` に記載（Phase 1 リリース前完成必須）

---

## 12. dev-technical-spec.md への追記反映

本書の §1〜§10 は dev-technical-spec.md §3（認証・認可）と §13（CI/CD）の付録として位置づける。
W1 着手時に dev-technical-spec.md に以下のセクションを追記する:

- §3.5 「CSRF / Rate Limit / セキュリティヘッダー」 → 本書 §1〜§3 を要約
- §13.4 「依存監査 + Dependabot」 → 本書 §9 を要約
- §17（新規） 「セキュリティベースライン参照」 → 本書全体を参照

---

## 13. 改訂履歴

| 日付 | 内容 | 作成者 |
|------|------|-------|
| 2026-04-26 | 初版作成（DEC-006 C-02 解消） | 開発 + レビュー部門 |

---

**本書は DEC-006 残条件 C-02 の成果物として CEO 承認をもって有効化する。**
