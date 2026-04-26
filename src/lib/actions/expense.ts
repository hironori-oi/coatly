'use server';

/**
 * 活動費 Server Actions（W2-B 本実装）
 *
 * 認可: 全 action 冒頭で requireOrganizationRole / requireExpenseAccess を呼ぶ。
 * 入力検証: Zod schema で再検証（クライアント側検証は信用しない）。
 * 監査: create / update / delete は audit_logs に 1 行 INSERT。
 * Revalidation: revalidatePath で該当ページの cache を無効化。
 *
 * Actions:
 *  - createExpense(input):   draft で作成 + attachments INSERT
 *  - updateExpense(input):   draft / rejected のみ編集可（オーナー本人のみ）
 *  - submitExpense({id}):    draft → submitted（提出ログ）
 *  - withdrawExpense({id}):  submitted → draft（提出者本人のみ）
 *  - deleteExpense({id}):    draft のみ削除可
 *
 * 仕様: dev-technical-spec-v2.md §1.2 / §3.2
 */
import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { db } from '@/lib/db/client';
import {
  expenses,
  expenseAttachments,
  approvalLogs,
  auditLogs,
  organizations,
  groups,
  users,
} from '@/lib/db/schema';
import {
  createExpenseSchema,
  updateExpenseSchema,
  submitExpenseSchema,
  withdrawExpenseSchema,
  deleteExpenseSchema,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from '@/lib/validation/expense';
import {
  requireOrganizationRole,
  requireExpenseAccess,
} from '@/lib/auth/guards';
import { computeFiscalYear, getApproverContacts } from '@/lib/db/scoped';
import { AuthError, NotFoundError, ValidationError } from '@/lib/errors';
import { notifyExpenseSubmitted } from '@/lib/email/notify';

// ────────────────────────────────────────────────────────────────────
// 共通結果型
// ────────────────────────────────────────────────────────────────────

export type ActionErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'state'
  | 'internal';

export type ActionResult<T = { id: string }> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code?: ActionErrorCode };

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
  console.error('[expense action] internal', e);
  return { ok: false, error: 'internal_error', code: 'internal' };
}

// ────────────────────────────────────────────────────────────────────
// createExpense
// ────────────────────────────────────────────────────────────────────

export async function createExpense(
  input: CreateExpenseInput,
): Promise<ActionResult> {
  try {
    const data = createExpenseSchema.parse(input);

    // 認可: 組織のメンバー以上
    const ctx = await requireOrganizationRole(data.organizationId, [
      'owner',
      'admin',
      'member',
    ]);

    // groupId が visibleGroupIds に含まれている必要がある
    // （admin/owner は visibleGroupIds に組織内全 group が含まれている）
    if (!ctx.visibleGroupIds.includes(data.groupId)) {
      throw new AuthError('group_not_accessible', 403);
    }

    // 領収証なし + インボイス番号もなし → 警告ではなく許可（仕様では both 任意）
    // ただし amount > 30,000 円 + 領収証なしは Zod 上は通すが UI で警告する想定

    // 組織から fiscal year 算出
    const orgRows = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, data.organizationId))
      .limit(1);
    if (!orgRows[0]) throw new NotFoundError('organization');
    const fiscalYear = computeFiscalYear(orgRows[0], data.date);

    const expenseId = ulid();

    // libSQL は Drizzle batch を使うか単発で順次実行する。
    // ここでは整合性 (failure → 添付未挿入) を優先して try-catch + cleanup は行わず、
    // 添付の INSERT 失敗時は expense はそのまま残し、UI 側で再アップロードを促す。
    await db.insert(expenses).values({
      id: expenseId,
      organizationId: data.organizationId,
      groupId: data.groupId,
      userId: ctx.user.id,
      fiscalYear,
      date: data.date,
      description: data.description,
      amountJpy: data.amount,
      hasReceipt: data.hasReceipt,
      invoiceNumber:
        data.invoiceNumber && data.invoiceNumber !== ''
          ? data.invoiceNumber
          : null,
      status: 'draft',
      classification: data.classification,
    });

    // 添付メタを INSERT
    if (data.attachments && data.attachments.length > 0) {
      for (const att of data.attachments) {
        await db.insert(expenseAttachments).values({
          id: ulid(),
          expenseId,
          r2ObjectKey: att.objectKey,
          fileName: att.fileName,
          mimeType: att.contentType,
          sizeBytes: att.size,
          uploadedBy: ctx.user.id,
        });
      }
      // 添付があれば hasReceipt も自動 true
      if (!data.hasReceipt) {
        await db
          .update(expenses)
          .set({ hasReceipt: true })
          .where(eq(expenses.id, expenseId));
      }
    }

    // 監査ログ
    await db.insert(auditLogs).values({
      organizationId: data.organizationId,
      actorId: ctx.user.id,
      entity: 'expense',
      entityId: expenseId,
      action: 'create',
      diff: {
        groupId: data.groupId,
        description: data.description,
        amountJpy: data.amount,
        classification: data.classification,
      },
    });

    // revalidate
    const orgSlug = orgRows[0].slug;
    revalidatePath(`/${orgSlug}/expenses`);
    revalidatePath(`/${orgSlug}/dashboard`);

    return { ok: true, id: expenseId };
  } catch (e) {
    return toError(e);
  }
}

// ────────────────────────────────────────────────────────────────────
// updateExpense
// ────────────────────────────────────────────────────────────────────

export async function updateExpense(
  input: UpdateExpenseInput,
): Promise<ActionResult> {
  try {
    const data = updateExpenseSchema.parse(input);

    const { ctx, expense } = await requireExpenseAccess(data.id, 'write');

    // status check: draft / rejected のみ編集可能
    if (expense.status !== 'draft' && expense.status !== 'rejected') {
      throw new ValidationError(
        'この申請は編集できません（提出後は引き戻しから）',
      );
    }

    // オーナー本人のみ
    if (expense.userId !== ctx.user.id) {
      throw new AuthError('not_owner', 403);
    }

    // 変更フィールド
    const patch: Partial<typeof expenses.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (data.groupId !== undefined) {
      // 新 groupId が visible に含まれる必要がある
      if (!ctx.visibleGroupIds.includes(data.groupId)) {
        throw new AuthError('group_not_accessible', 403);
      }
      patch.groupId = data.groupId;
    }
    if (data.date !== undefined) patch.date = data.date;
    if (data.description !== undefined) patch.description = data.description;
    if (data.amount !== undefined) patch.amountJpy = data.amount;
    if (data.hasReceipt !== undefined) patch.hasReceipt = data.hasReceipt;
    if (data.classification !== undefined)
      patch.classification = data.classification;
    if (data.invoiceNumber !== undefined) {
      patch.invoiceNumber =
        data.invoiceNumber && data.invoiceNumber !== ''
          ? data.invoiceNumber
          : null;
    }

    // rejected → 編集 → status を draft に戻す（再提出可能化）
    if (expense.status === 'rejected') {
      patch.status = 'draft';
      patch.rejectionReason = null;
    }

    await db.update(expenses).set(patch).where(eq(expenses.id, data.id));

    // 添付追加（既存添付は触らない、追加のみ）
    if (data.attachments && data.attachments.length > 0) {
      for (const att of data.attachments) {
        await db.insert(expenseAttachments).values({
          id: ulid(),
          expenseId: data.id,
          r2ObjectKey: att.objectKey,
          fileName: att.fileName,
          mimeType: att.contentType,
          sizeBytes: att.size,
          uploadedBy: ctx.user.id,
        });
      }
    }

    // 監査
    await db.insert(auditLogs).values({
      organizationId: expense.organizationId,
      actorId: ctx.user.id,
      entity: 'expense',
      entityId: data.id,
      action: 'update',
      diff: patch as Record<string, unknown>,
    });

    // revalidate
    const orgRows = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, expense.organizationId))
      .limit(1);
    if (orgRows[0]) {
      revalidatePath(`/${orgRows[0].slug}/expenses`);
      revalidatePath(`/${orgRows[0].slug}/expenses/${data.id}`);
    }

    return { ok: true, id: data.id };
  } catch (e) {
    return toError(e);
  }
}

// ────────────────────────────────────────────────────────────────────
// submitExpense (draft → submitted)
// ────────────────────────────────────────────────────────────────────

export async function submitExpense(input: {
  id: string;
}): Promise<ActionResult> {
  try {
    const data = submitExpenseSchema.parse(input);
    const { ctx, expense } = await requireExpenseAccess(data.id, 'write');

    // 提出は本人のみ
    if (expense.userId !== ctx.user.id) {
      throw new AuthError('not_owner', 403);
    }
    if (expense.status !== 'draft' && expense.status !== 'rejected') {
      throw new ValidationError('この申請は提出できません');
    }

    const fromStatus = expense.status;

    await db
      .update(expenses)
      .set({ status: 'submitted', updatedAt: new Date() })
      .where(
        and(
          eq(expenses.id, data.id),
          // optimistic lock: 想定 status のときのみ遷移
          eq(expenses.status, fromStatus),
        ),
      );

    await db.insert(approvalLogs).values({
      id: ulid(),
      expenseId: data.id,
      actorId: ctx.user.id,
      action: 'submit',
      fromStatus,
      toStatus: 'submitted',
    });

    const orgRows = await db
      .select({ slug: organizations.slug, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, expense.organizationId))
      .limit(1);

    // manager 通知メール（失敗してもアプリは止めない）
    try {
      const groupRow = await db
        .select({ name: groups.name })
        .from(groups)
        .where(eq(groups.id, expense.groupId))
        .limit(1);
      const submitterRow = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      const approvers = await getApproverContacts({
        organizationId: expense.organizationId,
        groupId: expense.groupId,
        excludeUserId: ctx.user.id,
      });

      if (approvers.length > 0 && orgRows[0] && groupRow[0]) {
        const nameMap = new Map<string, string>();
        for (const a of approvers) nameMap.set(a.email, a.name);
        await notifyExpenseSubmitted({
          managerEmails: approvers.map((a) => a.email),
          managerNames: nameMap,
          submitterName:
            submitterRow[0]?.name?.trim() ||
            submitterRow[0]?.email ||
            'メンバー',
          groupName: groupRow[0].name,
          date: expense.date,
          description: expense.description,
          amountJpy: expense.amountJpy,
          organizationSlug: orgRows[0].slug,
          expenseId: data.id,
        });
      }
    } catch (mailErr) {
       
      console.warn('[submitExpense] mail notify failed', mailErr);
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
// withdrawExpense (submitted → draft)
// ────────────────────────────────────────────────────────────────────

export async function withdrawExpense(input: {
  id: string;
}): Promise<ActionResult> {
  try {
    const data = withdrawExpenseSchema.parse(input);
    const { ctx, expense } = await requireExpenseAccess(data.id, 'write');

    if (expense.userId !== ctx.user.id) {
      throw new AuthError('not_owner', 403);
    }
    if (expense.status !== 'submitted') {
      throw new ValidationError('提出中の申請のみ引き戻しできます');
    }

    await db
      .update(expenses)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(
        and(eq(expenses.id, data.id), eq(expenses.status, 'submitted')),
      );

    await db.insert(approvalLogs).values({
      id: ulid(),
      expenseId: data.id,
      actorId: ctx.user.id,
      action: 'withdraw',
      fromStatus: 'submitted',
      toStatus: 'draft',
    });

    const orgRows = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, expense.organizationId))
      .limit(1);
    if (orgRows[0]) {
      revalidatePath(`/${orgRows[0].slug}/expenses`);
      revalidatePath(`/${orgRows[0].slug}/expenses/${data.id}`);
    }

    return { ok: true, id: data.id };
  } catch (e) {
    return toError(e);
  }
}

// ────────────────────────────────────────────────────────────────────
// deleteExpense (draft only)
// ────────────────────────────────────────────────────────────────────

export async function deleteExpense(input: {
  id: string;
}): Promise<ActionResult> {
  try {
    const data = deleteExpenseSchema.parse(input);
    const { ctx, expense } = await requireExpenseAccess(data.id, 'write');

    if (expense.userId !== ctx.user.id) {
      throw new AuthError('not_owner', 403);
    }
    if (expense.status !== 'draft') {
      throw new ValidationError('下書きのみ削除できます');
    }

    // 添付 (R2 object) は cron で arphan を片付ける方針 (v2 §5.4)。
    // ここでは DB 行のみ cascade で削除する。
    await db.delete(expenses).where(eq(expenses.id, data.id));

    await db.insert(auditLogs).values({
      organizationId: expense.organizationId,
      actorId: ctx.user.id,
      entity: 'expense',
      entityId: data.id,
      action: 'delete',
      diff: {
        description: expense.description,
        amountJpy: expense.amountJpy,
      },
    });

    const orgRows = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, expense.organizationId))
      .limit(1);
    if (orgRows[0]) {
      revalidatePath(`/${orgRows[0].slug}/expenses`);
    }

    return { ok: true, id: data.id };
  } catch (e) {
    return toError(e);
  }
}
