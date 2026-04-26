/**
 * FY2026 seed（DEC-009 数値）
 *
 * - 組織: テニス部（kind=tennis_club, slug=coatly-tennis）
 * - グループ: 中国地方 5 県（岡山・広島・山口・鳥取・島根）
 * - 予算: 全体 ¥300,000 + 各県 ¥100,000 × 5 = ¥800,000
 * - admin user: owner@coatly.local / Password1234!（Better Auth signUpEmail で作成）
 * - membership: owner ロールで上記 user を組織に紐付け
 *
 * 実行: pnpm db:seed
 */
import { ulid } from 'ulidx';
import { eq } from 'drizzle-orm';
import { db } from '../src/lib/db/client';
import {
  organizations,
  groups,
  budgets,
  users,
  memberships,
} from '../src/lib/db/schema';
import { auth } from '../src/lib/auth/better-auth';

const ORG_ID = 'org_tennis';
const ADMIN_EMAIL = 'owner@coatly.local';
const ADMIN_PASSWORD = 'Password1234!';
const ADMIN_NAME = 'Coatly Owner';

const PREFECTURES = [
  { code: 'okayama', name: '岡山' },
  { code: 'hiroshima', name: '広島' },
  { code: 'yamaguchi', name: '山口' },
  { code: 'tottori', name: '鳥取' },
  { code: 'shimane', name: '島根' },
] as const;

async function ensureAdminUser(): Promise<string> {
  // Better Auth 経由で作成（password hash + auth_accounts 同時生成）
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1);

  if (existing[0]) {
    console.log(`[seed] admin user exists: ${ADMIN_EMAIL}`);
    return existing[0].id;
  }

  try {
    const result = await auth.api.signUpEmail({
      body: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        name: ADMIN_NAME,
      },
    });
    if (!result?.user?.id) {
      throw new Error('signUpEmail returned no user');
    }
    console.log(`[seed] admin user created: ${ADMIN_EMAIL}`);
    return result.user.id;
  } catch (e) {
    console.error('[seed] failed to create admin user via Better Auth', e);
    throw e;
  }
}

async function main() {
  console.log('[seed] start');

  // 1. admin user (Better Auth で hash 含めて作成)
  const adminId = await ensureAdminUser();

  // 2. テニス部組織
  await db
    .insert(organizations)
    .values({
      id: ORG_ID,
      slug: 'coatly-tennis',
      kind: 'tennis_club',
      name: 'テニス部',
      fiscalYearStartMonth: 4,
    })
    .onConflictDoNothing();

  // 3. admin の membership（owner ロール）
  await db
    .insert(memberships)
    .values({
      id: ulid(),
      userId: adminId,
      organizationId: ORG_ID,
      role: 'owner',
    })
    .onConflictDoNothing();

  // 4. 中国地方 5 県
  for (const [i, p] of PREFECTURES.entries()) {
    await db
      .insert(groups)
      .values({
        id: `grp_${p.code}`,
        organizationId: ORG_ID,
        kind: 'prefecture',
        code: p.code,
        name: p.name,
        displayOrder: i + 1,
      })
      .onConflictDoNothing();
  }

  // 5. FY2026 予算: 全体 ¥300K + 各県 ¥100K × 5 = ¥800K
  const fiscalYear = 2026;

  await db
    .insert(budgets)
    .values({
      id: ulid(),
      organizationId: ORG_ID,
      groupId: null,
      fiscalYear,
      amountJpy: 300_000,
      createdBy: adminId,
      note: 'FY2026 全体予算（DEC-009）',
    })
    .onConflictDoNothing();

  for (const p of PREFECTURES) {
    await db
      .insert(budgets)
      .values({
        id: ulid(),
        organizationId: ORG_ID,
        groupId: `grp_${p.code}`,
        fiscalYear,
        amountJpy: 100_000,
        createdBy: adminId,
        note: `FY2026 ${p.name}県予算（DEC-009）`,
      })
      .onConflictDoNothing();
  }

  console.log(
    '[seed] done: 1 org / 5 groups / 6 budgets (¥800,000) / 1 owner user',
  );
  console.log(`[seed] login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[seed] failed', e);
    process.exit(1);
  });
