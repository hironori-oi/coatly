import { Suspense } from 'react';
import { LoginForm } from './login-form';

export const metadata = {
  title: 'ログイン',
};

/**
 * ログイン画面（W2 で本実装）
 *
 * Next.js 16: useSearchParams() を使う Client Component は <Suspense> 必須。
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            Coatly にログイン
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            テニス部 予算管理
          </p>
        </div>
        <Suspense
          fallback={
            <div className="h-40 animate-pulse rounded-md bg-stone-100/40" />
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
