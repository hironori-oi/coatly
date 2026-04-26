# PRJ-015 Coatly 統合技術設計書 v2（Technical Spec v2 / Turso スタック確定版）

- **案件ID**: PRJ-015
- **案件名**: Coatly（中国地方テニス部 → SaaS化視野の予算管理 Webアプリ）
- **作成日**: 2026-04-26
- **作成者**: 開発部門
- **ステータス**: Phase 0 → Phase 1 着手前 設計提案 v2（CEO 決裁待ち / DEC-011 候補）
- **位置づけ**: v1（Supabase ベース）の **完全置き換え**。v1 は archive 扱いとして残置。
- **参照**:
  - `decisions.md` DEC-009（SaaS 化視野 + FY2026 予算）/ DEC-010（Turso 採用）
  - `research-turso-ecosystem.md`（v2 スタック確定根拠）
  - `security-baseline.md`（C-02 / 全 P1 必須項目）
  - `legal-privacy-policy.md`（C-03 / 7 年保存・退会 30 日後削除）
  - `acceptance-criteria-v1.md`（C-04 / 22 客観指標）
  - `figma-schedule.md`（C-05 / Designer 並行 6 人日）
  - `pm-requirements-wbs.md`（22 ストーリー / WBS）
  - `design-concept.md`（A 案 Quiet Luxury Sport トークン）
  - `organization/rules/tech-stack.md`（Next.js 16 注意点 / `proxy.ts`）
  - `organization/knowledge/prj-002-lessons-learned.md`（マルチテナント / セキュリティ標準）

---

## 0. エグゼクティブサマリー

| 項目 | 確定案 v2 |
|------|-----------|
| 統合スタック1ライナー | **`Next.js 16 + Turso(libSQL) + Drizzle ORM + Better Auth + Cloudflare R2 + Resend + Vercel Hobby`**（UI: shadcn/ui + Tailwind v4 + Tremor + Framer Motion + Geist Sans + Noto Sans JP）|
| データモデル | **10 エンティティ + Better Auth 4 テーブル**（汎用テナント `organizations + groups`、SaaS 化対応）|
| 認可方式 | **アプリ層三層防衛**（middleware / `requireXxxRole()` / `scopedXxx()` クエリビルダ強制）+ ESLint カスタムルール |
| ファイル | Cloudflare R2 `coatly-receipts`（private）、署名 URL（PUT TTL=300s / GET TTL=60s）、ULID 命名 |
| 状態管理 | Server Components ベース + TanStack Query（楽観更新） + Server Actions（変更系）。**Realtime なし**（楽観更新 + `revalidatePath` + 30s ポーリング） |
| Phase 1 MVP 工数 | **約 41 人日 / 8 週**（v1: 38 人日から +3 人日。法務 / セキュリティ追加分は別途で +5 人日 → 総 46 人日 / 9 週、PM WBS 整合）|
| Go 判定 | **Conditional Go**（Better Auth / R2 セットアップの POC を W1 中に行うことを条件に着手）|
| FY2026 seed | テニス部全体 ¥300,000 + 5 県各 ¥100,000（DEC-009 Q-03）|

---

## 1. システムアーキテクチャ v2

### 1.1 全体構成図

```
┌──────────────────────────────────────────────────────────────┐
│                       Browser (Client)                        │
│   Next.js 16 Client Components / TanStack Query / RHF + Zod   │
└──────────────────────────────────────────────────────────────┘
                              │ HTTPS
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  Vercel Hobby (Edge / Node.js Runtime)                        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Next.js 16 App Router                                  │  │
│  │  ・Server Components（読み取り：scopedXxx 経由）         │  │
│  │  ・Server Actions（変更：申請/承認/招待/予算）            │  │
│  │  ・Route Handlers /api/*（Webhook / Cron / Export）     │  │
│  │  ・proxy.ts（Next 16: 旧 middleware → ルーティングガード）│  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  認可層（lib/auth/guards.ts）                            │  │
│  │  ・requireUser / requireOrganizationRole               │  │
│  │  ・requireGroupRole / requireExpenseAccess             │  │
│  │  ・scopedExpenses(ctx) などクエリビルダヘルパ            │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                              │
        ┌──────────────────┬──┴──────────────┬──────────────────┐
        ▼                  ▼                 ▼                  ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌──────────────┐
│  Turso       │  │  Better Auth     │  │  Cloudflare  │  │  Resend      │
│  (libSQL)    │  │  (Drizzle adptr) │  │  R2          │  │  (Email)     │
│  primary     │  │  - email/pw      │  │  receipts    │  │  - 招待       │
│  + edge      │  │  - magic-link    │  │  bucket      │  │  - 通知       │
│  replicas    │  │  - organization  │  │  + signed    │  │  + React      │
│  (Phase 3)   │  │  - invitation    │  │    URL       │  │    Email      │
└──────────────┘  └──────────────────┘  └──────────────┘  └──────────────┘
        ▲                                       ▲
        │ scopedXxx() のみ通過                   │ presigned URL（TTL短）
        │                                       │
┌────────────────────────────────────────────────────────────────┐
│  Vercel KV（rate limit）                                        │
│  - ログイン試行 / 招待検証 / アップロード（security-baseline §2）│
└────────────────────────────────────────────────────────────────┘
```

### 1.2 1パスシーケンス（活動費入力 → 承認 → 集計）

```
[一般ユーザー (member)]
  1) /[orgSlug]/expenses/new で React Hook Form 入力（drizzle-zod から生成された schema 適用）
  2) 領収証ファイル選択 → クライアント側で WebP 圧縮
  3) "ドラフト保存" クリック
       │ Server Action: createDraftExpense(formData)
       ▼
  [Server Action]
  4) requireUser() / requireGroupRole(groupId, ['member','manager']) / Zod 再検証
  5) rate-limit (createExpense) チェック
  6) INSERT expenses (status='draft', organizationId, groupId, userId)
  7) クライアントに expenseId 返却
       ▼
  8) <ReceiptDropzone> 経由でアップロード:
       ├ Server Action: getUploadUrl(expenseId, mime, size)
       │   - requireExpenseAccess(expenseId) で「自分の draft」を確認
       │   - rate-limit (uploadSign) チェック
       │   - R2 PutObject 署名 URL 発行（TTL=300s）+ key = `{orgId}/{expenseId}/{ulid}.{ext}`
       │   - 返却 (uploadUrl, objectKey)
       ├ Client: PUT uploadUrl with file
       └ Server Action: confirmUpload(expenseId, objectKey, mime, size)
           - magic byte 検証
           - INSERT expense_attachments
           - UPDATE expenses SET hasReceipt=true
       ▼
  9) "申請する" クリック → Server Action: submitExpense(expenseId)
       │ requireExpenseAccess + scopedExpenses ヘルパ
       │ UPDATE expenses SET status='submitted'
       │ INSERT approval_logs (action='submit', from=draft, to=submitted)
       │ INSERT audit_logs
       │ Resend 経由で県管理者へ「承認待ち」通知メール
       ▼
[県管理者 (manager)]
 10) 30s ポーリングまたは手動 refetch でダッシュボードに反映
 11) /[orgSlug]/expenses/[id] サイドパネル → 領収証プレビュー
       │ Server Action: getViewUrl(attachmentId) → R2 GetObject 署名 URL（TTL=60s）
 12) 充当先選択 + "承認" クリック → Server Action: approveExpense(id, classification)
       │ requireGroupRole(groupId, ['manager']) または requireOrganizationRole(orgId, ['admin'])
       │ UPDATE expenses SET status, classification, approvedBy, approvedAt
       │ INSERT approval_logs / audit_logs
       │ revalidatePath('/[orgSlug]/dashboard') / revalidatePath('/[orgSlug]/expenses')
       │ Resend 経由で申請者へ「承認されました」通知メール
       ▼
 13) ダッシュボード = Server Component で v_group_summary（通常 View）SELECT
 14) 県別/全体の予算消化バー・KPI が次回アクセス時に反映（楽観更新で即時 UI も）
```

### 1.3 技術スタック確定表

| カテゴリ | 技術 | バージョン目安 | 選定理由 |
|---------|------|--------------|---------|
| Frontend Framework | Next.js | 16.x（App Router）| 組織標準 / Server Actions / PPR / `proxy.ts` |
| Language | TypeScript | 5.x | 型安全 |
| UI | shadcn/ui + Tailwind CSS | tailwind v4 | 組織標準 / `@theme` トークン互換 |
| Charts | Tremor + Recharts | latest | ダッシュボード品質を最短達成 |
| Animation | Framer Motion + @number-flow/react + Sonner | latest | カウントアップ / トースト / マップ hover |
| State | TanStack Query | v5 | 組織標準 / 楽観更新 / 30s ポーリング |
| Forms | React Hook Form + Zod + drizzle-zod | latest | schema → 型・Zod 自動生成 |
| Theme | next-themes | latest | ダーク（Phase 2 だが設計のみ準備）|
| **Backend Runtime** | Vercel Server Actions / Route Handlers | Next 16 | Server Actions 無制限（Hobby）|
| **DB** | Turso（libSQL）| latest | DEC-010 確定 / Free 9GB / Edge replica |
| **ORM** | Drizzle ORM + drizzle-kit + drizzle-zod | latest | Turso 公式 / Edge OK / Zod 連携 |
| **Auth** | Better Auth | v1.0+ | OSS 無料 / Drizzle adapter 公式 / organization plugin |
| **Storage** | Cloudflare R2 + @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner | latest | Free 10GB / egress 無料 / S3 互換 |
| **Email** | Resend + React Email | latest | DEC-002 維持 / 3,000 通/月 |
| **Realtime** | なし（楽観更新 + revalidatePath + 30s ポーリング）| - | DEC-010 / MVP 簡素化 |
| **Rate Limit** | Vercel KV（@vercel/kv）| latest | security-baseline §2 / Free 30K req/月 |
| Hosting | Vercel Hobby | - | Free / Server Actions 無制限 |
| Test | Vitest + Playwright + @axe-core/playwright | latest | 組織標準 |
| CI | GitHub Actions | - | typecheck / lint / test / build / lighthouse / audit |
| Monitor | Vercel Analytics（Sentry は Phase 1.5）| - | 軽量起動 |

---

## 2. データモデル v2（SaaS 化対応）

### 2.1 エンティティ一覧（10 + Better Auth 4 テーブル）

| # | テーブル | 説明 |
|---|---------|------|
| 1 | `organizations` | 汎用テナント（テニス部 / 他部活 / 町内会 / PTA 等）|
| 2 | `groups` | 県 / 支部 / チーム等の汎用サブグループ |
| 3 | `users` | プロフィール（Better Auth user.id を pk として参照）|
| 4 | `memberships` | user × organization の所属 + role（owner/admin/member）|
| 5 | `group_memberships` | user × group の所属 + role（manager/member）|
| 6 | `budgets` | 年度予算（org 全体 or group 単位）|
| 7 | `expenses` | 活動費申請 |
| 8 | `expense_attachments` | 領収証ファイル（R2 object key）|
| 9 | `approval_logs` | 承認 FSM の全遷移履歴 |
| 10 | `audit_logs` | 全テーブル変更監査 |
| BA-1 | `auth_sessions` | Better Auth セッション |
| BA-2 | `auth_accounts` | Better Auth OAuth/メール認証情報 |
| BA-3 | `auth_verification_tokens` | メール検証 / マジックリンクトークン |
| BA-4 | `auth_organizations` | Better Auth organization plugin（`organizations` と 1:1 同期）|

### 2.2 Drizzle スキーマ TS（実装可能レベル / `lib/db/schema.ts`）

```ts
import { sqliteTable, text, integer, index, unique, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql, relations } from 'drizzle-orm';
import { ulid } from 'ulidx';

// ─── Enums（SQLite では text + CHECK でエミュレート） ──────────────────

export const ORGANIZATION_KIND = ['tennis_club', 'club_other', 'community', 'pta', 'npo', 'other'] as const;
export const GROUP_KIND = ['prefecture', 'branch', 'team', 'other'] as const;
export const ORG_ROLE = ['owner', 'admin', 'member'] as const;
export const GROUP_ROLE = ['manager', 'member'] as const;
export const EXPENSE_STATUS = [
  'draft', 'submitted', 'approved', 'rejected',
  'charged_to_group', 'charged_to_organization',
] as const;
export const EXPENSE_CLASSIFICATION = ['group_funded', 'organization_funded', 'personal'] as const;
export const APPROVAL_ACTION = ['submit', 'approve', 'reject', 'reclassify', 'withdraw'] as const;
export const AUDIT_ACTION = ['create', 'update', 'delete'] as const;

// ─── 1. organizations ───────────────────────────────────────────

export const organizations = sqliteTable(
  'organizations',
  {
    id: text('id').primaryKey().$defaultFn(() => ulid()),
    slug: text('slug').notNull(),                          // URL: /[organizationSlug]/...
    kind: text('kind', { enum: ORGANIZATION_KIND }).notNull(),
    name: text('name').notNull(),
    fiscalYearStartMonth: integer('fiscal_year_start_month').notNull().default(4),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    uqSlug: unique('uq_org_slug').on(t.slug),
    chkFiscal: sql`CHECK (${t.fiscalYearStartMonth} BETWEEN 1 AND 12)`,
  }),
);

// ─── 2. groups ─────────────────────────────────────────────────

export const groups = sqliteTable(
  'groups',
  {
    id: text('id').primaryKey().$defaultFn(() => ulid()),
    organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: GROUP_KIND }).notNull(),
    code: text('code').notNull(),                          // 'okayama', ...
    name: text('name').notNull(),                          // '岡山県', ...
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    uqOrgCode: unique('uq_group_org_code').on(t.organizationId, t.code),
    idxOrg: index('idx_groups_org').on(t.organizationId),
  }),
);

// ─── 3. users（Better Auth user.id を継承） ──────────────────────

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),                           // = Better Auth user.id
    email: text('email').notNull(),
    name: text('name'),
    image: text('image'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    uqEmail: unique('uq_users_email').on(t.email),
  }),
);

// ─── 4. memberships（user × organization） ─────────────────────

export const memberships = sqliteTable(
  'memberships',
  {
    id: text('id').primaryKey().$defaultFn(() => ulid()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ORG_ROLE }).notNull(),
    homeGroupId: text('home_group_id').references(() => groups.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    uqUserOrg: unique('uq_mem_user_org').on(t.userId, t.organizationId),
    idxOrg: index('idx_mem_org').on(t.organizationId),
    idxUser: index('idx_mem_user').on(t.userId),
  }),
);

// ─── 5. group_memberships（user × group） ──────────────────────

export const groupMemberships = sqliteTable(
  'group_memberships',
  {
    id: text('id').primaryKey().$defaultFn(() => ulid()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    role: text('role', { enum: GROUP_ROLE }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    uqUserGroup: unique('uq_gm_user_group').on(t.userId, t.groupId),
    idxGroup: index('idx_gm_group').on(t.groupId),
    idxUser: index('idx_gm_user').on(t.userId),
  }),
);

// ─── 6. budgets ───────────────────────────────────────────────

export const budgets = sqliteTable(
  'budgets',
  {
    id: text('id').primaryKey().$defaultFn(() => ulid()),
    organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),  // NULL = 全体予算
    fiscalYear: integer('fiscal_year').notNull(),
    amountJpy: integer('amount_jpy').notNull(),
    note: text('note'),
    createdBy: text('created_by').notNull().references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    uqYearScope: unique('uq_budget_year_scope').on(t.organizationId, t.groupId, t.fiscalYear),
    idxOrg: index('idx_budgets_org').on(t.organizationId),
    chkAmount: sql`CHECK (${t.amountJpy} >= 0)`,
  }),
);

// ─── 7. expenses ──────────────────────────────────────────────

export const expenses = sqliteTable(
  'expenses',
  {
    id: text('id').primaryKey().$defaultFn(() => ulid()),
    organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'restrict' }),
    groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'restrict' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    fiscalYear: integer('fiscal_year').notNull(),
    date: integer('date', { mode: 'timestamp' }).notNull(),
    description: text('description').notNull(),
    amountJpy: integer('amount_jpy').notNull(),
    hasReceipt: integer('has_receipt', { mode: 'boolean' }).notNull().default(false),
    invoiceNumber: text('invoice_number'),                 // ^T\d{13}$
    status: text('status', { enum: EXPENSE_STATUS }).notNull().default('draft'),
    classification: text('classification', { enum: EXPENSE_CLASSIFICATION }),
    approvedBy: text('approved_by').references(() => users.id),
    approvedAt: integer('approved_at', { mode: 'timestamp' }),
    rejectionReason: text('rejection_reason'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    idxOrgStatus: index('idx_exp_org_status').on(t.organizationId, t.status),
    idxGroupStatus: index('idx_exp_group_status').on(t.groupId, t.status),
    idxUser: index('idx_exp_user').on(t.userId),
    idxYear: index('idx_exp_year').on(t.fiscalYear),
    idxDate: index('idx_exp_date').on(t.date),
    chkAmount: sql`CHECK (${t.amountJpy} > 0)`,
    chkDescLen: sql`CHECK (length(${t.description}) BETWEEN 1 AND 500)`,
    chkInvoice: sql`CHECK (${t.invoiceNumber} IS NULL OR ${t.invoiceNumber} GLOB 'T[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]')`,
  }),
);

// ─── 8. expense_attachments ───────────────────────────────────

export const expenseAttachments = sqliteTable(
  'expense_attachments',
  {
    id: text('id').primaryKey().$defaultFn(() => ulid()),
    expenseId: text('expense_id').notNull().references(() => expenses.id, { onDelete: 'cascade' }),
    r2ObjectKey: text('r2_object_key').notNull(),         // {orgId}/{expenseId}/{ulid}.{ext}
    fileName: text('file_name').notNull(),                 // 元ファイル名（表示用）
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedBy: text('uploaded_by').notNull().references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    idxExp: index('idx_attach_exp').on(t.expenseId),
    uqKey: unique('uq_attach_key').on(t.r2ObjectKey),
    chkMime: sql`CHECK (${t.mimeType} IN ('image/jpeg','image/png','image/webp','image/heic','application/pdf'))`,
    chkSize: sql`CHECK (${t.sizeBytes} BETWEEN 1 AND 10485760)`,  // 10MB
  }),
);

// ─── 9. approval_logs ─────────────────────────────────────────

export const approvalLogs = sqliteTable(
  'approval_logs',
  {
    id: text('id').primaryKey().$defaultFn(() => ulid()),
    expenseId: text('expense_id').notNull().references(() => expenses.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').notNull().references(() => users.id),
    action: text('action', { enum: APPROVAL_ACTION }).notNull(),
    fromStatus: text('from_status', { enum: EXPENSE_STATUS }),
    toStatus: text('to_status', { enum: EXPENSE_STATUS }).notNull(),
    comment: text('comment'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    idxExp: index('idx_appr_exp').on(t.expenseId, t.createdAt),
  }),
);

// ─── 10. audit_logs ───────────────────────────────────────────

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: text('organization_id').references(() => organizations.id),
    actorId: text('actor_id').references(() => users.id),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    action: text('action', { enum: AUDIT_ACTION }).notNull(),
    diff: text('diff', { mode: 'json' }).$type<Record<string, unknown>>(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    idxOrg: index('idx_audit_org').on(t.organizationId),
    idxEntity: index('idx_audit_entity').on(t.entity, t.entityId),
    idxActor: index('idx_audit_actor').on(t.actorId),
  }),
);

// ─── Better Auth tables（adapter が自動生成）────────────────────

export const authSessions = sqliteTable('auth_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
});

export const authAccounts = sqliteTable('auth_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  accountId: text('account_id').notNull(),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
});

export const authVerificationTokens = sqliteTable('auth_verification_tokens', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

// ─── Relations（Drizzle） ───────────────────────────────────────

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  organization: one(organizations, { fields: [expenses.organizationId], references: [organizations.id] }),
  group: one(groups, { fields: [expenses.groupId], references: [groups.id] }),
  user: one(users, { fields: [expenses.userId], references: [users.id] }),
  attachments: many(expenseAttachments),
  approvalLogs: many(approvalLogs),
}));
// 他テーブルも同様に定義
```

### 2.3 集計 View（`v_group_summary`）

```sql
-- drizzle migration（手書き SQL）
CREATE VIEW v_group_summary AS
SELECT
  g.id AS group_id,
  g.organization_id,
  g.code,
  g.name,
  e.fiscal_year,
  COALESCE(b.amount_jpy, 0) AS budget_jpy,
  COALESCE(SUM(CASE WHEN e.status IN ('approved','charged_to_group') THEN e.amount_jpy END), 0) AS spent_jpy,
  COUNT(CASE WHEN e.status = 'submitted' THEN 1 END) AS pending_count
FROM groups g
LEFT JOIN expenses e ON e.group_id = g.id
LEFT JOIN budgets b ON b.group_id = g.id AND b.fiscal_year = e.fiscal_year
GROUP BY g.id, g.organization_id, g.code, g.name, e.fiscal_year, b.amount_jpy;
```

### 2.4 マイグレーション運用

- `pnpm drizzle-kit generate` で `drizzle/migrations/0001_init.sql` 生成
- `pnpm drizzle-kit migrate` でローカル / CI / 本番に適用
- 本番適用は GitHub Actions の main マージ時 + 手動 approve（環境変数 `TURSO_DATABASE_URL` 切替）
- View は migration 末尾に手書き SQL で追加

---

## 3. 認可（アプリ層 RLS 相当）— 三層防衛

### 3.1 第1層: middleware ルーティングガード

```ts
// src/proxy.ts（Next.js 16: 旧 middleware）
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from '@/lib/auth/session';

export async function proxy(req: NextRequest) {
  const url = req.nextUrl.pathname;
  const isPublic = url.startsWith('/login')
    || url.startsWith('/invite')
    || url.startsWith('/privacy')
    || url.startsWith('/terms');
  if (isPublic) return NextResponse.next();

  const session = await getSessionCookie(req);
  if (!session) {
    const login = new URL('/login', req.url);
    login.searchParams.set('next', url);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
```

### 3.2 第2層: Server Action / Route Handler ガード

```ts
// lib/auth/guards.ts
import { auth } from '@/lib/auth/better-auth';
import { db } from '@/lib/db/client';
import { memberships, groupMemberships, expenses } from '@/lib/db/schema';
import { eq, and, type InferSelectModel } from 'drizzle-orm';
import { forbidden, unauthorized } from '@/lib/errors';

export type User = InferSelectModel<typeof users>;
export type AuthContext = {
  user: User;
  organizationId: string;
  orgRole: 'owner' | 'admin' | 'member';
  visibleGroupIds: string[];        // 所属 group + admin の場合は組織内全 group
  managedGroupIds: string[];        // role='manager' の group のみ
};

export async function requireUser(): Promise<User> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw unauthorized();
  const u = await db.select().from(users).where(eq(users.id, session.user.id)).get();
  if (!u || !u.isActive) throw unauthorized();
  return u;
}

export async function requireOrganizationRole(
  organizationId: string,
  allowedRoles: Array<'owner' | 'admin' | 'member'>,
): Promise<AuthContext> {
  const user = await requireUser();
  const m = await db.select()
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.organizationId, organizationId)))
    .get();
  if (!m || !allowedRoles.includes(m.role)) throw forbidden();

  // visible / managed group の解決
  const gms = await db.select()
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(and(eq(groupMemberships.userId, user.id), eq(groups.organizationId, organizationId)));

  const isAdmin = m.role === 'owner' || m.role === 'admin';
  const visibleGroupIds = isAdmin
    ? (await db.select({ id: groups.id }).from(groups).where(eq(groups.organizationId, organizationId))).map(r => r.id)
    : gms.map(r => r.group_memberships.groupId);
  const managedGroupIds = gms.filter(r => r.group_memberships.role === 'manager').map(r => r.group_memberships.groupId);

  return { user, organizationId, orgRole: m.role, visibleGroupIds, managedGroupIds };
}

export async function requireGroupRole(
  groupId: string,
  allowedRoles: Array<'manager' | 'member'>,
): Promise<{ user: User; role: 'manager' | 'member' }> {
  const user = await requireUser();
  const gm = await db.select()
    .from(groupMemberships)
    .where(and(eq(groupMemberships.userId, user.id), eq(groupMemberships.groupId, groupId)))
    .get();
  if (!gm || !allowedRoles.includes(gm.role)) throw forbidden();
  return { user, role: gm.role };
}

export async function requireExpenseAccess(
  expenseId: string,
  mode: 'read' | 'write',
): Promise<{ ctx: AuthContext; expense: InferSelectModel<typeof expenses> }> {
  const user = await requireUser();
  const e = await db.select().from(expenses).where(eq(expenses.id, expenseId)).get();
  if (!e) throw forbidden();
  const ctx = await requireOrganizationRole(e.organizationId, ['owner', 'admin', 'member']);

  // member: 自分の申請のみ書ける（draft/rejected 限定）
  if (mode === 'write') {
    const isOwner = e.userId === user.id;
    const isManager = ctx.managedGroupIds.includes(e.groupId);
    const isAdmin = ctx.orgRole === 'owner' || ctx.orgRole === 'admin';
    if (!isOwner && !isManager && !isAdmin) throw forbidden();
  } else {
    if (!ctx.visibleGroupIds.includes(e.groupId) && e.userId !== user.id) throw forbidden();
  }
  return { ctx, expense: e };
}
```

### 3.3 第3層: Drizzle クエリビルダ強制ヘルパ

```ts
// lib/db/scoped.ts
import { db } from './client';
import { expenses, budgets, groups } from './schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AuthContext } from '@/lib/auth/guards';

/** 認可済み AuthContext からのみ expenses にアクセスできるヘルパ */
export function scopedExpenses(ctx: AuthContext) {
  return db.select().from(expenses).where(
    and(
      eq(expenses.organizationId, ctx.organizationId),
      ctx.orgRole === 'owner' || ctx.orgRole === 'admin'
        ? sql`1=1`
        : inArray(expenses.groupId, ctx.visibleGroupIds.length ? ctx.visibleGroupIds : ['__none__']),
    ),
  );
}

export function scopedBudgets(ctx: AuthContext) {
  return db.select().from(budgets).where(eq(budgets.organizationId, ctx.organizationId));
}

export function scopedGroups(ctx: AuthContext) {
  return db.select().from(groups).where(
    and(
      eq(groups.organizationId, ctx.organizationId),
      ctx.orgRole === 'owner' || ctx.orgRole === 'admin'
        ? sql`1=1`
        : inArray(groups.id, ctx.visibleGroupIds.length ? ctx.visibleGroupIds : ['__none__']),
    ),
  );
}
```

### 3.4 ESLint カスタムルールで生クエリを禁止

```js
// eslint.config.mjs（抜粋）
{
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        // db.select().from(expenses) 等の直叩きを禁止し、scopedXxx 経由を強制
        selector: "CallExpression[callee.object.name='db'][callee.property.name='select'] ~ CallExpression[callee.property.name='from'] > Identifier[name='expenses']",
        message: "Use scopedExpenses(ctx) instead of raw db.select().from(expenses).",
      },
    ],
    'no-restricted-imports': [
      'error',
      { paths: [{ name: '@/lib/db/schema', importNames: ['expenses', 'budgets'], message: 'Use scopedXxx() helpers from @/lib/db/scoped instead.' }] },
    ],
  },
}
```

例外的に直接アクセスしたい場合は `// eslint-disable-next-line` + コードオーナー approve 必須。

### 3.5 統合テスト戦略（acceptance-criteria-v1.md T-4 と整合）

- **5 本以上の認可漏れ E2E**（Playwright）:
  - C1: 県A の member が 県B の expense を SELECT → 0 件
  - C2: 県A の manager が 県B の expense を UPDATE 試行 → 403
  - C3: 県A の member が 県B の receipt key を直接叩く → 403（getViewUrl が forbidden）
  - C4: member が `/[orgSlug]/admin/*` にアクセス → redirect or 403
  - C5: tampered session で API 呼び出し → 401
- **Vitest 単体テスト**: `requireXxxRole` の境界条件 100% カバー（lib/auth/guards.ts は 95%+）
- **統合テスト**（ローカル libSQL `file:test.db`）: `scopedExpenses` が確かに WHERE 句を生成することの SQL スナップショット

---

## 4. 認証（Better Auth）

### 4.1 セットアップ

```ts
// lib/auth/better-auth.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization, magicLink, admin as adminPlugin } from 'better-auth/plugins';
import { db } from '@/lib/db/client';
import { sendInvitationEmail, sendMagicLinkEmail } from '@/lib/email/send';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: {
      user: 'users',
      session: 'auth_sessions',
      account: 'auth_accounts',
      verification: 'auth_verification_tokens',
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    requireEmailVerification: false,        // 招待制のため verify 済み扱い
  },
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
    expiresIn: 60 * 60 * 24 * 30,           // 30 日
    updateAge: 60 * 60 * 24,                // 1 日ごとに更新
  },
  advanced: {
    cookies: {
      session_token: {
        attributes: { sameSite: 'strict', secure: true, httpOnly: true },
      },
    },
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: false,    // 招待制 / SaaS 化フェーズで開放
      organizationLimit: 5,
      invitationExpiresIn: 60 * 60 * 24 * 7,  // 7 日
      sendInvitationEmail: async ({ email, organization, role, invitation }) => {
        await sendInvitationEmail({
          to: email,
          organizationName: organization.name,
          role,
          inviteLink: `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitation.id}`,
        });
      },
    }),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({ to: email, magicLink: url });
      },
      expiresIn: 60 * 5,                      // 5 分
    }),
    adminPlugin(),
  ],
});
```

### 4.2 招待フロー

```ts
// lib/actions/invitation.ts
'use server';
import { auth } from '@/lib/auth/better-auth';
import { requireOrganizationRole, requireGroupRole } from '@/lib/auth/guards';
import { rateLimit } from '@/lib/security/rate-limit';
import { headers } from 'next/headers';
import { z } from 'zod';

const inviteSchema = z.object({
  email: z.string().email(),
  organizationId: z.string(),
  role: z.enum(['admin', 'member']),
  groupId: z.string().optional(),
  groupRole: z.enum(['manager', 'member']).optional(),
});

export async function inviteUser(input: z.infer<typeof inviteSchema>) {
  const data = inviteSchema.parse(input);
  const ctx = await requireOrganizationRole(data.organizationId, ['owner', 'admin']);

  // manager は自 group の member のみ招待可
  if (ctx.orgRole === 'member' && data.role !== 'member') throw new Error('forbidden');
  if (data.groupId) {
    if (ctx.orgRole === 'admin' || ctx.orgRole === 'owner') {
      // OK
    } else {
      if (!ctx.managedGroupIds.includes(data.groupId)) throw new Error('forbidden');
    }
  }

  await rateLimit({ key: `invite:${ctx.user.id}`, limit: 20, windowSec: 3600 });
  await auth.api.createInvitation({
    body: { email: data.email, organizationId: data.organizationId, role: data.role },
    headers: await headers(),
  });
  // post-accept hook で group_memberships に INSERT する処理は別途
}
```

### 4.3 認証方針

- **Phase 1 MUST**: メール+パスワード（10 文字以上）+ 招待制
- **Phase 1 SHOULD**: マジックリンク（招待後に追加でも可）
- **Phase 2**: ソーシャルログイン（Google）/ 2FA / SSO
- セッション: Cookie ベース（`SameSite=Strict; HttpOnly; Secure`、security-baseline §1.4 整合）

---

## 5. ストレージ（Cloudflare R2）

### 5.1 バケット構成

- バケット名: `coatly-receipts`（private、pre-signed URL のみ）
- リージョン: `auto`（Cloudflare 既定 / 東京近接優先）
- ライフサイクル: なし（領収証は 7 年保存、削除はアプリ側 cron で）

### 5.2 R2 クライアント

```ts
// lib/r2/client.ts
import { S3Client } from '@aws-sdk/client-s3';

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME!;
```

### 5.3 アップロードフロー

```ts
// lib/actions/attachment.ts
'use server';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ulid } from 'ulidx';
import { r2, R2_BUCKET } from '@/lib/r2/client';
import { requireExpenseAccess } from '@/lib/auth/guards';
import { rateLimit } from '@/lib/security/rate-limit';
import { db } from '@/lib/db/client';
import { expenseAttachments, expenses } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const uploadReqSchema = z.object({
  expenseId: z.string(),
  fileName: z.string().regex(/^[^\\/]+$/),  // パス文字禁止
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']),
  size: z.number().int().positive().max(10 * 1024 * 1024),
});

export async function getUploadUrl(input: z.infer<typeof uploadReqSchema>) {
  const data = uploadReqSchema.parse(input);
  const { ctx, expense } = await requireExpenseAccess(data.expenseId, 'write');
  if (expense.status !== 'draft') throw new Error('only draft can attach');

  await rateLimit({ key: `upload:${ctx.user.id}`, limit: 20, windowSec: 3600 });

  const ext = data.fileName.split('.').pop()?.toLowerCase() ?? 'bin';
  const objectKey = `${expense.organizationId}/${expense.id}/${ulid()}.${ext}`;
  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: objectKey,
    ContentType: data.mime,
    ContentLength: data.size,
  });
  const uploadUrl = await getSignedUrl(r2, cmd, { expiresIn: 300 });   // 5 分
  return { uploadUrl, objectKey };
}

export async function confirmUpload(input: { expenseId: string; objectKey: string; fileName: string; mime: string; size: number }) {
  const { ctx, expense } = await requireExpenseAccess(input.expenseId, 'write');
  // magic byte 検証: HEAD して先頭 16 バイトを取得 → detectMime() で照合（security-baseline §7.2）
  // ...
  await db.insert(expenseAttachments).values({
    expenseId: expense.id,
    r2ObjectKey: input.objectKey,
    fileName: input.fileName,
    mimeType: input.mime,
    sizeBytes: input.size,
    uploadedBy: ctx.user.id,
  });
  await db.update(expenses).set({ hasReceipt: true }).where(eq(expenses.id, expense.id));
}

export async function getViewUrl(attachmentId: string) {
  const a = await db.select().from(expenseAttachments).where(eq(expenseAttachments.id, attachmentId)).get();
  if (!a) throw new Error('not found');
  await requireExpenseAccess(a.expenseId, 'read');
  const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: a.r2ObjectKey });
  return await getSignedUrl(r2, cmd, { expiresIn: 60 });
}
```

### 5.4 削除フロー（差戻 / 退会連動）

- 申請差戻時: 領収証は **保持**（再提出時に再利用可能）
- 申請取消（withdraw）時: R2 Object 削除 + DB 削除
- 退会後 30 日経過バッチ: ユーザーが `userId` 単独で持つ orphan 添付があれば R2 削除
- 7 年経過バッチ: 該当 expense 全て + 添付 R2 削除（年次 cron）

---

## 6. 画面ルーティング（v2 / SaaS 化対応）

```
projects/PRJ-015/app/src/
├── app/
│   ├── (marketing)/                       ← LP（Phase 2、空ルート）
│   │   └── page.tsx                       (Phase 1 は /login にリダイレクト)
│   ├── (auth)/
│   │   ├── login/
│   │   │   ├── page.tsx                   ← Server: <Suspense><LoginForm/></Suspense>
│   │   │   └── login-form.tsx             ← 'use client' / useSearchParams（Suspense 必須: Next 16）
│   │   └── invite/
│   │       └── [token]/page.tsx           ← 招待リンク受け取り → パスワード設定
│   ├── (app)/
│   │   ├── layout.tsx                     ← requireUser() / Sidebar + Topbar
│   │   ├── [organizationSlug]/
│   │   │   ├── layout.tsx                 ← requireOrganizationRole(...) + ctx 注入
│   │   │   ├── dashboard/page.tsx         ← role 分岐表示
│   │   │   ├── expenses/
│   │   │   │   ├── page.tsx               ← 一覧（scopedExpenses(ctx)）
│   │   │   │   ├── new/page.tsx           ← 新規申請
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx           ← 詳細
│   │   │   │       └── edit/page.tsx      ← 編集（draft/rejected のみ）
│   │   │   ├── groups/
│   │   │   │   └── [groupCode]/page.tsx   ← グループ別ダッシュボード
│   │   │   ├── admin/
│   │   │   │   ├── overview/page.tsx      ← 全グループ比較ビュー（admin のみ）
│   │   │   │   ├── budgets/page.tsx       ← 予算設定
│   │   │   │   ├── members/page.tsx       ← メンバー管理
│   │   │   │   └── groups/page.tsx        ← グループ管理（Phase 2）
│   │   │   └── settings/page.tsx          ← プロフィール / 退会
│   │   └── settings/account/page.tsx      ← アカウント全般
│   ├── api/
│   │   ├── auth/[...all]/route.ts         ← Better Auth handler
│   │   ├── upload-url/route.ts            ← R2 署名 URL 発行（補助、主は Server Action）
│   │   ├── webhooks/                      ← Phase 2
│   │   │   └── resend/route.ts            ← メール配信ステータス
│   │   └── cron/                          ← Vercel Cron
│   │       ├── delete-expired-users/route.ts  ← 退会 30 日後削除
│   │       └── archive-7-year/route.ts        ← 7 年経過バッチ（年次）
│   ├── privacy/page.tsx                    ← 公開: プラポリ
│   ├── terms/page.tsx                      ← 公開: 利用規約
│   ├── layout.tsx                          ← フォント / theme provider
│   ├── globals.css                         ← @theme トークン
│   └── not-found.tsx
└── proxy.ts                                ← 認証ガード（Next 16）
```

URL 例:
- `/coatly-tennis/dashboard`（テニス部 = `coatly-tennis` slug）
- `/coatly-tennis/groups/okayama`（岡山県ダッシュボード）
- `/coatly-tennis/admin/overview`（全体管理者ビュー）

---

## 7. コンポーネント設計（design-concept.md 18 種ベース、v2 で更新）

| # | コンポーネント | 主要 props | 責務（v2 更新箇所）|
|---|--------------|----------|------|
| 1 | `KpiCard` | `label, value, trend?, format?` | KPI 数値カード（カウントアップ内蔵、`@number-flow/react`）|
| 2 | `BudgetGaugeBall` | `consumed, total` | テニスボール軌跡で消化率表示 — **Framer Motion `motion.path` + `useMotionValue` で実装、Lottie 不採用（バンドル削減）** |
| 3 | `CountUpNumber` | `value, duration?` | `@number-flow/react` ラッパ（tabular-nums slashed-zero）|
| 4 | **`GroupMap`**（旧 PrefectureMap）| `organizationKind, data[], onSelect?` | **`organizationKind === 'tennis_club'` 時のみ中国地方 5 県 SVG choropleth、他 kind は `GenericGroupBarChart` を使用（DEC-009 アクションアイテム）** |
| 5 | `ExpenseForm` | `defaultValues?, onSubmitAction` | RHF + `drizzle-zod` から生成された Zod schema |
| 6 | `ReceiptDropzone` | `expenseId, onUploaded` | drag&drop + WebP 圧縮 + プレビュー — **R2 直接アップロード対応**（getUploadUrl → PUT → confirmUpload）|
| 7 | `InvoiceNumberInput` | `value, onChange` | T+13 桁 リアルタイム検証 + ゴーストアンダーライン |
| 8 | `ApprovalSidePanel` | `expenseId` | Sheet で右からスライドイン、承認/差戻、キーボード `A`/`R` |
| 9 | `ClassificationRadio` | `value, onChange` | グループ充当 / 全体充当 / 個人負担 |
| 10 | `StatusBadge` | `status` | 6 status を色付き Badge に変換 |
| 11 | `DataTable<T>` | `columns, data, filters` | shadcn DataTable + filter + sort + sticky-footer |
| 12 | `EmptyState` | `illustration, title, description, cta?` | 1px stroke 単線 SVG イラスト |
| 13 | `Sidebar` | `currentPath, ctx` | コートラインアクティブ表示（`<motion.div layoutId="rail">`）|
| 14 | `Topbar` | `breadcrumb, user, organization` | 組織切替（SaaS 化用、Phase 2）|
| 15 | `BudgetForm` | `groupId?, fiscalYear` | 予算入力（admin）|
| 16 | `InviteDialog` | `defaultRole?, defaultGroupId?` | ユーザー招待 Dialog（Better Auth invitation）|
| 17 | ~~`RealtimeBadge`~~ → `PendingBadge` | `organizationId` | **Realtime 不採用、TanStack Query refetchInterval=30s**で承認待ち件数表示 |
| 18 | `ReceiptViewer` | `attachmentId` | `getViewUrl()` で R2 署名 URL 取得（TTL=60s）→ 画像/PDF プレビュー |

---

## 8. デザイントークン → Tailwind v4 + globals.css

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  --color-ink: #0A0A0B;
  --color-paper: #FAFAF7;
  --color-court-green: #1F6B4A;
  --color-stone: #E7E5DF;
  --color-hairline: #D8D6CF;
  --color-amber: #B8741A;
  --color-danger: #A83232;
  --color-success: #2F7A52;

  --color-background: var(--color-paper);
  --color-foreground: var(--color-ink);
  --color-card: #FFFFFF;
  --color-card-foreground: var(--color-ink);
  --color-border: var(--color-hairline);
  --color-ring: var(--color-court-green);
  --color-primary: var(--color-ink);
  --color-primary-foreground: var(--color-paper);
  --color-accent: var(--color-court-green);
  --color-accent-foreground: var(--color-paper);
  --color-muted-foreground: #6B6B6B;

  --radius-card: 14px;
  --radius-button: 8px;

  --duration-fast: 120ms;
  --duration-base: 200ms;
  --duration-slow: 320ms;
  --duration-narrative: 600ms;
  --easing-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
  --easing-emphasized: cubic-bezier(0.16, 1, 0.3, 1);

  --font-sans: "Geist Sans", "Noto Sans JP", system-ui, sans-serif;
  --font-jp: "Noto Sans JP", system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, SFMono-Regular, monospace;
  --font-nums: "Geist Mono", "tabular-nums";
}

.dark {
  --color-background: #0C0E0D;
  --color-foreground: #ECEAE3;
  --color-card: #15181A;
  --color-border: #262A2C;
  --color-ring: #3FA677;
  --color-accent: #3FA677;
  /* ... 残りは design-concept.md §2.1 dark を参照 */
}

.tabular { font-variant-numeric: tabular-nums slashed-zero; }
```

`tailwind.config.ts` は v4 で最小化（plugin 配列のみ）:

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  plugins: [animate],
} satisfies Config;
```

---

## 9. アニメーション実装方針

| 場所 | ライブラリ | 仕様 |
|------|----------|------|
| KPI 数値 | `@number-flow/react` | 600ms / tabular-nums / `prefers-reduced-motion` で即値 |
| KPI カード hover | Framer Motion | `whileHover={{y:-1, transition:0.2}}` + `shadow-md` |
| GroupMap hover | CSS + Framer Motion | fill opacity 切替 0.3→0.6 / 200ms |
| サイドナビ アクティブライン | `<motion.div layoutId="rail">` | 240ms emphasized |
| 承認チェックマーク | Framer Motion | path stroke-dasharray アニメ 200ms |
| ページ遷移 | Framer Motion `AnimatePresence` | opacity + 4px Y、200ms |
| Toast | Sonner | 既定 |
| **テニスボール軌跡** | Framer Motion `useMotionValue` + `motion.circle` 上を `motion.path` で進行 | 月切替で再描画、月初→月末を 800ms で進む |
| 予算消化バー | Tremor `<ProgressBar />` | accent → warning → danger 段階変色 |

**バンドル予算（initial JS gzip / `/dashboard`）**:
- < 200KB（acceptance-criteria-v1 P-4）
- Tremor / Recharts / Framer Motion は dynamic import で遅延ロード（`next/dynamic` + `ssr: false` 適宜）
- Better Auth client は軽量、`@aws-sdk/*` はサーバ側のみで client bundle に混入させない

---

## 10. 実装計画 v2（Phase 1 MVP / 約 41 人日 / 8 週）

> **注**: v1 は 38 人日、Research +3 人日、法務（C-03）+3.5 人日、セキュリティ（C-02）+1.5 人日、Designer 修正対応 +1.9 人日 = 約 47 人日（PM WBS 合算）。
> 本書では **Dev 純工数**として 41 人日（v1: 38 + Turso 統合: +3）を基準とする。法務・セキュリティ・Designer 連携工数は WBS 側に内包される（pm-requirements-wbs.md / figma-schedule.md と整合）。

| Week | タスク | 工数 | 主成果物 / ゲート |
|------|-------|-----|------------------|
| **W1** 環境構築 | Next 16 / Drizzle / Turso / Tailwind v4 / shadcn / Better Auth セットアップ + デザイントークン + 初回 migration（10 テーブル） + Vercel Preview 連携 + R2 / Resend POC | **5 人日** | デプロイ可能な空アプリ + globals.css + DB 接続確認 |
| **W2** 認証 / 認可 | Better Auth + 招待フロー + アプリ層認可ヘルパ（guards.ts / scoped.ts） + middleware（proxy.ts） + ESLint カスタムルール + 同意 UI（C-03 T108-C） | **6 人日** | `invite-login.spec.ts` E2E PASS + 認可単体テスト 95%+ |
| **W3** 申請 CRUD | expenses Server Actions（create/submit/withdraw/edit）+ フォーム + 一覧 + 詳細 + drizzle-zod schema | **6 人日** | `submit-expense.spec.ts` E2E PASS |
| **W4** 添付 / インボイス | R2 署名 URL 発行 / WebP 圧縮 / magic byte 検証 / インボイス検証 + 同意 UI（T108-D）| **6 人日** | `upload-receipt.spec.ts` E2E PASS |
| **W5** 承認 FSM | approveExpense / rejectExpense / reclassify / approval_logs 自動記録 / Resend 通知 / 楽観更新 | **5 人日** | `approve-expense.spec.ts` E2E PASS |
| **W6** ダッシュボード | KPI / Tremor / GroupMap（中国地方5県 choropleth） / count-up / テニスボール軌跡 | **5 人日** | 「あっと驚き要素」3 点動作（D-2 達成）+ Designer 承認 |
| **W7** 全体管理 / 法務 | admin/overview / budgets / members / `/privacy` `/terms` 公開 / 退会フロー（論理削除）+ 30 日後削除 cron スタブ | **4 人日** | `admin-overview.spec.ts` E2E PASS + L-1 達成 |
| **W8** E2E / a11y / 仕上げ | 認可漏れ E2E 5 本 / axe-core / Lighthouse 90+ / Mozilla Observatory A+ / Vercel 本番デプロイ | **4 人日** | acceptance-criteria-v1.md 全 22 指標 PASS / β リリース |
| **合計** | | **41 人日** | |

W1〜W4 は **figma-schedule.md** の Designer 並行（6 人日 / W1〜W4）と接続。各週末に三者レビュー。

---

## 11. CI/CD

### 11.1 GitHub Actions（`.github/workflows/ci.yml` 抜粋）

```yaml
name: CI
on: [pull_request, push]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm tsc --noEmit              # Q-1
      - run: pnpm eslint . --max-warnings=0  # Q-2

  test:
    runs-on: ubuntu-latest
    services:
      libsql:
        image: ghcr.io/tursodatabase/libsql-server:latest
        ports: ['8080:8080']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm drizzle-kit migrate
        env: { TURSO_DATABASE_URL: 'http://localhost:8080' }
      - run: pnpm vitest run --coverage     # T-3 / T-5
      - run: pnpm playwright install --with-deps
      - run: pnpm playwright test           # T-1 / T-2 / T-4 / A-1

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm next build                # Q-3
      - run: pnpm next-bundle-analyzer      # P-4

  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --audit-level=high  # S-1

  lighthouse:
    runs-on: ubuntu-latest
    needs: [build]
    steps:
      - uses: actions/checkout@v4
      - run: pnpm lhci autorun              # P-1 / P-2 / P-3 / P-5
```

### 11.2 Vercel デプロイ運用

- PR ごとに Preview Deploy（Turso preview branch を `pr-{n}` で作成）
- main → production（Turso primary に migrate を手動 approve 後に適用）
- Cron Jobs（Vercel Cron）:
  - 退会 30 日後削除: `0 3 * * *`（毎日 3:00 JST）
  - 監査ログ古い分削除（3 年）: `0 4 1 * *`（毎月 1 日 4:00 JST）
  - 7 年経過バッチ: `0 5 1 4 *`（毎年 4/1 5:00 JST）

### 11.3 環境変数（Vercel）

| 変数 | 環境 | 露出 | 用途 |
|-----|------|-----|------|
| `TURSO_DATABASE_URL` | Production / Preview / Development | サーバ | Turso 接続 |
| `TURSO_AUTH_TOKEN` | Production / Preview / Development | サーバ | Turso 認証 |
| `BETTER_AUTH_SECRET` | Production / Preview / Development | サーバ | セッション署名 |
| `BETTER_AUTH_URL` | Production / Preview | サーバ | Better Auth ベース URL |
| `R2_ACCOUNT_ID` | Production / Preview | サーバ | Cloudflare R2 |
| `R2_ACCESS_KEY_ID` | Production / Preview | サーバ | R2 |
| `R2_SECRET_ACCESS_KEY` | Production / Preview | サーバ | R2 |
| `R2_BUCKET_NAME` | Production / Preview | サーバ | R2 |
| `RESEND_API_KEY` | Production / Preview | サーバ | メール送信 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Production / Preview | サーバ | Vercel KV（rate limit）|
| `NEXT_PUBLIC_APP_URL` | Production / Preview / Development | クライアント | 公開 URL のみ（秘密情報なし）|

---

## 12. seed データ（FY2026 / DEC-009 反映）

```ts
// scripts/seed.ts
import { db } from '@/lib/db/client';
import { organizations, groups, budgets, users, memberships, groupMemberships } from '@/lib/db/schema';
import { ulid } from 'ulidx';
import { auth } from '@/lib/auth/better-auth';

async function main() {
  // 1. テニス部組織
  const [tennisClub] = await db.insert(organizations).values({
    id: 'org_tennis',
    slug: 'coatly-tennis',
    kind: 'tennis_club',
    name: 'テニス部',
    fiscalYearStartMonth: 4,
  }).returning();

  // 2. 5 県グループ
  const prefectures: Array<{ code: string; name: string }> = [
    { code: 'okayama',   name: '岡山' },
    { code: 'hiroshima', name: '広島' },
    { code: 'yamaguchi', name: '山口' },
    { code: 'tottori',   name: '鳥取' },
    { code: 'shimane',   name: '島根' },
  ];
  const groupRows = prefectures.map((p, i) => ({
    id: `grp_${p.code}`,
    organizationId: tennisClub.id,
    kind: 'prefecture' as const,
    code: p.code,
    name: p.name,
    displayOrder: i + 1,
  }));
  await db.insert(groups).values(groupRows);

  // 3. FY2026 予算: 全体 ¥300,000 + 各県 ¥100,000 ×5 = ¥800,000
  const seedAdminId = 'usr_seed_admin'; // 初期 admin（実運用は Better Auth 経由で作成）
  await db.insert(budgets).values([
    {
      organizationId: tennisClub.id,
      groupId: null,
      fiscalYear: 2026,
      amountJpy: 300_000,
      createdBy: seedAdminId,
    },
    ...groupRows.map(g => ({
      organizationId: tennisClub.id,
      groupId: g.id,
      fiscalYear: 2026,
      amountJpy: 100_000,
      createdBy: seedAdminId,
    })),
  ]);

  console.log('seed: organization=1 / groups=5 / budgets=6（合計 ¥800,000）');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

---

## 13. ディレクトリ構造（実装スタートテンプレ v2）

```
projects/PRJ-015/app/
├── src/
│   ├── app/                         ← §6 のルーティング構造
│   ├── proxy.ts                     ← Next 16 認証ガード
│   ├── components/
│   │   ├── ui/                      ← shadcn/ui 生成
│   │   ├── kpi-card.tsx
│   │   ├── budget-gauge-ball.tsx
│   │   ├── group-map.tsx            ← organizationKind で分岐
│   │   ├── generic-group-bar-chart.tsx
│   │   ├── receipt-dropzone.tsx
│   │   ├── receipt-viewer.tsx
│   │   ├── invoice-number-input.tsx
│   │   ├── status-badge.tsx
│   │   ├── approval-side-panel.tsx
│   │   ├── classification-radio.tsx
│   │   ├── data-table/
│   │   ├── nav/sidebar.tsx
│   │   ├── nav/topbar.tsx
│   │   └── empty-state.tsx
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts            ← Drizzle schema（§2.2）
│   │   │   ├── client.ts            ← Turso client
│   │   │   └── scoped.ts            ← scopedXxx ヘルパ
│   │   ├── auth/
│   │   │   ├── better-auth.ts       ← Better Auth セットアップ（§4.1）
│   │   │   ├── guards.ts            ← requireXxx（§3.2）
│   │   │   └── session.ts           ← cookie 取得ヘルパ
│   │   ├── r2/
│   │   │   ├── client.ts            ← S3Client
│   │   │   └── signed-url.ts        ← getUploadUrl / getViewUrl（§5.3）
│   │   ├── email/
│   │   │   ├── send.ts              ← Resend ラッパ
│   │   │   └── templates/
│   │   │       ├── invitation.tsx   ← React Email
│   │   │       └── approval-notice.tsx
│   │   ├── security/
│   │   │   ├── rate-limit.ts        ← Vercel KV（§2 baseline）
│   │   │   ├── csrf.ts              ← assertSameOrigin
│   │   │   └── file-magic.ts        ← magic byte 検出
│   │   ├── validation/
│   │   │   ├── expense.ts           ← drizzle-zod から派生
│   │   │   ├── invoice.ts           ← T+13 桁 + checkdigit
│   │   │   └── ...
│   │   ├── actions/
│   │   │   ├── expense.ts           ← Server Actions
│   │   │   ├── approval.ts
│   │   │   ├── budget.ts
│   │   │   ├── attachment.ts
│   │   │   ├── invitation.ts
│   │   │   └── account.ts           ← 退会フロー
│   │   ├── queries/
│   │   │   ├── group-summary.ts
│   │   │   └── expenses.ts
│   │   ├── errors.ts                ← unauthorized / forbidden ヘルパ
│   │   └── utils.ts
│   └── styles/
│       └── globals.css              ← @theme トークン
├── drizzle/
│   ├── migrations/
│   │   ├── 0001_init.sql
│   │   ├── 0002_better_auth.sql
│   │   └── 0003_views.sql
│   └── meta/
├── scripts/
│   └── seed.ts
├── tests/
│   ├── unit/
│   │   ├── auth-guards.test.ts
│   │   ├── invoice.test.ts
│   │   └── scoped.test.ts
│   ├── integration/
│   │   ├── expense-fsm.test.ts
│   │   └── authorization.test.ts
│   └── e2e/
│       ├── invite-login.spec.ts
│       ├── submit-expense.spec.ts
│       ├── upload-receipt.spec.ts
│       ├── approve-expense.spec.ts
│       ├── admin-overview.spec.ts
│       └── authz-leak.spec.ts        ← 認可漏れ 5 ケース
├── public/
│   └── chugoku-map.svg
├── next.config.ts                    ← security-baseline §1.1 / §3.1 反映
├── drizzle.config.ts
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tailwind.config.ts
├── playwright.config.ts
├── vitest.config.ts
├── eslint.config.mjs                 ← §3.4 カスタムルール
├── components.json                   ← shadcn/ui (style: 'new-york')
├── README.md
├── DEPLOYMENT.md
├── RUNBOOK.md
└── ARCHITECTURE.md
```

---

## 14. リスクと対策（v2 観点 7 件 + 既存 5 件）

| ID | リスク | 対策 |
|----|-------|------|
| **R-Turso-01** | SQLite 制約（Postgres 機能不要を再確認）| research-turso-ecosystem §1.4 で全機能を移植可能と検証済み。`v_group_summary` は通常 View で代替。 |
| **R-Turso-02** | RLS なし（DB 層認可不可）| **§3 三層防衛**（middleware / `requireXxxRole` / `scopedXxx` 強制）+ ESLint ルール + 認可漏れ E2E 5 本（acceptance-criteria T-4）|
| **R-Turso-03** | 4 ベンダー運用（Vercel / Turso / R2 / Resend）| Vercel 環境変数で一元管理 + RUNBOOK.md に各サービスのダッシュボード URL / 復旧手順を整備 |
| **R-Turso-04** | Better Auth は新興 OSS | フォールバック計画: Auth.js v5 + Drizzle adapter に置換可能（DB schema は users/auth_sessions 等を維持。移行コスト試算 = 3 人日）|
| **R-Turso-05** | R2 直接アップロードのアクセス制御 | 署名 URL TTL=300s（PUT） / TTL=60s（GET）、Server Action で必ず認可 + magic byte 検証（security-baseline §7.2）|
| **R-Turso-06** | マルチテナント漏洩（organization_id 抜け）| `scopedXxx` ヘルパで `eq(table.organizationId, ctx.organizationId)` を必ず付与 + ESLint ルール + 認可漏れ E2E |
| **R-Turso-07** | コスト爆発 | 月次 R2 / Resend / Turso / Vercel KV 利用量を Vercel ダッシュボードと各 admin で確認 + RUNBOOK.md に閾値（Resend 80% / R2 70%）を記載 |
| R-1（既存）| ダッシュボード N+1 / クエリ過多 | `v_group_summary` View に集約 + TanStack Query キャッシュ + Lighthouse INP < 200ms |
| R-2（既存）| 招待トークン不正利用 | Better Auth invitation TTL=7 日 + 一回使用 + 招待検証 rate limit（security-baseline §2.2）|
| R-3（既存）| インボイス偽番号 | 形式 + チェックデジット（モジュラス11）+ 監査ログ → Phase 2 で国税庁 API |
| R-4（既存）| 領収証画像中の個人情報漏洩 | private bucket + 署名 URL TTL=60s + 同意 UI + 閲覧 audit_logs |
| R-5（既存）| 退会後の個人情報残存 | 30 日後論理削除→物理削除バッチ（legal-privacy-policy §3.1）|

---

## 15. acceptance-criteria-v1 への対応マッピング

| 指標 | 本書の対応箇所 |
|-----|--------------|
| F-1（MUST 14 PASS）| §10 の Week 別ゲート / E2E 5 本 |
| T-1〜T-3（E2E / カバレッジ）| §13 tests/ 構造 + §11.1 CI |
| T-4（認可漏れ E2E 5 本）| §3.5 / `tests/e2e/authz-leak.spec.ts` |
| T-5（統合テスト 20 本）| §3.5 / `tests/integration/` |
| Q-1〜Q-3（静的品質）| §11.1 lint job |
| P-1〜P-5（Lighthouse / bundle）| §9 バンドル予算 + §11.1 lighthouse job |
| A-1（axe-core）| §11.1 + Playwright E2E に組込 |
| A-2（キーボード可達）| design-concept §5.3 / Sidebar / ApprovalSidePanel ショートカット |
| S-1（audit）| §11.1 audit job |
| S-2（Mozilla Observatory A+）| security-baseline §3 ヘッダー全付与 |
| D-1（カンプ一致 95%）| figma-schedule §3 三者レビュー |
| D-2（驚き要素 3 点）| §7 KpiCard / BudgetGaugeBall / GroupMap |
| O-1（README 等 4 ファイル）| §13 ディレクトリ末尾 |
| L-1（プラポリ / 規約公開）| §6 ルーティング `/privacy` `/terms` |

---

## 16. CEO への提言

### 16.1 Phase 1 着手判定

**Conditional Go**（条件付き Go）。

**Go の根拠**:
- DEC-010 / Research v2 推奨スタックを実装可能レベルまで設計化（Drizzle schema TS / 三層防衛 / R2 フロー / Better Auth セットアップ全て提示）
- DEC-009 SaaS 化視野を `organizations + groups` で実装、テニス部 MVP は seed で完結
- security-baseline.md / legal-privacy-policy.md / acceptance-criteria-v1.md / figma-schedule.md と完全整合
- 41 人日 / 8 週は v1 比 +3 人日 で吸収可能、PM WBS（46 人日 / 9 週）と整合

**Conditional の条件（W1 中に解消）**:
- C2-01: Better Auth + Drizzle adapter + organization plugin の **POC**（招待 → ログイン）を W1 末までに動作確認。失敗時は Auth.js v5 にフォールバック（fallback 計画は §14 R-Turso-04）
- C2-02: Cloudflare R2 + 署名 URL の **POC**（ファイル PUT → GET）を W1 末までに動作確認。失敗時は Vercel Blob で Phase 1 起動 → 1GB 到達時に R2 移行（fallback 計画は research §4.6）
- C2-03: ESLint カスタムルールで `db.select().from(expenses)` 直叩きを禁止する設定を W2 着手前に整備

### 16.2 v1 ファイルの取り扱い方針

- **`dev-technical-spec.md`（v1 / Supabase ベース）は archive 扱いとして残置**
  - 削除しない理由: DEC-002 / DEC-010 の意思決定経緯を辿れるよう履歴を残す
  - 推奨対応: v1 ファイル冒頭に「**【ARCHIVED 2026-04-26】DEC-010 により Turso スタックへ変更。本ファイルは履歴目的で残置。最新仕様は `dev-technical-spec-v2.md` を参照**」のバナーを追記（W1 着手時）
- **本書 `dev-technical-spec-v2.md` を Phase 1 実装の正式仕様とする**（DEC-011 候補として CEO 決裁要請）

### 16.3 オーナー向け 1 行サマリー

> Turso + Drizzle + Better Auth + R2 の完全無料スタックで、テニス部 MVP を 8 週間 41 人日で構築可能。SaaS 化視野の汎用 DB 設計と認可漏れ E2E 5 本で、500 部活規模まで無料運用と他県データ漏洩防止を両立する。

---

## 17. 改訂履歴

| 日付 | 版 | 内容 | 作成者 |
|------|---|------|-------|
| 2026-04-26 | v1 | 初版（Supabase ベース）| 開発部門 |
| 2026-04-26 | **v2** | DEC-010 反映（Turso/Drizzle/Better Auth/R2 完全置換）+ DEC-009 SaaS 化対応（organizations + groups）+ FY2026 seed + 三層防衛 + acceptance-criteria 全対応 | 開発部門 |

---

**本書（v2）は DEC-010 受領後の正式技術仕様として、CEO 決裁（DEC-011 候補）をもって有効化する。Phase 1 W1 着手日（2026-05-01 月曜）から本仕様に基づき実装する。**
