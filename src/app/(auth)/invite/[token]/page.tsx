/**
 * 招待受諾画面（W2 本実装）
 *
 * URL: /invite/[token]?email=...
 *
 * 1. token を Better Auth invitation テーブルから直接 lookup（pre-login のため）
 * 2. status=pending かつ expiresAt > now なら → サインアップフォーム
 * 3. それ以外 → エラー表示
 *
 * Server Component で invitation の有効性を判定し、Client コンポーネントへ
 * 必要な情報（email, organizationName）を渡す。
 */
import { eq } from 'drizzle-orm';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { db } from '@/lib/db/client';
import { invitations, organizations } from '@/lib/db/schema';
import { Card, CardContent } from '@/components/ui/card';
import { InviteAcceptForm } from './invite-accept-form';

export const metadata = {
  title: '招待を受け取る',
};

type LookupResult =
  | {
      ok: true;
      invitationId: string;
      email: string;
      organizationName: string;
      organizationSlug: string;
      role: string;
    }
  | { ok: false; reason: 'not_found' | 'expired' | 'already_used' };

async function lookupInvitation(token: string): Promise<LookupResult> {
  // Better Auth は invitation.id をそのまま token として使う。
  const rows = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      orgId: invitations.organizationId,
      orgName: organizations.name,
      orgSlug: organizations.slug,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
    .where(eq(invitations.id, token))
    .limit(1);

  const inv = rows[0];
  if (!inv) return { ok: false, reason: 'not_found' };
  if (inv.status !== 'pending') return { ok: false, reason: 'already_used' };
  if (inv.expiresAt && inv.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  return {
    ok: true,
    invitationId: inv.id,
    email: inv.email,
    organizationName: inv.orgName,
    organizationSlug: inv.orgSlug,
    role: inv.role,
  };
}

export default async function InviteAcceptPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const result = await lookupInvitation(token);

  if (!result.ok) {
    const message =
      result.reason === 'expired'
        ? '招待リンクの有効期限が切れています。管理者に再発行を依頼してください。'
        : result.reason === 'already_used'
          ? 'この招待リンクは既に使用済み、または取り消されています。'
          : '招待リンクが無効です。URL を再確認してください。';

    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">
            招待が確認できません
          </h1>
          <p className="mb-8 text-sm text-muted-foreground">
            管理者にお問い合わせください。
          </p>
          <Card>
            <CardContent className="p-6">
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
              >
                <ExclamationTriangleIcon
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <span>{message}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // クエリパラメータの email を優先（URL 共有時の参考表示用）。
  // 実際のサインアップでは invitation の email を強制する。
  const displayEmail = sp.email ?? result.email;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-court-green">
            招待
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Coatly へようこそ
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {result.organizationName}
            </span>{' '}
            から招待されました
          </p>
        </div>
        <InviteAcceptForm
          invitationId={result.invitationId}
          email={result.email}
          displayEmail={displayEmail}
          organizationSlug={result.organizationSlug}
          role={result.role}
        />
      </div>
    </main>
  );
}
