import { describe, it, expect } from 'vitest';
import { formatJpy, formatJpyPlain } from '@/lib/utils/format-jpy';

describe('formatJpy', () => {
  it('formats positive amount as Japanese currency', () => {
    expect(formatJpy(1234567)).toBe('￥1,234,567');
  });

  it('formats zero', () => {
    expect(formatJpy(0)).toBe('￥0');
  });

  it('formats negative amount', () => {
    expect(formatJpy(-500)).toBe('-￥500');
  });

  it('truncates non-integer to integer (no decimals)', () => {
    expect(formatJpy(123.99)).toBe('￥123');
  });

  it('returns ¥0 for non-finite input', () => {
    expect(formatJpy(NaN)).toBe('¥0');
    expect(formatJpy(Infinity)).toBe('¥0');
  });
});

describe('formatJpyPlain', () => {
  it('formats without currency symbol', () => {
    expect(formatJpyPlain(1234567)).toBe('1,234,567');
  });

  it('formats zero plainly', () => {
    expect(formatJpyPlain(0)).toBe('0');
  });

  it('returns 0 for non-finite input', () => {
    expect(formatJpyPlain(NaN)).toBe('0');
  });
});
