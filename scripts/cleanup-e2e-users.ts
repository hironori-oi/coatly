/**
 * E2E ユーザ cleanup スクリプト（W3-B / リリース前必須）
 *
 * 目的:
 *   - seed-e2e.ts で投入された E2E 用ユーザ・組織を Turso 本番 DB から完全削除する
 *   - 5/12 リリース前に必ず実行する（本番に test fixture が残るのを防ぐ）
 *
 * 削除対象:
 *   1. users.email LIKE 'e2e-%@coatly.local' に該当する全ユーザ
 *      - 関連 memberships, group_memberships, expenses, auth_sessions,
 *        auth_accounts, expense_attachments, approval_logs, audit_logs を cascade で削除
 *   2. organizations.slug = 'e2e-other-org' の組織
 *      - 関連 groups, memberships, budgets, expenses も cascade
 *
 * 削除モード:
 *   - --dry-run: 件数のみ表示。実 DELETE は走らない（既定）
 *   - --commit:  実削除（取り消し不可）
 *
 * 運用手順（リリース前）:
 *   1. pnpm db:cleanup-e2e -- --dry-run  # 件数確認
 *   2. pnpm db:cleanup-e2e -- --commit   # 実削除
 *
 * 安全ガード:
 *   - email pattern は厳格に 'e2e-%@coatly.local' に限定する
 *   - 一般ユーザ（owner@coatly.local 等）は対象外
 *   - 全削除はトランザクション内で実行し、失敗時はロールバック
 *   - 環境変数 TURSO_DATABASE_URL を必ず確認してから実行する
 */
import { eq, like, inArray, or } from 'drizzle-orm';
import { db } from '../src/lib/db/client';
import {
  users,
  memberships,
  groupMemberships,
  expenses,
  expenseAttachments,
  approvalLogs,
  auditLogs,
  organizations,
  groups,
  budgets,
  authSessions,
  authAccounts,
  invitations,
} from '../src/lib/db/schema';

const E2E_EMAIL_PATTERN = 'e2e-%@coatly.local';
const E2E_OTHER_ORG_SLUG = 'e2e-other-org';

type Counts = {
  users: number;
  memberships: number;
  groupMemberships: number;
  expenses: number;
  expenseAttachments: number;
  approvalLogs: number;
  auditLogs: number;
  authSessions: number;
  authAccounts: number;
  invitations: number;
  orgGroups: number;
  orgBudgets: number;
  orgMemberships: number;
  orgExpenses: number;
  organizations: number;
};

async function findE2eUserIds(): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, E2E_EMAIL_PATTERN));
  return rows.map((r) => r.id);
}

async function findE2eOrgIds(): Promise<string[]> {
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, E2E_OTHER_ORG_SLUG));
  return rows.map((r) => r.id);
}

async function countAll(
  userIds: string[],
  orgIds: string[],
): Promise<Counts> {
  // 集計用ヘルパ: count(*) の代わりに行を select して length で数える（libsql 互換のため）
  const len = async <T>(p: Promise<T[]>): Promise<number> => (await p).length;

  const userCount = userIds.length;
  const orgCount = orgIds.length;

  const memCount =
    userIds.length === 0
      ? 0
      : await len(
          db
            .select({ id: memberships.id })
            .from(memberships)
            .where(inArray(memberships.userId, userIds)),
        );

  const gmCount =
    userIds.length === 0
      ? 0
      : await len(
          db
            .select({ id: groupMemberships.id })
            .from(groupMemberships)
            .where(inArray(groupMemberships.userId, userIds)),
        );

  // expense は restrict 制約のため先に attachment / approval_log を消す必要がある
  const expRows =
    userIds.length === 0
      ? []
      : await db
          .select({ id: expenses.id })
          .from(expenses)
          .where(inArray(expenses.userId, userIds));
  const userExpenseIds = expRows.map((e) => e.id);

  const orgExpRows =
    orgIds.length === 0
      ? []
      : await db
          .select({ id: expenses.id })
          .from(expenses)
          .where(inArray(expenses.organizationId, orgIds));
  const orgExpenseIds = orgExpRows.map((e) => e.id);

  const allExpenseIds = Array.from(
    new Set([...userExpenseIds, ...orgExpenseIds]),
  );

  const attachCount =
    allExpenseIds.length === 0
      ? 0
      : await len(
          db
            .select({ id: expenseAttachments.id })
            .from(expenseAttachments)
            .where(inArray(expenseAttachments.expenseId, allExpenseIds)),
        );

  const apprCount =
    allExpenseIds.length === 0
      ? 0
      : await len(
          db
            .select({ id: approvalLogs.id })
            .from(approvalLogs)
            .where(inArray(approvalLogs.expenseId, allExpenseIds)),
        );

  const auditCount =
    userIds.length === 0
      ? 0
      : await len(
          db
            .select({ id: auditLogs.id })
            .from(auditLogs)
            .where(inArray(auditLogs.actorId, userIds)),
        );

  const sessionCount =
    userIds.length === 0
      ? 0
      : await len(
          db
            .select({ id: authSessions.id })
            .from(authSessions)
            .where(inArray(authSessions.userId, userIds)),
        );

  const accountCount =
    userIds.length === 0
      ? 0
      : await len(
          db
            .select({ id: authAccounts.id })
            .from(authAccounts)
            .where(inArray(authAccounts.userId, userIds)),
        );

  const inviteCount =
    userIds.length === 0
      ? 0
      : await len(
          db
            .select({ id: invitations.id })
            .from(invitations)
            .where(inArray(invitations.inviterId, userIds)),
        );

  const orgGroupCount =
    orgIds.length === 0
      ? 0
      : await len(
          db
            .select({ id: groups.id })
            .from(groups)
            .where(inArray(groups.organizationId, orgIds)),
        );

  const orgBudgetCount =
    orgIds.length === 0
      ? 0
      : await len(
          db
            .select({ id: budgets.id })
            .from(budgets)
            .where(inArray(budgets.organizationId, orgIds)),
        );

  const orgMemCount =
    orgIds.length === 0
      ? 0
      : await len(
          db
            .select({ id: memberships.id })
            .from(memberships)
            .where(inArray(memberships.organizationId, orgIds)),
        );

  return {
    users: userCount,
    memberships: memCount,
    groupMemberships: gmCount,
    expenses: allExpenseIds.length,
    expenseAttachments: attachCount,
    approvalLogs: apprCount,
    auditLogs: auditCount,
    authSessions: sessionCount,
    authAccounts: accountCount,
    invitations: inviteCount,
    orgGroups: orgGroupCount,
    orgBudgets: orgBudgetCount,
    orgMemberships: orgMemCount,
    orgExpenses: orgExpenseIds.length,
    organizations: orgCount,
  };
}

async function deleteAll(userIds: string[], orgIds: string[]): Promise<void> {
  // SQLite (Turso/libSQL) なので transaction 内で順序立てて削除する。
  // expenses は onDelete: 'restrict' なので先に attachment / approval_log を消し、
  // 次に audit_logs / session / account を消し、最後に user / org を消す。
  await db.transaction(async (tx) => {
    // 1. user 起因 / org 起因の expense id を集める
    const userExpenses =
      userIds.length === 0
        ? []
        : await tx
            .select({ id: expenses.id })
            .from(expenses)
            .where(inArray(expenses.userId, userIds));

    const orgExpenses =
      orgIds.length === 0
        ? []
        : await tx
            .select({ id: expenses.id })
            .from(expenses)
            .where(inArray(expenses.organizationId, orgIds));

    const allExpenseIds = Array.from(
      new Set([
        ...userExpenses.map((e) => e.id),
        ...orgExpenses.map((e) => e.id),
      ]),
    );

    // 2. expense_attachments
    if (allExpenseIds.length > 0) {
      await tx
        .delete(expenseAttachments)
        .where(inArray(expenseAttachments.expenseId, allExpenseIds));
    }

    // 3. approval_logs
    if (allExpenseIds.length > 0) {
      await tx
        .delete(approvalLogs)
        .where(inArray(approvalLogs.expenseId, allExpenseIds));
    }

    // 4. expenses 本体
    if (allExpenseIds.length > 0) {
      await tx.delete(expenses).where(inArray(expenses.id, allExpenseIds));
    }

    // 5. group_memberships（user 起因）
    if (userIds.length > 0) {
      await tx
        .delete(groupMemberships)
        .where(inArray(groupMemberships.userId, userIds));
    }

    // 6. memberships（user 起因 + org 起因）
    if (userIds.length > 0 || orgIds.length > 0) {
      const conds = [];
      if (userIds.length > 0) conds.push(inArray(memberships.userId, userIds));
      if (orgIds.length > 0) {
        conds.push(inArray(memberships.organizationId, orgIds));
      }
      await tx.delete(memberships).where(or(...conds));
    }

    // 7. audit_logs（user 起因のみ）
    if (userIds.length > 0) {
      await tx
        .delete(auditLogs)
        .where(inArray(auditLogs.actorId, userIds));
    }

    // 8. invitations（user 起因 + org 起因）
    if (userIds.length > 0 || orgIds.length > 0) {
      const conds = [];
      if (userIds.length > 0) {
        conds.push(inArray(invitations.inviterId, userIds));
      }
      if (orgIds.length > 0) {
        conds.push(inArray(invitations.organizationId, orgIds));
      }
      await tx.delete(invitations).where(or(...conds));
    }

    // 9. auth_sessions（user 起因）
    if (userIds.length > 0) {
      await tx
        .delete(authSessions)
        .where(inArray(authSessions.userId, userIds));
    }

    // 10. auth_accounts（user 起因）
    if (userIds.length > 0) {
      await tx
        .delete(authAccounts)
        .where(inArray(authAccounts.userId, userIds));
    }

    // 11. budgets / groups（org 起因）— org cascade 制約があるが明示する
    if (orgIds.length > 0) {
      await tx.delete(budgets).where(inArray(budgets.organizationId, orgIds));
      await tx.delete(groups).where(inArray(groups.organizationId, orgIds));
    }

    // 12. users（e2e-%@coatly.local パターン）
    if (userIds.length > 0) {
      await tx.delete(users).where(inArray(users.id, userIds));
    }

    // 13. organizations（e2e-other-org）
    if (orgIds.length > 0) {
      await tx
        .delete(organizations)
        .where(inArray(organizations.id, orgIds));
    }
  });
}

function printCounts(counts: Counts): void {
  console.log('');
  console.log('  ┌─ E2E cleanup target counts ──────────────');
  console.log(`  │ users (e2e-%@coatly.local) : ${counts.users}`);
  console.log(`  │   memberships              : ${counts.memberships}`);
  console.log(`  │   group_memberships        : ${counts.groupMemberships}`);
  console.log(`  │   expenses (own + org)     : ${counts.expenses}`);
  console.log(`  │   expense_attachments      : ${counts.expenseAttachments}`);
  console.log(`  │   approval_logs            : ${counts.approvalLogs}`);
  console.log(`  │   audit_logs               : ${counts.auditLogs}`);
  console.log(`  │   auth_sessions            : ${counts.authSessions}`);
  console.log(`  │   auth_accounts            : ${counts.authAccounts}`);
  console.log(`  │   invitations              : ${counts.invitations}`);
  console.log(`  │ organization (e2e-other-org)`);
  console.log(`  │   organizations            : ${counts.organizations}`);
  console.log(`  │   org groups               : ${counts.orgGroups}`);
  console.log(`  │   org memberships          : ${counts.orgMemberships}`);
  console.log(`  │   org budgets              : ${counts.orgBudgets}`);
  console.log(`  │   org expenses             : ${counts.orgExpenses}`);
  console.log('  └────────────────────────────────────────');
  console.log('');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--commit');
  const commit = args.includes('--commit');

  if (!dryRun && !commit) {
    console.error(
      '[cleanup-e2e] usage: pnpm db:cleanup-e2e -- (--dry-run|--commit)',
    );
    process.exit(2);
  }

  console.log(
    `[cleanup-e2e] mode = ${dryRun ? 'DRY-RUN (no DELETE)' : 'COMMIT (DESTRUCTIVE)'}`,
  );
  console.log(
    `[cleanup-e2e] target db = ${process.env.TURSO_DATABASE_URL ?? 'file:./local.db'}`,
  );

  const userIds = await findE2eUserIds();
  const orgIds = await findE2eOrgIds();

  console.log(
    `[cleanup-e2e] matched ${userIds.length} e2e user(s), ${orgIds.length} e2e org(s)`,
  );

  if (userIds.length === 0 && orgIds.length === 0) {
    console.log('[cleanup-e2e] nothing to clean up. exit 0.');
    process.exit(0);
  }

  const counts = await countAll(userIds, orgIds);
  printCounts(counts);

  if (dryRun) {
    console.log(
      '[cleanup-e2e] DRY-RUN finished. Re-run with `--commit` to actually delete.',
    );
    process.exit(0);
  }

  console.log('[cleanup-e2e] deleting in transaction...');
  await deleteAll(userIds, orgIds);
  console.log('[cleanup-e2e] DONE. Verify with another --dry-run if unsure.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[cleanup-e2e] failed:', err);
    process.exit(1);
  });
