/**
 * インボイス番号バリデーション unit test
 *
 * 仕様（lib/utils/invoice.ts）:
 * - 形式: T + 13 桁数字
 * - 13 桁数字は法人番号と同じチェックデジット規則
 */
import { describe, it, expect } from 'vitest';
import {
  isValidInvoiceNumberFormat,
  computeInvoiceCheckDigit,
  isValidInvoiceNumber,
} from '@/lib/utils/invoice';

describe('isValidInvoiceNumberFormat', () => {
  it('returns true for valid format (T + 13 digits)', () => {
    expect(isValidInvoiceNumberFormat('T1234567890123')).toBe(true);
  });

  it('returns false when prefix is not T', () => {
    expect(isValidInvoiceNumberFormat('S1234567890123')).toBe(false);
  });

  it('returns false when digits are 12 (too short)', () => {
    expect(isValidInvoiceNumberFormat('T123456789012')).toBe(false);
  });

  it('returns false when digits are 14 (too long)', () => {
    expect(isValidInvoiceNumberFormat('T12345678901234')).toBe(false);
  });

  it('returns false when contains non-digit chars', () => {
    expect(isValidInvoiceNumberFormat('T12345678ABCDE')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidInvoiceNumberFormat('')).toBe(false);
  });

  it('returns false for lowercase t', () => {
    expect(isValidInvoiceNumberFormat('t1234567890123')).toBe(false);
  });
});

describe('computeInvoiceCheckDigit', () => {
  it('throws when input is not 12 digits', () => {
    expect(() => computeInvoiceCheckDigit('123')).toThrow();
    expect(() => computeInvoiceCheckDigit('12345678901a')).toThrow();
  });

  it('returns a single-digit number 0-9', () => {
    const cd = computeInvoiceCheckDigit('234567890123');
    expect(cd).toBeGreaterThanOrEqual(0);
    expect(cd).toBeLessThanOrEqual(9);
  });
});

describe('isValidInvoiceNumber (full validation)', () => {
  it('rejects invalid format', () => {
    expect(isValidInvoiceNumber('T123')).toBe(false);
    expect(isValidInvoiceNumber('1234567890123')).toBe(false);
  });

  it('round-trip: computed check digit makes the number valid', () => {
    // 法人番号 12 桁を仮定 → CD を計算 → T + CD + 12 桁 で組み立て → valid
    const body = '234567890123';
    const cd = computeInvoiceCheckDigit(body);
    const invoice = `T${cd}${body}`;
    expect(isValidInvoiceNumber(invoice)).toBe(true);
  });

  it('rejects mismatched check digit', () => {
    const body = '234567890123';
    const correctCd = computeInvoiceCheckDigit(body);
    const wrongCd = (correctCd + 1) % 10;
    const invoice = `T${wrongCd}${body}`;
    expect(isValidInvoiceNumber(invoice)).toBe(false);
  });
});
