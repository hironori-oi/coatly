/**
 * Drizzle ORM スキーマ定義（Turso/libSQL = SQLite 方言）
 *
 * dev-technical-spec-v2.md §2.2 に準拠した 10 エンティティ + Better Auth 4 テーブル。
 * SQLite では enum がないため text + CHECK 制約 + Zod でエミュレート。
 * ULID は ulidx で生成（時系列ソート可能、衝突確率 2^-80）。
 */
import {
  sqliteTable,
  text,
  integer,
  index,
  unique,
} from 'drizzle-orm/sqlite-core';
import { sql, relations } from 'drizzle-orm';
import { ulid } from 'ulidx';

// ────────────────────────────────────────────────────────────────────
// Enums（SQLite では text + CHECK でエミュレート）
// ────────────────────────────────────────────────────────────────────

export const ORGANIZATION_KIND = [
  'tennis_club',
  'club_other',
  'community',
  'pta',
  'npo',
  'other',
] as const;

export const GROUP_KIND = ['prefecture', 'branch', 'team', 'other'] as const;

export const ORG_ROLE = ['owner', 'admin', 'member'] as const;

export const GROUP_ROLE = ['manager', 'member'] as const;

export const EXPENSE_STATUS = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'charged_to_group',
  'charged_to_organization',
] as const;

export const EXPENSE_CLASSIFICATION = [
  'group_funded',
  'organization_funded',
  'personal',
] as const;

export const APPROVAL_ACTION = [
  'submit',
  'approve',
  'reject',
  'reclassify',
  'withdraw',
] as const;

export const AUDIT_ACTION = ['create', 'update', 'delete'] as const;

// ────────────────────────────────────────────────────────────────────
// 1. organizations（汎用テナント）
// ────────────────────────────────────────────────────────────────────

export const organizations = sqliteTable(
  'organizations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => ulid()),
    slug: text('slug').notNull(),
    kind: text('kind', { enum: ORGANIZATION_KIND }).notNull(),
    name: text('name').notNull(),
    /**
     * Better Auth organization plugin が要求する optional フィールド。
     * 我々の app domain では未使用だが、plugin が write する可能性があるので
     * 同テーブルにマップした以上は受け皿を用意する。
     */
    logo: text('logo'),
    metadata: text('metadata'),
    fiscalYearStartMonth: integer('fiscal_year_start_month')
      .notNull()
      .default(4),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => ({
    uqSlug: unique('uq_org_slug').on(t.slug),
  }),
);

// ────────────────────────────────────────────────────────────────────
// 2. groups（県 / 支部 / チーム）
// ────────────────────────────────────────────────────────────────────

export const groups = sqliteTable(
  'groups',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => ulid()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: GROUP_KIND }).notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => ({
    uqOrgCode: unique('uq_group_org_code').on(t.organizationId, t.code),
    idxOrg: index('idx_groups_org').on(t.organizationId),
  }),
);

// ────────────────────────────────────────────────────────────────────
// 3. users（Better Auth user.id を pk として継承）
// ────────────────────────────────────────────────────────────────────

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull().default(''),
    /**
     * Better Auth core が要求する emailVerified bool。
     * 招待制で実質 verify 済み扱いだが、column は必須なので default true で運用。
     */
    emailVerified: integer('email_verified', { mode: 'boolean' })
      .notNull()
      .default(true),
    image: text('image'),
    /**
     * Better Auth admin plugin が要求する system-wide role。
     * 値は 'admin' | 'user' のいずれか（admin プラグイン既定）。
     * 我々の app 側の権限は memberships.role で管理するため、
     * 通常ユーザーは 'user' とする。
     */
    role: text('role').notNull().default('user'),
    /** admin plugin のユーザー BAN サポート */
    banned: integer('banned', { mode: 'boolean' }).notNull().default(false),
    banReason: text('ban_reason'),
    banExpires: integer('ban_expires', { mode: 'timestamp' }),
    isActive: integer('is_active', { mode: 'boolean' })
      .notNull()
      .default(true),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => ({
    uqEmail: unique('uq_users_email').on(t.email),
  }),
);

// ────────────────────────────────────────────────────────────────────
// 4. memberships（user × organization）
// ────────────────────────────────────────────────────────────────────

export const memberships = sqliteTable(
  'memberships',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => ulid()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ORG_ROLE }).notNull(),
    homeGroupId: text('home_group_id').references(() => groups.id),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => ({
    uqUserOrg: unique('uq_mem_user_org').on(t.userId, t.organizationId),
    idxOrg: index('idx_mem_org').on(t.organizationId),
    idxUser: index('idx_mem_user').on(t.userId),
  }),
);

// ────────────────────────────────────────────────────────────────────
// 5. group_memberships（user × group）
// ────────────────────────────────────────────────────────────────────

export const groupMemberships = sqliteTable(
  'group_memberships',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => ulid()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    role: text('role', { enum: GROUP_ROLE }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => ({
    uqUserGroup: unique('uq_gm_user_group').on(t.userId, t.groupId),
    idxGroup: index('idx_gm_group').on(t.groupId),
    idxUser: index('idx_gm_user').on(t.userId),
  }),
);

// ────────────────────────────────────────────────────────────────────
// 6. budgets（年度予算 / org or group 単位）
// ────────────────────────────────────────────────────────────────────

export const budgets = sqliteTable(
  'budgets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => ulid()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => groups.id, {
      onDelete: 'cascade',
    }),
    fiscalYear: integer('fiscal_year').notNull(),
    amountJpy: integer('amount_jpy').notNull(),
    /**
     * 承認時に加算される実績額（JPY）。承認 Server Action で atomically UPDATE。
     * SELECT amount_jpy - used_amount_jpy で残予算を取得する。
     */
    usedAmountJpy: integer('used_amount_jpy').notNull().default(0),
    note: text('note'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => ({
    uqYearScope: unique('uq_budget_year_scope').on(
      t.organizationId,
      t.groupId,
      t.fiscalYear,
    ),
    idxOrg: index('idx_budgets_org').on(t.organizationId),
  }),
);

// ────────────────────────────────────────────────────────────────────
// 7. expenses（活動費申請）
// ────────────────────────────────────────────────────────────────────

export const expenses = sqliteTable(
  'expenses',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => ulid()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'restrict' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    fiscalYear: integer('fiscal_year').notNull(),
    date: integer('date', { mode: 'timestamp' }).notNull(),
    description: text('description').notNull(),
    amountJpy: integer('amount_jpy').notNull(),
    hasReceipt: integer('has_receipt', { mode: 'boolean' })
      .notNull()
      .default(false),
    invoiceNumber: text('invoice_number'),
    status: text('status', { enum: EXPENSE_STATUS })
      .notNull()
      .default('draft'),
    classification: text('classification', { enum: EXPENSE_CLASSIFICATION }),
    approvedBy: text('approved_by').references(() => users.id),
    approvedAt: integer('approved_at', { mode: 'timestamp' }),
    rejectionReason: text('rejection_reason'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => ({
    idxOrgStatus: index('idx_exp_org_status').on(t.organizationId, t.status),
    idxGroupStatus: index('idx_exp_group_status').on(t.groupId, t.status),
    idxUser: index('idx_exp_user').on(t.userId),
    idxYear: index('idx_exp_year').on(t.fiscalYear),
    idxDate: index('idx_exp_date').on(t.date),
  }),
);

// ────────────────────────────────────────────────────────────────────
// 8. expense_attachments（領収証ファイル / R2 object key）
// ────────────────────────────────────────────────────────────────────

export const expenseAttachments = sqliteTable(
  'expense_attachments',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => ulid()),
    expenseId: text('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    r2ObjectKey: text('r2_object_key').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => ({
    idxExp: index('idx_attach_exp').on(t.expenseId),
    uqKey: unique('uq_attach_key').on(t.r2ObjectKey),
  }),
);

// ────────────────────────────────────────────────────────────────────
// 9. approval_logs（承認 FSM の履歴）
// ────────────────────────────────────────────────────────────────────

export const approvalLogs = sqliteTable(
  'approval_logs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => ulid()),
    expenseId: text('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id),
    action: text('action', { enum: APPROVAL_ACTION }).notNull(),
    fromStatus: text('from_status', { enum: EXPENSE_STATUS }),
    toStatus: text('to_status', { enum: EXPENSE_STATUS }).notNull(),
    comment: text('comment'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => ({
    idxExp: index('idx_appr_exp').on(t.expenseId, t.createdAt),
  }),
);

// ────────────────────────────────────────────────────────────────────
// 10. audit_logs（全テーブル変更監査）
// ────────────────────────────────────────────────────────────────────

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
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => ({
    idxOrg: index('idx_audit_org').on(t.organizationId),
    idxEntity: index('idx_audit_entity').on(t.entity, t.entityId),
    idxActor: index('idx_audit_actor').on(t.actorId),
  }),
);

// ────────────────────────────────────────────────────────────────────
// Better Auth テーブル（Drizzle adapter が自動連動 / 手動雛形）
// ────────────────────────────────────────────────────────────────────

export const authSessions = sqliteTable('auth_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  token: text('token').notNull(),
  /** organization plugin が active org を session に書き込むため */
  activeOrganizationId: text('active_organization_id'),
  /** admin plugin の impersonate サポート */
  impersonatedBy: text('impersonated_by'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .default(sql`(unixepoch())`)
    .notNull(),
});

export const authAccounts = sqliteTable('auth_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  accountId: text('account_id').notNull(),
  password: text('password'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', {
    mode: 'timestamp',
  }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', {
    mode: 'timestamp',
  }),
  scope: text('scope'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .default(sql`(unixepoch())`)
    .notNull(),
});

export const authVerificationTokens = sqliteTable('auth_verification_tokens', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .default(sql`(unixepoch())`),
});

/**
 * Better Auth `organization` plugin の invitation テーブル。
 *
 * - 我々の app 側 organizations テーブルに plugin を `schema.organization.modelName` でマップ。
 * - member は app 側 memberships にマップ。
 * - invitation は app 側に対応するものが無いので新設。
 *
 * 注意: plugin の adapter は SQLite snake_case に自動変換しないため、
 * カラム名は plugin が期待する名前（organizationId 等）の snake_case 形（organization_id）にしておく。
 */
export const invitations = sqliteTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull(),
    status: text('status').notNull().default('pending'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => ({
    idxOrg: index('idx_inv_org').on(t.organizationId),
    idxEmail: index('idx_inv_email').on(t.email),
  }),
);

// ────────────────────────────────────────────────────────────────────
// Relations
// ────────────────────────────────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ many }) => ({
  groups: many(groups),
  memberships: many(memberships),
  budgets: many(budgets),
  expenses: many(expenses),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [groups.organizationId],
    references: [organizations.id],
  }),
  groupMemberships: many(groupMemberships),
  expenses: many(expenses),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  groupMemberships: many(groupMemberships),
  expenses: many(expenses),
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [expenses.organizationId],
    references: [organizations.id],
  }),
  group: one(groups, {
    fields: [expenses.groupId],
    references: [groups.id],
  }),
  user: one(users, { fields: [expenses.userId], references: [users.id] }),
  attachments: many(expenseAttachments),
  approvalLogs: many(approvalLogs),
}));

export const expenseAttachmentsRelations = relations(
  expenseAttachments,
  ({ one }) => ({
    expense: one(expenses, {
      fields: [expenseAttachments.expenseId],
      references: [expenses.id],
    }),
  }),
);

// ────────────────────────────────────────────────────────────────────
// 型エクスポート（InferSelectModel / InferInsertModel ヘルパに使用）
// ────────────────────────────────────────────────────────────────────

export type Organization = typeof organizations.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type GroupMembership = typeof groupMemberships.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type ExpenseAttachment = typeof expenseAttachments.$inferSelect;
export type ApprovalLog = typeof approvalLogs.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;

export type OrgRole = (typeof ORG_ROLE)[number];
export type GroupRoleType = (typeof GROUP_ROLE)[number];
export type ExpenseStatus = (typeof EXPENSE_STATUS)[number];
export type ExpenseClassification = (typeof EXPENSE_CLASSIFICATION)[number];
