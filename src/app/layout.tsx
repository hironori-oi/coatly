import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Coatly — 部費が、散らからない。',
    template: '%s | Coatly',
  },
  description:
    'テニス部の予算と活動費を、5県まとめて見渡せる。Coatly は静かで上質な予算管理体験を提供します。',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  ),
  applicationName: 'Coatly',
  authors: [{ name: 'Coatly Team' }],
  robots: {
    index: false, // Phase 1 はクローラ拒否（β リリース）
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider>{children}</ThemeProvider>
        {/* Vercel Analytics / Speed Insights:
            production のみ自動で動作する（dev では no-op）。
            個人情報は送信せず、Web Vitals と pageview のみ計測。 */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
