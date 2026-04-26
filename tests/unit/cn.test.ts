import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils/cn';

describe('cn', () => {
  it('joins multiple classnames', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('drops falsy values', () => {
    expect(cn('foo', false, undefined, null, 'bar')).toBe('foo bar');
  });

  it('honors conditional object syntax', () => {
    expect(cn('foo', { bar: true, baz: false })).toBe('foo bar');
  });

  it('merges conflicting tailwind utilities (tailwind-merge)', () => {
    // p-2 is overridden by p-4
    expect(cn('p-2', 'p-4')).toBe('p-4');
    // text-red-500 is overridden by text-blue-500
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('preserves non-conflicting tailwind utilities', () => {
    expect(cn('p-2', 'text-red-500')).toBe('p-2 text-red-500');
  });

  it('returns empty string with no inputs', () => {
    expect(cn()).toBe('');
  });

  it('flattens array inputs', () => {
    expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz');
  });
});
