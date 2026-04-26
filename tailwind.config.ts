import type { Config } from 'tailwindcss';

/**
 * Tailwind CSS v4 では設定の中心は globals.css の @theme に移行。
 * 本ファイルは content scan と plugin のみを定義する。
 */
export default {
  content: [
    './src/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
  ],
  plugins: [],
} satisfies Config;
