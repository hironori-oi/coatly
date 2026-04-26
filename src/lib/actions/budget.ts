'use server';

/**
 * 予算 Server Actions（Phase 1 polish 本実装）
 *
 * 認可: requireOrganizationRole(orgId, ['owner', 'admin'])
 * 監査: audit_logs に 1 行 INSERT
 * Revalidation: /admin/budgets, /admin/overview, /dashboard
 */
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { eq, and, isNull } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { db } from '@/lib/db/client';
import {
  budgets,
  organizations,
  groups,
  auditLogs,
} from '@/lib/db/schema';
import { setBudgetSchema, type SetBudgetInput } from '@/lib/validation/budget';
import { requireOrganizationRole } from '@/lib/auth/guards';
import {
  AuthError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import type { ActionErrorCode, ActionResult } from './expense';

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
  console.error('[budget action] internal', e);
  return { ok: false, error: 'internal_error', code: 'internal' };
}

/**
 * 予算の作成 or 更新（UPSERT 相当）。
 * groupId=null は組織全体予算。
 */
export async function setBudget(
  input: SetBudgetInput,
): Promise<ActionResult> {
  try {
    const data = setBudgetSchema.parse(input);
    const ctx = await requireOrganizationRole(data.organizationId, [
      'owner',
      'admin',
    ]);

    // groupId が指定されている場合は同 organization 内の group か確認
    if (data.groupId) {
      const g = await db
        .select({ id: groups.id })
        .from(groups)
        .where(
          and(
            eq(groups.id, data.groupId),
            eq(groups.organizationId, data.organizationId),
          ),
        )
        .limit(1);
      if (!g[0]) throw new NotFoundError('group');
    }

    const groupCondition = data.groupId
      ? eq(budgets.groupId, data.groupId)
      : isNull(budgets.groupId);

    const existing = await db
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.organizationId, data.organizationId),
          eq(budgets.fiscalYear, data.fiscalYear),
          groupCondition,
        ),
      )
      .limit(1);

    if (existing[0]) {
      // 更新
      const before = existing[0].amountJpy;
      await db
        .update(budgets)
        .set({
          amountJpy: data.amountJpy,
          note: data.note ?? existing[0].note ?? null,
          updatedAt: new Date(),
        })
        .where(eq(budgets.id, existing[0].id));

      await db.insert(auditLogs).values({
        organizationId: data.organizationId,
        actorId: ctx.user.id,
        entity: 'budget',
        entityId: existing[0].id,
        action: 'update',
        diff: {
          fiscalYear: data.fiscalYear,
          groupId: data.groupId,
          amountJpy: { before, after: data.amountJpy },
        },
      });
    } else {
      // 新規作成
      const id = ulid();
      await db.insert(budgets).values({
        id,
        organizationId: data.organizationId,
        groupId: data.groupId ?? null,
        fiscalYear: data.fiscalYear,
        amountJpy: data.amountJpy,
        note: data.note ?? null,
        createdBy: ctx.user.id,
      });

      await db.insert(auditLogs).values({
        organizationId: data.organizationId,
        actorId: ctx.user.id,
        entity: 'budget',
        entityId: id,
        action: 'create',
        diff: {
          fiscalYear: data.fiscalYear,
          groupId: data.groupId,
          amountJpy: data.amountJpy,
        },
      });
    }

    const orgRows = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, data.organizationId))
      .limit(1);
    if (orgRows[0]) {
      revalidatePath(`/${orgRows[0].slug}/admin/budgets`);
      revalidatePath(`/${orgRows[0].slug}/admin/overview`);
      revalidatePath(`/${orgRows[0].slug}/dashboard`);
    }

    return { ok: true, id: existing[0]?.id ?? '' };
  } catch (e) {
    return toError(e);
  }
}

const updateBudgetByIdSchema = z.object({
  id: z.string().min(1),
  amountJpy: z.coerce
    .number()
    .int()
    .min(0, '0円以上で入力してください')
    .max(1_000_000_000, '10億円以下で入力してください'),
  note: z.string().max(500).optional(),
});

/**
 * 既存 budget の予算額を変更する（UI のモーダル用）。
 */
export async function updateBudget(
  input: z.input<typeof updateBudgetByIdSchema>,
): Promise<ActionResult> {
  try {
    const data = updateBudgetByIdSchema.parse(input);

    const existing = await db
      .select()
      .from(budgets)
      .where(eq(budgets.id, data.id))
      .limit(1);
    if (!existing[0]) throw new NotFoundError('budget');

    const ctx = await requireOrganizationRole(existing[0].organizationId, [
      'owner',
      'admin',
    ]);

    if (data.amountJpy < existing[0].usedAmountJpy) {
      throw new ValidationError(
        `予算額は既に消化済みの ¥${existing[0].usedAmountJpy.toLocaleString()} を下回れません`,
      );
    }

    const before = existing[0].amountJpy;

    await db
      .update(budgets)
      .set({
        amountJpy: data.amountJpy,
        note: data.note ?? existing[0].note ?? null,
        updatedAt: new Date(),
      })
      .where(eq(budgets.id, data.id));

    await db.insert(auditLogs).values({
      organizationId: existing[0].organizationId,
      actorId: ctx.user.id,
      entity: 'budget',
      entityId: data.id,
      action: 'update',
      diff: {
        amountJpy: { before, after: data.amountJpy },
      },
    });

    const orgRows = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, existing[0].organizationId))
      .limit(1);
    if (orgRows[0]) {
      revalidatePath(`/${orgRows[0].slug}/admin/budgets`);
      revalidatePath(`/${orgRows[0].slug}/admin/overview`);
      revalidatePath(`/${orgRows[0].slug}/dashboard`);
    }

    return { ok: true, id: data.id };
  } catch (e) {
    return toError(e);
  }
}
