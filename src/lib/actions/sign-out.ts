'use server';

/**
 * サインアウト Server Action
 *
 * - auth.api.signOut で session を破棄
 * - /login へ redirect
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/better-auth';

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect('/login');
}
