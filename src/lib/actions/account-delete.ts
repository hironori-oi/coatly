'use server';

/**
 * アカウント退会（soft delete）Server Actions
 *
 * 仕様（W3-A polish, DEC-NEW: 退会フロー）:
 *  - 二段階確認: client 側でモーダルを出し、ログイン中のメールアドレスを
 *    再入力させる（このサーバ側でも一致確認する）
 *  - 唯一の owner として残ってしまう組織がある場合は拒否
 *    （組織が owner 不在になるのを防ぐ。先に owner 移譲してから退会する）
 *  - users テーブルを soft-delete（deletedAt = now, isActive = false）
 *    DB スキーマ上は users.deletedAt が timestamp で既に存在
 *  - Better Auth セッションを全件 revoke（認証復活させない）
 *  - レシート（R2 + expense_attachments）は法定 7 年保存のため削除しない
 *    expenses.userId / approval_logs.actorId / audit_logs.actor_id は ON DELETE
 *    restrict / set null なので、soft-delete することで履歴が破壊されない
 *
 * 注: Better Auth の admin plugin に `removeUser` があるが、これは
 *     auth_sessions / auth_accounts / users から物理削除するため、Phase 1 では
 *     使わない（履歴を残す + R2 領収書の userId を維持する）。
 *     soft-delete + session 物理 revoke の組み合わせで運用する。
 */
import { eq, and, count, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import {
  users,
  memberships,
  authSessions,
  auditLogs,
} from '@/lib/db/schema';
import { auth } from '@/lib/auth/better-auth';
import { requireUser } from '@/lib/auth/guards';
import {
  AuthError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import type { ActionErrorCode, ActionResult } from './expense';

// ────────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────────

const deleteAccountSchema = z.object({
  /** 二段階確認: ログイン中ユーザのメールアドレスを再入力させる */
  confirmEmail: z.string().email().min(1),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

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
  console.error('[account-delete action] internal', e);
  return { ok: false, error: 'internal_error', code: 'internal' };
}

/**
 * 「自分が抜けると owner 0 人になる組織」を全て返す。
 *
 * 1 SQL でやれるが Drizzle の subquery が複雑になるため
 * 「自分が owner の組織一覧」+「各 org の owner 総数」を 2 query で
 * 取って application 側で filter する。退会は頻度が低いので OK。
 */
export async function getSoleOwnerOrgs(
  userId: string,
): Promise<{ organizationId: string }[]> {
  const myOwnerOrgs = await db
    .select({ organizationId: memberships.organizationId })
    .from(memberships)
    .where(
      and(eq(memberships.userId, userId), eq(memberships.role, 'owner')),
    );

  if (myOwnerOrgs.length === 0) return [];

  const result: { organizationId: string }[] = [];
  for (const o of myOwnerOrgs) {
    const ownerCountRows = await db
      .select({ c: count() })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, o.organizationId),
          eq(memberships.role, 'owner'),
        ),
      );
    const c = ownerCountRows[0]?.c ?? 0;
    if (c <= 1) {
      result.push({ organizationId: o.organizationId });
    }
  }
  return result;
}

// ────────────────────────────────────────────────────────────────────
// Actions
// ────────────────────────────────────────────────────────────────────

export type DeleteAccountPreflight = {
  ok: true;
  email: string;
  /** 自分が唯一の owner として在籍している org ID 群（空なら退会可能） */
  blockingSoleOwnerOrgIds: string[];
};

/**
 * 退会画面の事前チェック。client がモーダルを開いた時点で呼ぶ。
 *
 * - blocking が非空 → UI 側で「先に owner 移譲が必要です」を出す
 * - 退会自体は deleteAccount で実行
 */
export async function getAccountDeletePreflight(): Promise<
  DeleteAccountPreflight | { ok: false; error: string; code: ActionErrorCode }
> {
  try {
    const user = await requireUser();
    const blocking = await getSoleOwnerOrgs(user.id);
    return {
      ok: true,
      email: user.email,
      blockingSoleOwnerOrgIds: blocking.map((b) => b.organizationId),
    };
  } catch (e) {
    return toError(e);
  }
}

/**
 * アカウントを退会する（soft delete）。
 *
 * 1. confirmEmail がログイン中の email と一致することを確認
 * 2. 唯一の owner として残ってしまう org が無いことを確認
 * 3. users.deletedAt = now / isActive = false で soft-delete
 * 4. auth_sessions を物理削除（Better Auth signOut + DB delete）
 * 5. audit log を残す
 */
export async function deleteAccount(
  input: DeleteAccountInput,
): Promise<ActionResult> {
  try {
    const data = deleteAccountSchema.parse(input);
    const user = await requireUser();

    // 1) email 一致確認（大文字小文字無視）
    if (data.confirmEmail.toLowerCase() !== user.email.toLowerCase()) {
      throw new ValidationError(
        '入力されたメールアドレスがログイン中のアカウントと一致しません',
      );
    }

    // 2) sole-owner check
    const blocking = await getSoleOwnerOrgs(user.id);
    if (blocking.length > 0) {
      throw new ValidationError(
        `あなたが唯一のオーナーとして在籍している組織があるため退会できません（${blocking.length} 件）。先に他のメンバーへオーナー権限を移譲してください。`,
      );
    }

    // 3) soft-delete users
    await db
      .update(users)
      .set({
        deletedAt: new Date(),
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // 4) revoke sessions
    //    - Better Auth signOut（cookie + 当該 session 削除）
    try {
      await auth.api.signOut({ headers: await headers() });
    } catch (e) {
      // signOut 失敗はログのみ（DB の物理削除でリカバリ）
      console.warn('[deleteAccount] auth.signOut failed', e);
    }
    //    - 念のため当該ユーザの全 session を物理削除
    await db.delete(authSessions).where(eq(authSessions.userId, user.id));

    // 5) audit log（organizationId は null = 全 org にまたがる）
    await db.insert(auditLogs).values({
      organizationId: null,
      actorId: user.id,
      entity: 'user',
      entityId: user.id,
      action: 'delete',
      diff: { softDeleted: true, email: user.email },
    });

    return { ok: true, id: user.id };
  } catch (e) {
    return toError(e);
  }
}

// 未使用 import の TS 警告抑止（sql は将来の bulk update で使う想定）
void sql;
