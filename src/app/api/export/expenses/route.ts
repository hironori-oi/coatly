/**
 * /api/export/expenses?fy=YYYY[&organizationId=...]
 *
 * 認可: requireOrganizationRole(orgId, ['owner', 'admin'])
 * 形式: CSV (UTF-8 BOM 付、Excel 互換)
 *
 * 列: id, date, description, group, classification, amount_jpy, status, applicant_email
 */
import { NextResponse, type NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  expenses,
  groups as groupsTable,
  users,
  memberships,
  organizations,
} from '@/lib/db/schema';
import { requireOrganizationRole } from '@/lib/auth/guards';
import { AuthError } from '@/lib/errors';

const STATUS_LABEL: Record<string, string> = {
  draft: '下書き',
  submitted: '申請中',
  approved: '承認済み',
  rejected: '差戻',
  withdrawn: '取下げ',
  charged_to_group: '部内計上',
  charged_to_organization: '組織計上',
};

const CLASSIFICATION_LABEL: Record<string, string> = {
  group_funded: 'グループ予算',
  organization_funded: '組織予算',
  personal: '自己負担',
};

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const fyStr = sp.get('fy');
    const organizationIdParam = sp.get('organizationId');

    // organizationId は明示指定 or membership から推定
    let organizationId = organizationIdParam;
    if (!organizationId) {
      // 1 つしか所属していない想定の簡易対応 — UI からは fy のみで叩かれる
      // 将来的に slug 経由 path に切替予定
      const orgRows = await db.select().from(organizations).limit(2);
      if (orgRows.length === 1) {
        organizationId = orgRows[0].id;
      }
    }
    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId is required' },
        { status: 400 },
      );
    }

    const ctx = await requireOrganizationRole(organizationId, [
      'owner',
      'admin',
    ]);

    const fiscalYear = fyStr ? Number.parseInt(fyStr, 10) : null;
    if (fiscalYear !== null && !Number.isInteger(fiscalYear)) {
      return NextResponse.json({ error: 'invalid fy' }, { status: 400 });
    }

    const where = fiscalYear
      ? and(
          eq(expenses.organizationId, ctx.organizationId),
          eq(expenses.fiscalYear, fiscalYear),
        )
      : eq(expenses.organizationId, ctx.organizationId);

    const rows = await db
      .select({
        id: expenses.id,
        date: expenses.date,
        description: expenses.description,
        groupName: groupsTable.name,
        classification: expenses.classification,
        amountJpy: expenses.amountJpy,
        status: expenses.status,
        userEmail: users.email,
        userName: users.name,
      })
      .from(expenses)
      .innerJoin(groupsTable, eq(groupsTable.id, expenses.groupId))
      .innerJoin(users, eq(users.id, expenses.userId))
      .innerJoin(
        memberships,
        and(
          eq(memberships.userId, users.id),
          eq(memberships.organizationId, ctx.organizationId),
        ),
      )
      .where(where);

    const header = [
      'ID',
      '日付',
      '内容',
      'グループ',
      '区分',
      '金額(JPY)',
      'ステータス',
      '申請者メール',
      '申請者名',
    ];

    const fmtDate = (d: unknown) => {
      const date =
        d instanceof Date ? d : typeof d === 'number' ? new Date(d) : null;
      if (!date) return '';
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const lines = [
      header.map(csvEscape).join(','),
      ...rows.map((r) =>
        [
          r.id,
          fmtDate(r.date),
          r.description,
          r.groupName,
          r.classification
            ? CLASSIFICATION_LABEL[r.classification] ?? r.classification
            : '',
          r.amountJpy,
          STATUS_LABEL[r.status] ?? r.status,
          r.userEmail,
          r.userName ?? '',
        ]
          .map(csvEscape)
          .join(','),
      ),
    ];

    // BOM + CRLF for Excel compatibility
    const body = '\uFEFF' + lines.join('\r\n');
    const filename = `expenses_fy${fiscalYear ?? 'all'}_${Date.now()}.csv`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json(
        { error: e.message },
        { status: e.status },
      );
    }
    console.error('[/api/export/expenses] internal', e);
    return NextResponse.json(
      { error: 'internal_error' },
      { status: 500 },
    );
  }
}
