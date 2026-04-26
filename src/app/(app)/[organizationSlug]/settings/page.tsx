/**
 * 設定ページ（Phase 1 polish 本実装）
 *
 * - プロフィール（name 編集）
 * - 外観（テーマ切替）
 * - パスワード変更（Better Auth changePassword）
 * - 退会（Phase 2 stub）
 *
 * 認可は parent layout の requireOrganizationRole で member 以上に通過済み。
 */
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/guards';
import { AuthError } from '@/lib/errors';
import { SettingsClient } from './settings-client';

export const metadata = { title: '設定' };

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof AuthError && e.status === 401) {
      redirect(`/login?next=/${organizationSlug}/settings`);
    }
    throw e;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">設定</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          プロフィール・外観・パスワードを管理します。
        </p>
      </header>
      <SettingsClient
        initialName={user.name ?? ''}
        email={user.email}
      />
    </div>
  );
}
