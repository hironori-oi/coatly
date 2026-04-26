/**
 * メンバー管理（admin / Phase 1 polish 本実装）
 *
 * 認可: admin/layout.tsx で owner/admin のみ通過
 * 表示:
 *  - 既存メンバー一覧（名前 / メール / 全体ロール / 所属グループ + ロール / 最終ログイン / 状態）
 *  - 招待中（pending）一覧（再送 / 取消）
 *  - 「招待する」ボタン → モーダル
 */
import { eq, and, desc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db/client';
import {
  organizations,
  memberships,
  users,
  groupMemberships,
  groups,
  invitations,
  authSessions,
} from '@/lib/db/schema';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { UserGroupIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { MembersClient } from './members-client';

export const metadata = { title: 'メンバー管理' };

const ORG_ROLE_LABEL: Record<string, string> = {
  owner: 'オーナー',
  admin: '管理者',
  member: 'メンバー',
};

const GROUP_ROLE_LABEL: Record<string, string> = {
  manager: 'マネージャ',
  member: 'メンバー',
};

function formatDateTime(d: Date | number | null | undefined): string {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d as number);
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt);
}

export default async function AdminMembersPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  const orgRows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, organizationSlug))
    .limit(1);
  const org = orgRows[0];
  if (!org) notFound();

  // メンバー一覧
  const memberRows = await db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      isActive: users.isActive,
      orgRole: memberships.role,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, org.id))
    .orderBy(memberships.createdAt);

  // group memberships
  const userIds = memberRows.map((m) => m.userId);
  const gmRows =
    userIds.length > 0
      ? await db
          .select({
            userId: groupMemberships.userId,
            groupName: groups.name,
            groupRole: groupMemberships.role,
          })
          .from(groupMemberships)
          .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
          .where(eq(groups.organizationId, org.id))
      : [];

  const gmMap = new Map<
    string,
    Array<{ groupName: string; groupRole: string }>
  >();
  for (const g of gmRows) {
    const arr = gmMap.get(g.userId) ?? [];
    arr.push({ groupName: g.groupName, groupRole: g.groupRole });
    gmMap.set(g.userId, arr);
  }

  // 最終ログイン（auth_sessions の updatedAt 最新）
  const sessionRows =
    userIds.length > 0
      ? await db
          .select({
            userId: authSessions.userId,
            updatedAt: authSessions.updatedAt,
          })
          .from(authSessions)
          .orderBy(desc(authSessions.updatedAt))
      : [];
  const lastLoginMap = new Map<string, Date>();
  for (const s of sessionRows) {
    if (!lastLoginMap.has(s.userId) && s.updatedAt) {
      lastLoginMap.set(s.userId, s.updatedAt as Date);
    }
  }

  // group 一覧（招待モーダル用）
  const groupOptions = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(eq(groups.organizationId, org.id))
    .orderBy(groups.displayOrder);

  // pending 招待
  const pendingInvitations = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, org.id),
        eq(invitations.status, 'pending'),
      ),
    )
    .orderBy(desc(invitations.createdAt));

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">メンバー管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            組織のメンバー一覧と招待を管理します。
          </p>
        </div>
        <MembersClient
          mode="invite"
          organizationId={org.id}
          groupOptions={groupOptions}
        />
      </header>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          <UserGroupIcon className="h-4 w-4" aria-hidden="true" />
          メンバー（{memberRows.length}）
        </h2>
        {memberRows.length === 0 ? (
          <EmptyState
            icon={UserGroupIcon}
            title="メンバーはまだいません"
            description="右上の「招待する」からメンバーを追加できます"
          />
        ) : (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-stone-100/40 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      名前 / メール
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      全体ロール
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      所属グループ
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      最終ログイン
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      状態
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {memberRows.map((m) => {
                    const groupsList = gmMap.get(m.userId) ?? [];
                    const lastLogin = lastLoginMap.get(m.userId) ?? null;
                    return (
                      <tr
                        key={m.membershipId}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="px-4 py-3 align-middle">
                          <p className="font-medium">
                            {m.name?.trim() || '—'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {m.email}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <span className="inline-flex items-center rounded-full bg-court-green/10 px-2 py-0.5 text-xs font-medium text-court-green">
                            {ORG_ROLE_LABEL[m.orgRole] ?? m.orgRole}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          {groupsList.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              なし
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {groupsList.map((g, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center rounded bg-stone-100 px-1.5 py-0.5 text-xs"
                                >
                                  {g.groupName}（
                                  {GROUP_ROLE_LABEL[g.groupRole] ?? g.groupRole}）
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-middle text-xs text-muted-foreground tabular">
                          {formatDateTime(lastLogin)}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          {m.isActive ? (
                            <span className="text-xs text-court-green">
                              アクティブ
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              無効
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-middle text-right">
                          <MembersClient
                            mode="member"
                            organizationId={org.id}
                            userId={m.userId}
                            currentRole={m.orgRole}
                            isActive={m.isActive}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          <EnvelopeIcon className="h-4 w-4" aria-hidden="true" />
          招待中（{pendingInvitations.length}）
        </h2>
        {pendingInvitations.length === 0 ? (
          <EmptyState
            icon={EnvelopeIcon}
            title="未受諾の招待はありません"
            description="新しい招待を送ると、ここに一覧されます"
          />
        ) : (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-stone-100/40 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      メールアドレス
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      ロール
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      送信日
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      期限
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvitations.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-4 py-3 align-middle font-medium">
                        {inv.email}
                      </td>
                      <td className="px-4 py-3 align-middle text-xs text-muted-foreground">
                        {ORG_ROLE_LABEL[inv.role] ?? inv.role}
                      </td>
                      <td className="px-4 py-3 align-middle text-xs text-muted-foreground tabular">
                        {formatDateTime(inv.createdAt)}
                      </td>
                      <td className="px-4 py-3 align-middle text-xs text-muted-foreground tabular">
                        {formatDateTime(inv.expiresAt)}
                      </td>
                      <td className="px-4 py-3 align-middle text-right">
                        <MembersClient
                          mode="invitation"
                          organizationId={org.id}
                          invitationId={inv.id}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
