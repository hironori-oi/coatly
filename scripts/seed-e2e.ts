/**
 * E2E 用 追加 seed（W2-C / authorization.spec.ts の前提データ）
 *
 * 既存 seed.ts (W2-A) は org = coatly-tennis / owner@coatly.local を作成。
 * E2E 7 ケースのために以下を追加する:
 *
 *  org-A = coatly-tennis （既存）
 *    member: e2e-okayama@coatly.local        (member, group=岡山)
 *    member: e2e-hiroshima@coatly.local      (member, group=広島)
 *    expense: e2e-draft-okayama (status=draft, owner=okayama-member)
 *    expense: e2e-rejected-okayama (status=rejected, owner=okayama-member)
 *
 *  org-B = e2e-other-org (新規)
 *    owner: e2e-other-owner@coatly.local
 *    member: e2e-other-member@coatly.local
 *
 * 全テストはこの seed が事前に走った状態を前提とする (idempotent)。
 *
 * 実行: pnpm db:seed:e2e
 */
import { ulid } from 'ulidx';
import { eq, and } from 'drizzle-orm';
import { db } from '../src/lib/db/client';
import {
  organizations,
  groups,
  users,
  memberships,
  groupMemberships,
  expenses,
} from '../src/lib/db/schema';
import { auth } from '../src/lib/auth/better-auth';

const ORG_A_ID = 'org_tennis'; // 既存 (seed.ts)
const ORG_B_ID = 'org_e2e_other';
const ORG_B_SLUG = 'e2e-other-org';

const E2E_PASSWORD = 'Password1234!';

type SeedUser = {
  email: string;
  name: string;
};

const E2E_USERS: SeedUser[] = [
  { email: 'e2e-okayama@coatly.local', name: 'E2E Okayama Member' },
  { email: 'e2e-hiroshima@coatly.local', name: 'E2E Hiroshima Member' },
  { email: 'e2e-other-owner@coatly.local', name: 'E2E Other Owner' },
  { email: 'e2e-other-member@coatly.local', name: 'E2E Other Member' },
];

async function ensureUser(u: SeedUser): Promise<string> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, u.email))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const result = await auth.api.signUpEmail({
    body: { email: u.email, password: E2E_PASSWORD, name: u.name },
  });
  if (!result?.user?.id) throw new Error(`signUpEmail failed: ${u.email}`);
  return result.user.id;
}

async function ensureMembership(
  userId: string,
  orgId: string,
  role: 'owner' | 'admin' | 'member',
): Promise<void> {
  const existing = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, orgId),
      ),
    )
    .limit(1);
  if (existing[0]) return;
  await db.insert(memberships).values({
    id: ulid(),
    userId,
    organizationId: orgId,
    role,
  });
}

async function ensureGroupMembership(
  userId: string,
  groupId: string,
  role: 'manager' | 'member',
): Promise<void> {
  const existing = await db
    .select({ id: groupMemberships.id })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.userId, userId),
        eq(groupMemberships.groupId, groupId),
      ),
    )
    .limit(1);
  if (existing[0]) return;
  await db.insert(groupMemberships).values({
    id: ulid(),
    userId,
    groupId,
    role,
  });
}

async function main() {
  console.log('[seed-e2e] start');

  // 1. E2E ユーザー作成
  const userIds: Record<string, string> = {};
  for (const u of E2E_USERS) {
    userIds[u.email] = await ensureUser(u);
    console.log(`[seed-e2e] user ready: ${u.email} → ${userIds[u.email]}`);
  }

  // 2. org-A の member 紐付け（岡山・広島）
  await ensureMembership(userIds['e2e-okayama@coatly.local'], ORG_A_ID, 'member');
  await ensureMembership(userIds['e2e-hiroshima@coatly.local'], ORG_A_ID, 'member');

  // 3. org-A の group_memberships
  await ensureGroupMembership(
    userIds['e2e-okayama@coatly.local'],
    'grp_okayama',
    'member',
  );
  await ensureGroupMembership(
    userIds['e2e-hiroshima@coatly.local'],
    'grp_hiroshima',
    'member',
  );

  // 4. org-B 作成
  await db
    .insert(organizations)
    .values({
      id: ORG_B_ID,
      slug: ORG_B_SLUG,
      kind: 'community',
      name: 'E2E 他組織',
      fiscalYearStartMonth: 4,
    })
    .onConflictDoNothing();

  // org-B の owner / member 紐付け
  await ensureMembership(
    userIds['e2e-other-owner@coatly.local'],
    ORG_B_ID,
    'owner',
  );
  await ensureMembership(
    userIds['e2e-other-member@coatly.local'],
    ORG_B_ID,
    'member',
  );

  // 5. expense fixtures (org-A 内の draft / rejected)
  const okayamaUserId = userIds['e2e-okayama@coatly.local'];

  // draft (okayama-member 自身の)
  const existingDraft = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.id, 'exp_e2e_draft_oka'))
    .limit(1);
  if (!existingDraft[0]) {
    await db.insert(expenses).values({
      id: 'exp_e2e_draft_oka',
      organizationId: ORG_A_ID,
      groupId: 'grp_okayama',
      userId: okayamaUserId,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'E2E 用 draft 申請',
      amountJpy: 3500,
      hasReceipt: false,
      status: 'draft',
    });
  }

  // rejected (okayama-member の)
  const existingRej = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.id, 'exp_e2e_rej_oka'))
    .limit(1);
  if (!existingRej[0]) {
    await db.insert(expenses).values({
      id: 'exp_e2e_rej_oka',
      organizationId: ORG_A_ID,
      groupId: 'grp_okayama',
      userId: okayamaUserId,
      fiscalYear: 2026,
      date: new Date('2026-04-12'),
      description: 'E2E 用 rejected 申請',
      amountJpy: 4200,
      hasReceipt: false,
      status: 'rejected',
      rejectionReason: 'テスト用差戻',
    });
  }

  console.log(
    '[seed-e2e] done: 4 e2e users / 1 extra org / 2 fixture expenses',
  );
  console.log(`[seed-e2e] login password (all e2e users): ${E2E_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[seed-e2e] failed', e);
    process.exit(1);
  });
