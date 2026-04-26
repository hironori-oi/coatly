/**
 * Cloudflare R2 クライアント
 *
 * S3 互換 API を `@aws-sdk/client-s3` で叩く。
 * - region は 'auto' 固定（R2 の規約）
 * - endpoint は account-id 付きの cloudflarestorage.com
 *
 * セキュリティ要件（security-baseline §7）:
 * - bucket は private、署名 URL でのみアクセス
 * - PUT 署名 TTL = 300s、GET 署名 TTL = 60s
 */
import { S3Client } from '@aws-sdk/client-s3';

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return v;
}

let _client: S3Client | null = null;

/**
 * Lazy 初期化。テスト時に env 未設定でも import できるよう関数化。
 */
export function getR2Client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${envOrThrow('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: envOrThrow('R2_ACCESS_KEY_ID'),
      secretAccessKey: envOrThrow('R2_SECRET_ACCESS_KEY'),
    },
  });
  return _client;
}

export function getR2Bucket(): string {
  return envOrThrow('R2_BUCKET_NAME');
}
