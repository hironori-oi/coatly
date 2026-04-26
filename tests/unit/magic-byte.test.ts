/**
 * magic-byte detection unit test
 *
 * 検証観点:
 *  - JPEG / PNG / PDF の signature を正しく判定する
 *  - 不正バイト列 → null
 *  - isContentTypeMatching: claim と detected が一致しない場合 false
 *  - 16 bytes 未満（4 bytes のみ）でも判定できる
 *  - Buffer / Uint8Array / number[] のどれでも受け付ける
 */
import { describe, it, expect } from 'vitest';
import { detectMime, isContentTypeMatching } from '@/lib/upload/magic-byte';

describe('detectMime', () => {
  it('detects JPEG (FF D8 FF ...)', () => {
    const buf = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x48,
    ]);
    expect(detectMime(buf)).toBe('jpeg');
  });

  it('detects PNG (89 50 4E 47 0D 0A 1A 0A ...)', () => {
    const buf = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52,
    ]);
    expect(detectMime(buf)).toBe('png');
  });

  it('detects PDF (25 50 44 46 ...)', () => {
    const buf = Uint8Array.from([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xb5, 0xb5,
      0xb5, 0xb5, 0x0a, 0x31,
    ]);
    expect(detectMime(buf)).toBe('pdf');
  });

  it('returns null for an unrecognized byte sequence', () => {
    const buf = Uint8Array.from([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
      0x0c, 0x0d, 0x0e, 0x0f,
    ]);
    expect(detectMime(buf)).toBeNull();
  });

  it('returns null when buffer is too short to match any signature', () => {
    expect(detectMime(Uint8Array.from([0x89]))).toBeNull();
    expect(detectMime(Uint8Array.from([0xff, 0xd8]))).toBeNull(); // 2 bytes は JPEG にも届かない
  });

  it('still works on minimal-length input that does match (4 bytes)', () => {
    expect(detectMime(Uint8Array.from([0x25, 0x50, 0x44, 0x46]))).toBe('pdf');
  });

  it('accepts Buffer / number[] / ArrayBuffer inputs', () => {
    const arr = [0xff, 0xd8, 0xff];
    expect(detectMime(arr)).toBe('jpeg');
    expect(detectMime(Buffer.from(arr))).toBe('jpeg');
    expect(detectMime(new Uint8Array(arr).buffer)).toBe('jpeg');
  });
});

describe('isContentTypeMatching', () => {
  it('returns true for matching claim + detected', () => {
    expect(isContentTypeMatching('image/jpeg', 'jpeg')).toBe(true);
    expect(isContentTypeMatching('image/png', 'png')).toBe(true);
    expect(isContentTypeMatching('application/pdf', 'pdf')).toBe(true);
  });

  it('returns false for mismatched claim + detected', () => {
    expect(isContentTypeMatching('image/jpeg', 'pdf')).toBe(false);
    expect(isContentTypeMatching('image/png', 'jpeg')).toBe(false);
    expect(isContentTypeMatching('application/pdf', 'png')).toBe(false);
  });

  it('returns false when detected is null', () => {
    expect(isContentTypeMatching('image/jpeg', null)).toBe(false);
  });
});
