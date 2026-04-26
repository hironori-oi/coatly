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
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient({
  url,
  authToken,
});

export const db = drizzle(client, { schema });

export type DB = typeof db;
