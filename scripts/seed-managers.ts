/**
 * 5 県 manager seed（W3 拡張）
 *
 * 中国地方 5 県それぞれに manager ロールのユーザーを 1 名ずつ作成する。
 * 既存の seed.ts / seed-e2e.ts は触らずに別個のテストアカウント体系を構築。
 *
 * 作成内容:
 *  - okayama-mgr@coatly.local    / Password1234!  (group=岡山, manager)
 *  - hiroshima-mgr@coatly.local  / Password1234!  (group=広島, manager)
 *  - yamaguchi-mgr@coatly.local  / Password1234!  (group=山口, manager)
 *  - tottori-mgr@coatly.local    / Password1234!  (group=鳥取, manager)
 *  - shimane-mgr@coatly.local    / Password1234!  (group=島根, manager)
 *
 * 各 manager:
 *  - auth.api.signUpEmail で hash 込みで作成
 *  - memberships に role='member' を追加（org-level）
 *  - group_memberships に role='manager' を追加（group-level）
 *
 * 実行: pnpm db:seed:managers
 *
 * 前提: pnpm db:seed が先に実行されており org_tennis + grp_okayama..shimane が存在すること。
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
} from '../src/lib/db/schema';
import { auth } from '../src/lib/auth/better-auth';

const ORG_ID = 'org_tennis';
const PASSWORD = 'Password1234!';

const MANAGERS = [
  {
    email: 'okayama-mgr@coatly.local',
    name: '岡山マネージャー',
    groupId: 'grp_okayama',
    groupName: '岡山',
  },
  {
    email: 'hiroshima-mgr@coatly.local',
    name: '広島マネージャー',
    groupId: 'grp_hiroshima',
    groupName: '広島',
  },
  {
    email: 'yamaguchi-mgr@coatly.local',
    name: '山口マネージャー',
    groupId: 'grp_yamaguchi',
    groupName: '山口',
  },
  {
    email: 'tottori-mgr@coatly.local',
    name: '鳥取マネージャー',
    groupId: 'grp_tottori',
    groupName: '鳥取',
  },
  {
    email: 'shimane-mgr@coatly.local',
    name: '島根マネージャー',
    groupId: 'grp_shimane',
    groupName: '島根',
  },
] as const;

async function ensureUser(input: {
  email: string;
  name: string;
}): Promise<string> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const result = await auth.api.signUpEmail({
    body: {
      email: input.email,
      password: PASSWORD,
      name: input.name,
    },
  });
  if (!result?.user?.id) {
    throw new Error(`signUpEmail returned no user for ${input.email}`);
  }
  return result.user.id;
}

async function ensureMembership(input: {
  userId: string;
  organizationId: string;
  role: 'owner' | 'admin' | 'member';
}): Promise<void> {
  const existing = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, input.userId),
        eq(memberships.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (existing[0]) return;
  await db.insert(memberships).values({
    id: ulid(),
    userId: input.userId,
    organizationId: input.organizationId,
    role: input.role,
  });
}

async function ensureGroupMembership(input: {
  userId: string;
  groupId: string;
  role: 'manager' | 'member';
}): Promise<void> {
  const existing = await db
    .select({ id: groupMemberships.id })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.userId, input.userId),
        eq(groupMemberships.groupId, input.groupId),
      ),
    )
    .limit(1);
  if (existing[0]) return;
  await db.insert(groupMemberships).values({
    id: ulid(),
    userId: input.userId,
    groupId: input.groupId,
    role: input.role,
  });
}

async function main() {
  console.log('[seed-managers] start');

  // 前提チェック: org / 5 county groups が存在するか
  const org = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, ORG_ID))
    .limit(1);
  if (!org[0]) {
    throw new Error(
      `[seed-managers] organization '${ORG_ID}' not found. Run 'pnpm db:seed' first.`,
    );
  }

  for (const mgr of MANAGERS) {
    const groupRow = await db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.id, mgr.groupId))
      .limit(1);
    if (!groupRow[0]) {
      throw new Error(
        `[seed-managers] group '${mgr.groupId}' not found. Run 'pnpm db:seed' first.`,
      );
    }

    const userId = await ensureUser({ email: mgr.email, name: mgr.name });
    await ensureMembership({
      userId,
      organizationId: ORG_ID,
      role: 'member',
    });
    await ensureGroupMembership({
      userId,
      groupId: mgr.groupId,
      role: 'manager',
    });

    console.log(
      `[seed-managers] ${mgr.groupName} manager ready: ${mgr.email}`,
    );
  }

  console.log(
    `[seed-managers] done: ${MANAGERS.length} managers (password: ${PASSWORD})`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[seed-managers] failed', e);
    process.exit(1);
  });
