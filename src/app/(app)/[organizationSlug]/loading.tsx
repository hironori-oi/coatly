/**
 * 組織ページ共通のローディング表示。
 *
 * Next.js App Router の loading.tsx は Suspense 境界の fallback として動く。
 * Skeleton は段組のシルエットだけ示し、prefers-reduced-motion 環境では
 * pulse アニメを停止する。
 */
export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <header className="space-y-2">
        <div className="h-3 w-16 animate-pulse rounded bg-stone-100 motion-reduce:animate-none" />
        <div className="h-8 w-64 animate-pulse rounded bg-stone-100 motion-reduce:animate-none" />
      </header>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-[14px] border border-border bg-card motion-reduce:animate-none"
          />
        ))}
      </section>
      <section className="h-72 animate-pulse rounded-[14px] border border-border bg-card motion-reduce:animate-none" />
      <span className="sr-only">読み込み中…</span>
    </div>
  );
}
