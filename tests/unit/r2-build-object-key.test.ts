import { describe, it, expect } from 'vitest';
import { buildObjectKey } from '@/lib/r2/signed-url';

describe('buildObjectKey', () => {
  it('builds {orgId}/{expenseId}/{ulid}.{ext} format', () => {
    expect(
      buildObjectKey('org_abc', 'exp_123', '01HXYZ', 'pdf'),
    ).toBe('org_abc/exp_123/01HXYZ.pdf');
  });

  it('lowercases extension', () => {
    expect(
      buildObjectKey('org', 'exp', 'ulid', 'PDF'),
    ).toBe('org/exp/ulid.pdf');
  });

  it('strips non-alphanumeric chars from extension', () => {
    expect(
      buildObjectKey('org', 'exp', 'ulid', 'jp.eg!'),
    ).toBe('org/exp/ulid.jpeg');
  });

  it('falls back to bin when extension becomes empty after sanitization', () => {
    expect(
      buildObjectKey('org', 'exp', 'ulid', '!!!'),
    ).toBe('org/exp/ulid.bin');
    expect(buildObjectKey('org', 'exp', 'ulid', '')).toBe('org/exp/ulid.bin');
  });

  it('preserves alphanumeric in extension as-is (lowercased)', () => {
    expect(
      buildObjectKey('org', 'exp', 'ulid', 'HEIC'),
    ).toBe('org/exp/ulid.heic');
  });
});
