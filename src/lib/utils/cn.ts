import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Tailwind class 合成ユーティリティ。
 * shadcn/ui 公式パターン: clsx で条件付き連結 → tailwind-merge で重複解消。
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
