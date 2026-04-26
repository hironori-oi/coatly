/**
 * Middleware ガード SQL コスト計測 (W3-A T-4 対応)
 *
 * 目的:
 *  - getMiddlewareSession (認証 cache hit/miss) は除外し、
 *    DB hit が必ず発生する getOrgRole / checkExpenseAccess の
 *    p50 / p95 を計測する。
 *  - 環境差を消すため `:memory:` libSQL に同形のスキーマ + 代表データを
 *    投入してから 1000 回ループする（warmup 100 回）。
 *  - 本番 Turso は edge → libsql primary の RTT で +30〜80 ms 程度
 *    乗ることを別途記録する（report 側）。
 *
 * 実行: pnpm tsx scripts/bench-middleware-guards.ts
 */
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq, and } from 'drizzle-orm';
import { ulid } from 'ulidx';
import * as schema from '../src/lib/db/schema';

const ITER = 1000;
const WARMUP = 100;

function pct(ns: number[], p: number): number {
  const sorted = [...ns].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((sorted.length - 1) * p),
  );
  return sorted[idx];
}

function fmtMs(ns: number): string {
  return (ns / 1_000_000).toFixed(3) + ' ms';
}

async function main() {
  // ─── setup ──────────────────────────────────────────────────────
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });

  await client.executeMultiple(`
    CREATE TABLE organizations (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      logo TEXT,
      metadata TEXT,
      fiscal_year_start_month INTEGER NOT NULL DEFAULT 4,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX idx_orgs_slug ON organizations(slug);
    CREATE TABLE groups (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX idx_groups_org ON groups(organization_id);
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      email_verified INTEGER NOT NULL DEFAULT 1,
      image TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      banned INTEGER NOT NULL DEFAULT 0,
      ban_reason TEXT,
      ban_expires INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE memberships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      role TEXT NOT NULL,
      home_group_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX idx_mem_org ON memberships(organization_id);
    CREATE INDEX idx_mem_user ON memberships(user_id);
    CREATE TABLE group_memberships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX idx_gm_user ON group_memberships(user_id);
    CREATE INDEX idx_gm_group ON group_memberships(group_id);
    CREATE TABLE expenses (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      date INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount_jpy INTEGER NOT NULL,
      has_receipt INTEGER NOT NULL DEFAULT 0,
      invoice_number TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      classification TEXT,
      approved_by TEXT,
      approved_at INTEGER,
      rejection_reason TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX idx_exp_org ON expenses(organization_id);
  `);

  // 代表データ: 5 組織 × 4 グループ × 50 user × 200 expense
  const orgIds: string[] = [];
  const userIds: string[] = [];
  const groupIds: string[] = [];
  const expenseIds: string[] = [];

  for (let o = 0; o < 5; o++) {
    const orgId = ulid();
    orgIds.push(orgId);
    await db.insert(schema.organizations).values({
      id: orgId,
      slug: `org-${o}`,
      kind: 'tennis_club',
      name: `Org ${o}`,
      fiscalYearStartMonth: 4,
    });
    for (let g = 0; g < 4; g++) {
      const gid = ulid();
      groupIds.push(gid);
      await db.insert(schema.groups).values({
        id: gid,
        organizationId: orgId,
        kind: 'prefecture',
        code: `g${g}`,
        name: `Group ${g}`,
      });
    }
  }

  for (let u = 0; u < 50; u++) {
    const uid = ulid();
    userIds.push(uid);
    await db.insert(schema.users).values({
      id: uid,
      email: `u${u}@bench.local`,
      name: `User ${u}`,
      isActive: true,
    });
    // 各 user は最初の org の最初の group に所属
    await db.insert(schema.memberships).values({
      id: ulid(),
      userId: uid,
      organizationId: orgIds[0],
      role: u === 0 ? 'owner' : 'member',
    });
    if (u !== 0) {
      await db.insert(schema.groupMemberships).values({
        id: ulid(),
        userId: uid,
        groupId: groupIds[0],
        role: 'member',
      });
    }
  }

  for (let e = 0; e < 200; e++) {
    const eid = ulid();
    expenseIds.push(eid);
    await db.insert(schema.expenses).values({
      id: eid,
      organizationId: orgIds[0],
      groupId: groupIds[0],
      userId: userIds[(e % (userIds.length - 1)) + 1],
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: `bench ${e}`,
      amountJpy: 1000,
      status: 'draft',
    });
  }

  // ─── benchmark fns（middleware-guards 本体の SQL を再現）───────────────
  async function getOrgRoleSql(userId: string, orgSlug: string) {
    return await db
      .select({
        orgId: schema.organizations.id,
        role: schema.memberships.role,
      })
      .from(schema.organizations)
      .leftJoin(
        schema.memberships,
        and(
          eq(schema.memberships.organizationId, schema.organizations.id),
          eq(schema.memberships.userId, userId),
        ),
      )
      .where(eq(schema.organizations.slug, orgSlug))
      .limit(1);
  }

  async function checkExpenseAccessSql(
    userId: string,
    orgSlug: string,
    expenseId: string,
  ) {
    const r1 = await db
      .select({
        orgId: schema.organizations.id,
        expenseUserId: schema.expenses.userId,
        expenseGroupId: schema.expenses.groupId,
        expenseOrgId: schema.expenses.organizationId,
        orgRole: schema.memberships.role,
      })
      .from(schema.organizations)
      .leftJoin(schema.expenses, eq(schema.expenses.id, expenseId))
      .leftJoin(
        schema.memberships,
        and(
          eq(schema.memberships.organizationId, schema.organizations.id),
          eq(schema.memberships.userId, userId),
        ),
      )
      .where(eq(schema.organizations.slug, orgSlug))
      .limit(1);

    if (!r1[0]?.expenseGroupId) return r1;

    // 2nd query (group_memberships) — non-admin path
    return await db
      .select({
        groupId: schema.groupMemberships.groupId,
        role: schema.groupMemberships.role,
      })
      .from(schema.groupMemberships)
      .where(
        and(
          eq(schema.groupMemberships.userId, userId),
          eq(schema.groupMemberships.groupId, r1[0].expenseGroupId),
        ),
      )
      .limit(1);
  }

  // ─── warmup ────────────────────────────────────────────────────
  for (let i = 0; i < WARMUP; i++) {
    await getOrgRoleSql(userIds[1], 'org-0');
    await checkExpenseAccessSql(userIds[1], 'org-0', expenseIds[0]);
  }

  // ─── measure: getOrgRole ──────────────────────────────────────
  const rOrg: number[] = [];
  for (let i = 0; i < ITER; i++) {
    const userId = userIds[(i % (userIds.length - 1)) + 1];
    const t = process.hrtime.bigint();
    await getOrgRoleSql(userId, 'org-0');
    rOrg.push(Number(process.hrtime.bigint() - t));
  }

  // ─── measure: checkExpenseAccess (member, not owner)──────────
  const rExp: number[] = [];
  for (let i = 0; i < ITER; i++) {
    const userId = userIds[(i % (userIds.length - 1)) + 1];
    const expId = expenseIds[i % expenseIds.length];
    const t = process.hrtime.bigint();
    await checkExpenseAccessSql(userId, 'org-0', expId);
    rExp.push(Number(process.hrtime.bigint() - t));
  }

  // ─── results ──────────────────────────────────────────────────
  console.log('=== Middleware Guard SQL Bench (libsql :memory:) ===');
  console.log(`iterations: ${ITER} (warmup ${WARMUP})`);
  console.log(`dataset:    5 orgs / 20 groups / 50 users / 200 expenses\n`);

  console.log('getOrgRole:');
  console.log(`  p50  = ${fmtMs(pct(rOrg, 0.5))}`);
  console.log(`  p95  = ${fmtMs(pct(rOrg, 0.95))}`);
  console.log(`  p99  = ${fmtMs(pct(rOrg, 0.99))}`);
  console.log(`  max  = ${fmtMs(Math.max(...rOrg))}`);
  console.log(
    `  mean = ${fmtMs(rOrg.reduce((a, b) => a + b, 0) / rOrg.length)}`,
  );

  console.log('\ncheckExpenseAccess (member, 2 queries: org+expense join, group_memberships):');
  console.log(`  p50  = ${fmtMs(pct(rExp, 0.5))}`);
  console.log(`  p95  = ${fmtMs(pct(rExp, 0.95))}`);
  console.log(`  p99  = ${fmtMs(pct(rExp, 0.99))}`);
  console.log(`  max  = ${fmtMs(Math.max(...rExp))}`);
  console.log(
    `  mean = ${fmtMs(rExp.reduce((a, b) => a + b, 0) / rExp.length)}`,
  );

  console.log(
    '\nNote: 本番 Turso は edge ↔ primary RTT で +30〜80 ms 程度上乗せ。',
  );
  console.log(
    '      cookieCache hit 時は middleware 全体で SQL を 0 回まで縮められる。',
  );

  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
