import { describe, it, expect } from 'vitest';
import { computeFiscalYear } from '@/lib/db/scoped';

describe('computeFiscalYear', () => {
  it('uses default startMonth=4 when fiscalYearStartMonth is null/undefined', () => {
    // 4月以降 = 当年度
    expect(
      computeFiscalYear(
        { fiscalYearStartMonth: null },
        new Date('2026-04-26'),
      ),
    ).toBe(2026);
    // 3月以前 = 前年度
    expect(
      computeFiscalYear(
        { fiscalYearStartMonth: null },
        new Date('2026-03-15'),
      ),
    ).toBe(2025);
  });

  it('handles startMonth=4 boundary correctly', () => {
    // computeFiscalYear は getMonth() (local timezone) を使うため、
    // タイムゾーンに依存しない Date(year, month-index, day) を使う
    // 4/15 = 当年度
    expect(
      computeFiscalYear(
        { fiscalYearStartMonth: 4 },
        new Date(2026, 3, 15), // 2026-04-15 ローカル
      ),
    ).toBe(2026);
    // 3/15 = 前年度
    expect(
      computeFiscalYear(
        { fiscalYearStartMonth: 4 },
        new Date(2026, 2, 15), // 2026-03-15 ローカル
      ),
    ).toBe(2025);
  });

  it('handles startMonth=1 (calendar year)', () => {
    expect(
      computeFiscalYear(
        { fiscalYearStartMonth: 1 },
        new Date('2026-01-01'),
      ),
    ).toBe(2026);
    expect(
      computeFiscalYear(
        { fiscalYearStartMonth: 1 },
        new Date('2026-12-31'),
      ),
    ).toBe(2026);
  });

  it('handles startMonth=10 (October fiscal year)', () => {
    // 10月以降 = 当年度
    expect(
      computeFiscalYear(
        { fiscalYearStartMonth: 10 },
        new Date('2026-10-15'),
      ),
    ).toBe(2026);
    // 9月以前 = 前年度
    expect(
      computeFiscalYear(
        { fiscalYearStartMonth: 10 },
        new Date('2026-09-30'),
      ),
    ).toBe(2025);
  });

  it('uses current date when today is omitted', () => {
    const r = computeFiscalYear({ fiscalYearStartMonth: 4 });
    const expected =
      new Date().getMonth() + 1 >= 4
        ? new Date().getFullYear()
        : new Date().getFullYear() - 1;
    expect(r).toBe(expected);
  });
});
