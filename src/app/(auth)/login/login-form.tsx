'use client';

/**
 * ログインフォーム（W2 本実装）
 *
 * - Better Auth クライアントの `signIn.email` を使う
 * - 成功時は `next` クエリ or `/` へ navigate
 * - 失敗時は inline error（赤背景の小さな alert）
 *
 * Next.js 16: useSearchParams を使うため <Suspense> 必須（page.tsx 側で対応済み）。
 */
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { signIn } from '@/lib/auth/client';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/';
  const reason = params.get('reason');

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(
    reason === 'no-org'
      ? '組織への所属が確認できませんでした。招待リンクから参加してください。'
      : null,
  );
  const [pending, setPending] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);

    try {
      const result = await signIn.email({
        email: email.trim(),
        password,
        callbackURL: next,
        rememberMe: true,
      });

      if (result.error) {
        setError(
          result.error.message ??
            'ログインに失敗しました。メールとパスワードをご確認ください。',
        );
        setPending(false);
        return;
      }

      // 成功時: next が外部 URL でないか確認した上で遷移
      const target = next.startsWith('/') ? next : '/';
      router.push(target);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : '予期せぬエラーが発生しました。少し時間をおいて再度お試しください。',
      );
      setPending(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
            >
              <ExclamationTriangleIcon
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>{error}</span>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">メールアドレス</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">パスワード</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
            />
          </div>
          <input type="hidden" name="next" value={next} />
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={pending || !email || password.length < 10}
          >
            {pending ? 'ログイン中…' : 'ログイン'}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">
          招待制のため、新規登録は招待リンクから行ってください。
        </p>
      </CardContent>
    </Card>
  );
}
