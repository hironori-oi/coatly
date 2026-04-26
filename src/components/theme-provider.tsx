'use client';

/**
 * next-themes の ThemeProvider を root に注入するラッパ。
 *
 * - `attribute="class"` で <html class="dark"> を切り替える
 * - `defaultTheme="system"` で OS の prefers-color-scheme を尊重
 * - `enableSystem` で system → manual を許容
 * - `disableTransitionOnChange` で初期切替時のフラッシュを抑制
 *
 * Server Component (RootLayout) から呼ばれるため必ず Client Boundary を切る。
 */
import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
