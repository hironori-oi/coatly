/**
 * Health check endpoint
 *
 * - Vercel デプロイ後の死活監視（外部 monitoring / uptime check）用
 * - DB に対して軽量 ping (`SELECT 1`) を実行
 * - 認証不要（公開）
 *
 * レスポンス:
 *   200 { ok: true,  timestamp, version, db: 'up' }
 *   503 { ok: false, timestamp, version, db: 'down', error }
 */
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

// Vercel ビルド時の static 化を回避
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev';

export async function GET() {
  const timestamp = new Date().toISOString();
  try {
    // 軽量 ping。libSQL は SELECT 1 が低コスト
    await db.run(sql`select 1`);
    return NextResponse.json(
      {
        ok: true,
        timestamp,
        version: VERSION,
        db: 'up',
      },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        timestamp,
        version: VERSION,
        db: 'down',
        error: e instanceof Error ? e.message : 'unknown_error',
      },
      { status: 503 },
    );
  }
}
