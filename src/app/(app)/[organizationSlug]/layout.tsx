/**
 * 組織コンテキスト layout（W2 認可ガード本実装）
 *
 * URL: /[organizationSlug]/...
 * 例:  /coatly-tennis/dashboard
 *
 * フロー:
 *  1. organizationSlug → organizationId 逆引き（DB lookup）
 *  2. requireOrganizationRole で role check + AuthContext 構築
 *  3. ヘッダにユーザーアバター + dropdown を表示
 *  4. ガード失敗 → unauthorized → middleware が /login redirect していなければ notFound
 */
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { organizations } from '@/lib/db/schema';
import {
  requireOrganizationRole,
  type AuthContext,
} from '@/lib/auth/guards';
import { AuthError } from '@/lib/errors';
import { UserMenu } from '@/components/user-menu';
import { ThemeToggle } from '@/components/theme-toggle';

async function resolveOrganization(slug: string) {
  const rows = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

async function loadAuthContext(
  organizationId: string,
): Promise<AuthContext | { error: 'unauthorized' | 'forbidden' }> {
  try {
    const ctx = await requireOrganizationRole(organizationId, [
      'owner',
      'admin',
      'member',
    ]);
    return ctx;
  } catch (e) {
    if (e instanceof AuthError) {
      return { error: e.status === 401 ? 'unauthorized' : 'forbidden' };
    }
    throw e;
  }
}

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  const org = await resolveOrganization(organizationSlug);
  if (!org) notFound();

  const authResult = await loadAuthContext(org.id);
  if ('error' in authResult) {
    if (authResult.error === 'unauthorized') {
      redirect(`/login?next=/${organizationSlug}/dashboard`);
    }
    // forbidden = 別組織の slug を踏んだ等
    notFound();
  }

  const ctx = authResult;

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-background">
      {/* Sidebar */}
      <aside className="border-r border-border bg-card px-4 py-6">
        <div className="mb-6 flex items-center gap-2">
          <span className="text-base font-semibold tracking-tight">
            Coatly
          </span>
        </div>
        <nav className="space-y-1 text-sm">
          <SidebarLink
            href={`/${organizationSlug}/dashboard`}
            label="ダッシュボード"
          />
          <SidebarLink
            href={`/${organizationSlug}/expenses`}
            label="活動費"
          />
          {(ctx.orgRole === 'owner' || ctx.orgRole === 'admin') && (
            <SidebarLink
              href={`/${organizationSlug}/admin/overview`}
              label="全体管理"
            />
          )}
          <SidebarLink
            href={`/${organizationSlug}/settings`}
            label="設定"
          />
        </nav>
      </aside>

      {/* Main */}
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-border bg-card/50 px-8 py-3">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {org.name}
          </p>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <UserMenu
              organizationSlug={organizationSlug}
              userName={ctx.user.name ?? ''}
              userEmail={ctx.user.email}
            />
          </div>
        </header>
        <main className="flex-1 px-8 py-6">{children}</main>
      </div>
    </div>
  );
}

function SidebarLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded-md px-3 py-2 text-foreground/80 transition-colors hover:bg-stone-100 hover:text-foreground"
    >
      {label}
    </Link>
  );
}
