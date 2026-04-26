'use server';

/**
 * プロフィール / アカウント Server Actions（Phase 1 polish）
 *
 * - updateProfile: name 変更
 * - 退会 (deleteAccount) は Phase 2 で実装予定（現状 stub）
 *
 * Note: パスワード変更は Better Auth Client (authClient.changePassword) を
 * settings ページから直接呼び出す（client API がそのまま使える）。
 */
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/guards';
import { AuthError, ValidationError } from '@/lib/errors';
import type { ActionErrorCode, ActionResult } from './expense';

const updateProfileSchema = z.object({
  name: z.string().trim().min(1, '名前を入力してください').max(80),
});

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
  console.error('[profile action] internal', e);
  return { ok: false, error: 'internal_error', code: 'internal' };
}

export async function updateProfile(input: {
  name: string;
}): Promise<ActionResult> {
  try {
    const data = updateProfileSchema.parse(input);
    const user = await requireUser();
    await db
      .update(users)
      .set({ name: data.name, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    revalidatePath('/');
    return { ok: true, id: user.id };
  } catch (e) {
    return toError(e);
  }
}
