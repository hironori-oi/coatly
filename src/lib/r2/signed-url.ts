/**
 * R2 presigned URL 発行ヘルパ（dev-technical-spec-v2.md §5.3）
 *
 * - getUploadUrl: PUT 用署名 URL（TTL=300s = 5 分）
 * - getViewUrl:   GET 用署名 URL（TTL=60s = 1 分）
 *
 * 呼び出し側（Server Action）で必ず requireExpenseAccess() を通すこと。
 * 直接 export せず、attachment.ts Server Action 経由で呼び出す前提。
 */
import {
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getR2Client, getR2Bucket } from './client';

export const UPLOAD_URL_TTL_SEC = 300; // 5 分
export const VIEW_URL_TTL_SEC = 60; // 1 分

/**
 * 領収証アップロード用 PUT 署名 URL を発行する。
 */
export async function getUploadUrl(
  key: string,
  contentType: string,
  contentLength: number,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  return getSignedUrl(getR2Client(), cmd, {
    expiresIn: UPLOAD_URL_TTL_SEC,
  });
}

/**
 * W2-B 別名: 仕様書 §6.2 の命名（getSignedUploadUrl）に合わせたエイリアス。
 *
 * - contentLength を省略した場合は ContentLength なしで署名（クライアントが
 *   PUT 時に Content-Length ヘッダで伝える）。R2 は Content-Length を必須と
 *   しないため、TS 側でも optional にしている。
 */
export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  contentLength?: number,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
    ContentType: contentType,
    ...(contentLength ? { ContentLength: contentLength } : {}),
  });
  return getSignedUrl(getR2Client(), cmd, {
    expiresIn: UPLOAD_URL_TTL_SEC,
  });
}

/**
 * 領収証閲覧用 GET 署名 URL を発行する。
 */
export async function getViewUrl(key: string): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
  });
  return getSignedUrl(getR2Client(), cmd, {
    expiresIn: VIEW_URL_TTL_SEC,
  });
}

/**
 * W2-B 別名: 仕様書 §6.2 の命名（getSignedDownloadUrl）に合わせたエイリアス。
 * expense detail page で領収書プレビューに使用する。
 */
export async function getSignedDownloadUrl(key: string): Promise<string> {
  return getViewUrl(key);
}

/**
 * オブジェクトキー命名規則: `{orgId}/{expenseId}/{ulid}.{ext}`
 *
 * - org / expense でディレクトリ階層化することで、退会時の一括削除が容易
 * - ULID で衝突回避 + 時系列ソート可能
 */
export function buildObjectKey(
  organizationId: string,
  expenseId: string,
  ulid: string,
  extension: string,
): string {
  const safeExt = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  return `${organizationId}/${expenseId}/${ulid}.${safeExt}`;
}
