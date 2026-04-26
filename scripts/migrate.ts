/**
 * カスタム migrator（drizzle-kit migrate を経由しない）
 *
 * 理由（DEC-035）:
 * - drizzle-kit 0.31 の `dialect: 'turso'` は authToken を必須バリデーション
 * - drizzle-kit 0.31 の `dialect: 'sqlite'` (driver 未指定) は内部で
 *   better-sqlite3 を要求し、Linux CI では native binary 未インストールで
 *   exit 1（しかもスピナー出力でエラーが見えない）
 * - 本ファイルは drizzle-orm の libsql migrator を直接呼ぶため、libsql client が
 *   `file:` と `libsql://` を透過的に処理してくれて、authToken 必須も回避できる
 *
 * 用途:
 * - CI: env で TURSO_DATABASE_URL=file:./test.db を渡して呼ぶ（authToken 不要）
 * - 本番: env で TURSO_DATABASE_URL=libsql://xxx.turso.io + TURSO_AUTH_TOKEN を渡す
 * - ローカル: .env.local を自動で読み込む（存在すれば）
 *
 * 注意: tsx は CJS で実行するため top-level await は使えない → async IIFE で包む。
 */
import { existsSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

async function main() {
  // .env.local が存在すれば読み込む（ローカル開発用）。CI / 本番では env が直接
  // export されているため不在で OK。Node.js 22+ の `process.loadEnvFile` を使用。
  if (existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  }

  const url = process.env.TURSO_DATABASE_URL ?? 'file:./local.db';
  const isLocalFile = url.startsWith('file:');
  // file: URL は authToken 不要。空文字列を渡すと libsql の一部経路で
  // 余計なエラーが出るため、明示的に undefined に。
  const authToken = isLocalFile ? undefined : process.env.TURSO_AUTH_TOKEN;

  console.log(`[migrate] target: ${url}`);

  const client = createClient({ url, authToken });
  const db = drizzle(client);

  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('[migrate] migrations applied successfully');
  } finally {
    client.close();
  }
}

main().catch((e) => {
  console.error('[migrate] failed:');
  console.error(e);
  process.exit(1);
});
