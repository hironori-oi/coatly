/**
 * Upload magic-byte detection
 *
 * 役割: クライアントから送られた contentType だけを信用せず、ファイル先頭の
 * バイト列で MIME を判定する。signed URL 発行 API（/api/upload-url）で
 * `claimedContentType` と `detectMime(headBytes)` の結果を突き合わせて
 * 不一致なら 400 を返す。
 *
 * 受け入れ:
 *  - JPEG: FF D8 FF
 *  - PNG : 89 50 4E 47 0D 0A 1A 0A（PNG signature 8 bytes）
 *  - PDF : 25 50 44 46（"%PDF"）
 *
 * 仕様:
 *  - 16 bytes 以上を受け取る前提（4 bytes 以下しか無い場合も解析可能なように
 *    最小マッチ長で判定する）。
 *  - 拡張: WebP / HEIC は当面 contentType allowlist にあるが magic-byte 判定は
 *    しない（FOURCC 系で判定が複雑、Phase 2 対応）。
 */

export type DetectedMime = 'jpeg' | 'png' | 'pdf' | null;

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIG = [0xff, 0xd8, 0xff];
const PDF_SIG = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

function startsWith(buf: Uint8Array, sig: number[]): boolean {
  if (buf.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buf[i] !== sig[i]) return false;
  }
  return true;
}

/**
 * バッファ先頭から MIME を判定する。判定不能なら null。
 *
 * @param buf ファイル先頭の生バイト列（16 bytes 以上推奨、最小 4 bytes）。
 *            Uint8Array / Buffer / number[] のいずれでも受け取れる。
 */
export function detectMime(
  buf: Uint8Array | Buffer | ArrayBuffer | number[],
): DetectedMime {
  let view: Uint8Array;
  if (buf instanceof Uint8Array) {
    view = buf;
  } else if (Array.isArray(buf)) {
    view = Uint8Array.from(buf);
  } else if (buf instanceof ArrayBuffer) {
    view = new Uint8Array(buf);
  } else {
    // Buffer は Uint8Array サブクラスだが TS が判別しないので fallthrough しない
    view = new Uint8Array(buf);
  }

  if (startsWith(view, PNG_SIG)) return 'png';
  if (startsWith(view, JPEG_SIG)) return 'jpeg';
  if (startsWith(view, PDF_SIG)) return 'pdf';
  return null;
}

/**
 * contentType allowlist と magic-byte 判定を突き合わせる。
 *
 * - mime が null（不明）→ false
 * - claimedContentType が allowlist 外 → false
 * - 不一致（jpeg を pdf と申告等）→ false
 *
 * @returns 一致なら true（upload を許可）
 */
export function isContentTypeMatching(
  claimedContentType: string,
  detected: DetectedMime,
): boolean {
  if (!detected) return false;
  switch (detected) {
    case 'jpeg':
      return claimedContentType === 'image/jpeg';
    case 'png':
      return claimedContentType === 'image/png';
    case 'pdf':
      return claimedContentType === 'application/pdf';
  }
}
