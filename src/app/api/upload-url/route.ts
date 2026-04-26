/**
 * R2 presigned URL 発行 API（W2-B 本実装）
 *
 * リクエスト: POST /api/upload-url
 *   body: { filename, contentType, size }
 * レスポンス: { uploadUrl, key, expiresAt }
 *
 * 認可:
 *  - requireUser() でログイン確認（誰でもアップロード可、key に userId を含める）
 *  - 実際の attachment 紐付けは createExpense / updateExpense で組織チェック付きで行う
 *  - したがって任意の attachment を他組織の expense に紐付ける攻撃は Server Action 側で防御
 *
 * 制限:
 *  - size 上限 10MB
 *  - contentType allowlist: image/jpeg, image/png, image/webp, image/heic, application/pdf
 *  - filename にパス文字 (/ \) 不可
 *
 * key 命名: receipts/{userId}/{ulid}.{ext}
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ulid } from 'ulidx';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/guards';
import {
  getSignedUploadUrl,
  UPLOAD_URL_TTL_SEC,
} from '@/lib/r2/signed-url';
import { AuthError } from '@/lib/errors';
import { detectMime, isContentTypeMatching } from '@/lib/upload/magic-byte';

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;

const MAX_BYTES = 10 * 1024 * 1024;

const requestSchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^\\/]+$/, 'パス文字は使えません'),
  contentType: z.enum(ALLOWED_TYPES),
  size: z.number().int().positive().max(MAX_BYTES, '10MB を超えています'),
  /**
   * Magic-byte 判定用のファイル先頭バイト列（base64 エンコード）。
   * - 16 bytes 程度を期待。client は File.slice(0,16) を base64 化して送る。
   * - 受け取った場合、JPEG/PNG/PDF の signature と contentType を突き合わせる。
   * - WebP / HEIC は magic-byte 判定対象外（Phase 2）のため省略可能。
   * - undefined のとき（client が古い / 判定不能 type）は legacy 互換でスキップ。
   */
  headBase64: z.string().min(4).max(64).optional(),
});

const MAGIC_BYTE_REQUIRED: Set<string> = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
]);

const EXT_MAP: Record<(typeof ALLOWED_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

export async function POST(req: NextRequest) {
  try {
    // CSRF: Route Handler は同一 origin チェックを自前で行う
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    if (!origin || !host) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    if (new URL(origin).host !== host) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const user = await requireUser();

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: 'invalid_json' },
        { status: 400 },
      );
    }
    const data = requestSchema.parse(body);

    // Magic-byte 検査: claim と head bytes で MIME 一致確認。
    // JPEG/PNG/PDF は必須、WebP/HEIC は当面 skip（Phase 2 で対応）。
    if (MAGIC_BYTE_REQUIRED.has(data.contentType)) {
      if (!data.headBase64) {
        return NextResponse.json(
          {
            error: 'magic_byte_required',
            message:
              'ファイル先頭バイト列 (headBase64) が必要です。client を更新してください。',
          },
          { status: 400 },
        );
      }
      let head: Uint8Array;
      try {
        head = Uint8Array.from(Buffer.from(data.headBase64, 'base64'));
      } catch {
        return NextResponse.json(
          { error: 'invalid_head_base64' },
          { status: 400 },
        );
      }
      const detected = detectMime(head);
      if (!isContentTypeMatching(data.contentType, detected)) {
        return NextResponse.json(
          {
            error: 'content_type_mismatch',
            message: `申告された contentType (${data.contentType}) と先頭バイト列 (${detected ?? 'unknown'}) が一致しません。`,
          },
          { status: 400 },
        );
      }
    }

    // 拡張子は contentType から決定（filename からの拡張子は信用しない）
    const ext = EXT_MAP[data.contentType];
    const key = `receipts/${user.id}/${ulid()}.${ext}`;

    let uploadUrl: string;
    try {
      uploadUrl = await getSignedUploadUrl(
        key,
        data.contentType,
        data.size,
      );
    } catch (envErr) {
      console.error('[upload-url] R2 env not ready', envErr);
      return NextResponse.json(
        {
          error: 'r2_not_configured',
          message:
            'ストレージ設定が未完了です。管理者に R2 環境変数の確認を依頼してください。',
        },
        { status: 503 },
      );
    }

    const expiresAt = new Date(
      Date.now() + UPLOAD_URL_TTL_SEC * 1000,
    ).toISOString();

    return NextResponse.json({
      uploadUrl,
      key,
      expiresAt,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'invalid_request', issues: e.issues },
        { status: 400 },
      );
    }
    console.error('[upload-url] failed', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
