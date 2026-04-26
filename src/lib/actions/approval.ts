'use server';

/**
 * 承認 FSM Server Actions（W2-B 本実装）
 *
 * - approveExpense:   submitted → approved → 自動 charged_to_group / charged_to_organization
 *                     manager または admin/owner のみ
 * - rejectExpense:    submitted → rejected (reason 必須)
 * - reclassifyExpense: charged_to_* → 別 budget へ移し替え (admin only)
 *
 * すべての遷移で approval_logs に 1 行 INSERT。
 * budget の used_amount_jpy は同 transaction 内で UPDATE する。
 *
 * 仕様: dev-technical-spec-v2.md §1.2 (10〜13)
 */
import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { db } from '@/lib/db/client';
import {
  expenses,
  approvalLogs,
  budgets,
  organizations,
  groups,
  users,
  type ExpenseClassification,
  type ExpenseStatus,
} from '@/lib/db/schema';
import {
  approveExpenseSchema,
  rejectExpenseSchema,
  reclassifyExpenseSchema,
  type ApproveExpenseInput,
  type RejectExpenseInput,
  type ReclassifyExpenseInput,
} from '@/lib/validation/expense';
import { requireExpenseAccess } from '@/lib/auth/guards';
import { findBudgetForExpense } from '@/lib/db/scoped';
import { AuthError, NotFoundError, ValidationError } from '@/lib/errors';
import { notifyExpenseApproved } from '@/lib/email/notify';
import type { ActionResult, ActionErrorCode } from './expense';

function toError(e: unknown): {
  ok: false;
  error: string;
  code: ActionErrorCode;
} {
  if (e instanceof AuthError) {
    return {
      ok: false,
      error: e.message,
      code: e.status === 401 ? 'unauthorized' : 'forbidden',
    };
  }
  if (e instanceof NotFoundError) {
    return { ok: false, error: e.message, code: 'not_found' };
  }
  if (e instanceof ValidationError) {
    return { ok: false, error: e.message, code: 'validation' };
  }
  if (
    typeof e === 'object' &&
    e !== null &&
    'name' in e &&
    (e as { name: string }).name === 'ZodError'
  ) {
    return {
      ok: false,
      error: '入力内容を確認してください',
      code: 'validation',
    };
  }
  console.error('[approval action] internal', e);
  return { ok: false, error: 'internal_error', code: 'internal' };
}

/**
 * classification → 充当 status へのマッピング。
 *
 * - group_funded         → charged_to_group
 * - organization_funded  → charged_to_organization
 * - personal             → approved（自己負担、budget 影響なし）
 */
function classificationToChargedStatus(
  c: ExpenseClassification,
): ExpenseStatus {
  switch (c) {
    case 'group_funded':
      return 'charged_to_group';
    case 'organization_funded':
      return 'charged_to_organization';
    case 'personal':
      return 'approved';
  }
}

// ────────────────────────────────────────────────────────────────────
// approveExpense
// ────────────────────────────────────────────────────────────────────

export async function approveExpense(
  input: ApproveExpenseInput,
): Promise<ActionResult> {
  try {
    const data = approveExpenseSchema.parse(input);
    const { ctx, expense } = await requireExpenseAccess(data.id, 'write');

    // 承認権限: manager (該当 group) or admin/owner のみ
    const isManager = ctx.managedGroupIds.includes(expense.groupId);
    const isAdmin = ctx.orgRole === 'owner' || ctx.orgRole === 'admin';
    if (!isManager && !isAdmin) {
      throw new AuthError('approver_required', 403);
    }

    // 自分の申請を自分で承認するのは禁止
    if (expense.userId === ctx.user.id) {
      throw new ValidationError('自分の申請は承認できません');
    }

    if (expense.status !== 'submitted') {
      throw new ValidationError('提出済みの申請のみ承認できます');
    }

    const newStatus = classificationToChargedStatus(data.classification);

    // 充当先 budget の確認 (personal でなければ)
    let budget: Awaited<ReturnType<typeof findBudgetForExpense>> = null;
    if (data.classification !== 'personal') {
      budget = await findBudgetForExpense({
        organizationId: expense.organizationId,
        fiscalYear: expense.fiscalYear,
        groupId: expense.groupId,
        classification: data.classification,
      });
      if (!budget) {
        throw new ValidationError(
          `充当先予算が見つかりません（FY${expense.fiscalYear} / ${data.classification === 'group_funded' ? 'グループ予算' : '組織予算'}）`,
        );
      }
    }

    // 遷移本体: トランザクションで status update + budget 加算 + log INSERT
    await db.transaction(async (tx) => {
      // optimistic lock: status が submitted のままのときのみ遷移
      const updated = await tx
        .update(expenses)
        .set({
          status: newStatus,
          classification: data.classification,
          approvedBy: ctx.user.id,
          approvedAt: new Date(),
          rejectionReason: null,
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, data.id))
        .returning({ id: expenses.id, status: expenses.status });

      if (!updated[0] || updated[0].status !== newStatus) {
        throw new ValidationError(
          'この申請は別の操作で状態が変わっています。再読み込みしてください',
        );
      }

      // budget 加算
      if (budget) {
        await tx
          .update(budgets)
          .set({
            usedAmountJpy: sql`${budgets.usedAmountJpy} + ${expense.amountJpy}`,
            updatedAt: new Date(),
          })
          .where(eq(budgets.id, budget.id));
      }

      // approval_logs
      await tx.insert(approvalLogs).values({
        id: ulid(),
        expenseId: data.id,
        actorId: ctx.user.id,
        action: 'approve',
        fromStatus: 'submitted',
        toStatus: newStatus,
        comment: data.comment ?? null,
      });
    });

    const orgRows = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, expense.organizationId))
      .limit(1);

    // 申請者へ承認結果メール
    try {
      const submitterRow = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, expense.userId))
        .limit(1);
      const groupRow = await db
        .select({ name: groups.name })
        .from(groups)
        .where(eq(groups.id, expense.groupId))
        .limit(1);

      if (submitterRow[0]?.email && orgRows[0] && groupRow[0]) {
        await notifyExpenseApproved({
          recipientEmail: submitterRow[0].email,
          recipientName: submitterRow[0].name ?? undefined,
          result: 'approved',
          classification: data.classification,
          groupName: groupRow[0].name,
          date: expense.date,
          description: expense.description,
          amountJpy: expense.amountJpy,
          organizationSlug: orgRows[0].slug,
          expenseId: data.id,
        });
      }
    } catch (mailErr) {
       
      console.warn('[approveExpense] mail notify failed', mailErr);
    }

    if (orgRows[0]) {
      revalidatePath(`/${orgRows[0].slug}/expenses`);
      revalidatePath(`/${orgRows[0].slug}/expenses/${data.id}`);
      revalidatePath(`/${orgRows[0].slug}/dashboard`);
      revalidatePath(`/${orgRows[0].slug}/admin/overview`);
    }

    return { ok: true, id: data.id };
  } catch (e) {
    return toError(e);
  }
}

// ────────────────────────────────────────────────────────────────────
// rejectExpense
// ────────────────────────────────────────────────────────────────────

export async function rejectExpense(
  input: RejectExpenseInput,
): Promise<ActionResult> {
  try {
    const data = rejectExpenseSchema.parse(input);
    const { ctx, expense } = await requireExpenseAccess(data.id, 'write');

    const isManager = ctx.managedGroupIds.includes(expense.groupId);
    const isAdmin = ctx.orgRole === 'owner' || ctx.orgRole === 'admin';
    if (!isManager && !isAdmin) {
      throw new AuthError('approver_required', 403);
    }

    if (expense.status !== 'submitted') {
      throw new ValidationError('提出済みの申請のみ差戻しできます');
    }

    await db.transaction(async (tx) => {
      const updated = await tx
        .update(expenses)
        .set({
          status: 'rejected',
          rejectionReason: data.reason,
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, data.id))
        .returning({ id: expenses.id });
      if (!updated[0]) throw new NotFoundError('expense');

      await tx.insert(approvalLogs).values({
        id: ulid(),
        expenseId: data.id,
        actorId: ctx.user.id,
        action: 'reject',
        fromStatus: 'submitted',
        toStatus: 'rejected',
        comment: data.reason,
      });
    });

    const orgRows = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, expense.organizationId))
      .limit(1);

    // 申請者へ差戻メール
    try {
      const submitterRow = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, expense.userId))
        .limit(1);
      const groupRow = await db
        .select({ name: groups.name })
        .from(groups)
        .where(eq(groups.id, expense.groupId))
        .limit(1);

      if (submitterRow[0]?.email && orgRows[0] && groupRow[0]) {
        await notifyExpenseApproved({
          recipientEmail: submitterRow[0].email,
          recipientName: submitterRow[0].name ?? undefined,
          result: 'rejected',
          rejectionReason: data.reason,
          groupName: groupRow[0].name,
          date: expense.date,
          description: expense.description,
          amountJpy: expense.amountJpy,
          organizationSlug: orgRows[0].slug,
          expenseId: data.id,
        });
      }
    } catch (mailErr) {
       
      console.warn('[rejectExpense] mail notify failed', mailErr);
    }

    if (orgRows[0]) {
      revalidatePath(`/${orgRows[0].slug}/expenses`);
      revalidatePath(`/${orgRows[0].slug}/expenses/${data.id}`);
      revalidatePath(`/${orgRows[0].slug}/dashboard`);
    }

    return { ok: true, id: data.id };
  } catch (e) {
    return toError(e);
  }
}

// ────────────────────────────────────────────────────────────────────
// reclassifyExpense (admin only)
// ────────────────────────────────────────────────────────────────────

export async function reclassifyExpense(
  input: ReclassifyExpenseInput,
): Promise<ActionResult> {
  try {
    const data = reclassifyExpenseSchema.parse(input);
    const { ctx, expense } = await requireExpenseAccess(data.id, 'write');

    const isAdmin = ctx.orgRole === 'owner' || ctx.orgRole === 'admin';
    if (!isAdmin) {
      throw new AuthError('admin_required', 403);
    }

    // 既に承認済みの状態でないと reclassify はできない
    if (
      expense.status !== 'charged_to_group' &&
      expense.status !== 'charged_to_organization' &&
      expense.status !== 'approved'
    ) {
      throw new ValidationError(
        '承認済みの申請のみ充当先を変更できます',
      );
    }
    if (expense.classification === data.newClassification) {
      throw new ValidationError('現在の充当先と同じです');
    }

    // 旧 budget (減算先) と 新 budget (加算先)
    const oldBudget = expense.classification
      ? await findBudgetForExpense({
          organizationId: expense.organizationId,
          fiscalYear: expense.fiscalYear,
          groupId: expense.groupId,
          classification: expense.classification,
        })
      : null;

    const newBudget = await findBudgetForExpense({
      organizationId: expense.organizationId,
      fiscalYear: expense.fiscalYear,
      groupId: expense.groupId,
      classification: data.newClassification,
    });

    if (data.newClassification !== 'personal' && !newBudget) {
      throw new ValidationError(
        `新充当先の予算が見つかりません（FY${expense.fiscalYear}）`,
      );
    }

    const newStatus = classificationToChargedStatus(data.newClassification);
    const fromStatus = expense.status;

    await db.transaction(async (tx) => {
      // 旧 budget から減算
      if (oldBudget) {
        await tx
          .update(budgets)
          .set({
            usedAmountJpy: sql`${budgets.usedAmountJpy} - ${expense.amountJpy}`,
            updatedAt: new Date(),
          })
          .where(eq(budgets.id, oldBudget.id));
      }
      // 新 budget へ加算
      if (newBudget) {
        await tx
          .update(budgets)
          .set({
            usedAmountJpy: sql`${budgets.usedAmountJpy} + ${expense.amountJpy}`,
            updatedAt: new Date(),
          })
          .where(eq(budgets.id, newBudget.id));
      }

      await tx
        .update(expenses)
        .set({
          status: newStatus,
          classification: data.newClassification,
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, data.id));

      await tx.insert(approvalLogs).values({
        id: ulid(),
        expenseId: data.id,
        actorId: ctx.user.id,
        action: 'reclassify',
        fromStatus,
        toStatus: newStatus,
        comment:
          data.comment ??
          `充当先変更: ${expense.classification ?? 'unknown'} → ${data.newClassification}`,
      });
    });

    const orgRows = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, expense.organizationId))
      .limit(1);
    if (orgRows[0]) {
      revalidatePath(`/${orgRows[0].slug}/expenses`);
      revalidatePath(`/${orgRows[0].slug}/expenses/${data.id}`);
      revalidatePath(`/${orgRows[0].slug}/dashboard`);
      revalidatePath(`/${orgRows[0].slug}/admin/overview`);
    }

    return { ok: true, id: data.id };
  } catch (e) {
    return toError(e);
  }
}
