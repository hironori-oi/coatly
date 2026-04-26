import type { Config } from 'drizzle-kit';

/**
 * drizzle-kit 設定
 *
 * - 本番 / Turso クラウド: TURSO_DATABASE_URL = libsql://xxx.turso.io
 *   → dialect: 'turso' + authToken 必須（drizzle-kit 0.31 の仕様）
 *
 * - ローカル / CI / E2E:    TURSO_DATABASE_URL = file:./local.db | file:./test.db
 *   → dialect: 'sqlite' に切替（drizzle-kit 0.31 では turso dialect は
 *     authToken 必須バリデーションが入るため、file: URL とは噛み合わない）
 *
 * `pnpm db:migrate` を CI / ローカルで authToken なしで叩けるようにするための分岐。
 */
const url = process.env.TURSO_DATABASE_URL ?? 'file:./local.db';
const isLocalFile = url.startsWith('file:');

const config: Config = isLocalFile
  ? {
      schema: './src/lib/db/schema.ts',
      out: './drizzle',
      dialect: 'sqlite',
      dbCredentials: { url },
      verbose: true,
      strict: true,
    }
  : {
      schema: './src/lib/db/schema.ts',
      out: './drizzle',
      dialect: 'turso',
      dbCredentials: {
        url,
        authToken: process.env.TURSO_AUTH_TOKEN ?? '',
      },
      verbose: true,
      strict: true,
    };

export default config;
