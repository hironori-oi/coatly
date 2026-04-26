/**
 * Turso (libSQL) クライアント
 *
 * - 本番: TURSO_DATABASE_URL = libsql://xxx.turso.io
 * - ローカル: TURSO_DATABASE_URL = file:./local.db（不要なら未設定でも可）
 */
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

const url = process.env.TURSO_DATABASE_URL ?? 'file:./local.db';
// file: URL（ローカル / CI / E2E）では authToken は無意味なので渡さない。
// libsql クライアントは authToken: '' を渡すと一部のリモート挙動でエラーになるため、
// 明示的に未設定状態を保つ。
const isLocalFile = url.startsWith('file:');
const authToken = isLocalFile ? undefined : process.env.TURSO_AUTH_TOKEN;

const client = createClient({
  url,
  authToken,
});

export const db = drizzle(client, { schema });

export type DB = typeof db;
