'use client';

/**
 * 招待受諾フォーム（W2 本実装）
 *
 * フロー:
 *  1. signUp.email でユーザー作成（emailAndPassword.autoSignIn=true で自動ログイン）
 *  2. organization.acceptInvitation で招待を受諾（membership 自動付与）
 *  3. /[organizationSlug]/dashboard へ navigate
 *
 * NOTE: Better Auth の signUp.email レスポンスは autoSignIn 有効時に session を含む。
 * ここではレスポンスを待ってから acceptInvitation を呼ぶ。
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { authClient, signUp } from '@/lib/auth/client';

type Props = {
  invitationId: string;
  /** invitation table 上の email（強制）*/
  email: string;
  /** UI 表示用 email（URL クエリ優先）*/
  displayEmail: string;
  organizationSlug: string;
  role: string;
};

export function InviteAcceptForm({
  invitationId,
  email,
  displayEmail,
  organizationSlug,
  role,
}: Props) {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);

    try {
      // Step 1: サインアップ（autoSignIn=true で session 発行）
      const signUpResult = await signUp.email({
        email,
        password,
        name: name.trim(),
      });
      if (signUpResult.error) {
        setError(
          signUpResult.error.message ??
            'アカウント作成に失敗しました。パスワードは 10 文字以上にしてください。',
        );
        setPending(false);
        return;
      }

      // Step 2: 招待受諾 → membership 自動付与
      const acceptResult = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (acceptResult.error) {
        setError(
          acceptResult.error.message ??
            '招待の受諾に失敗しました。リンクの有効期限をご確認ください。',
        );
        setPending(false);
        return;
      }

      // Step 3: 自分の組織ダッシュボードへ
      router.push(`/${organizationSlug}/dashboard`);
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
              type="email"
              value={displayEmail}
              readOnly
              disabled
              aria-readonly
            />
            {displayEmail !== email ? (
              <p className="text-xs text-muted-foreground">
                招待時のメール ({email}) で登録されます。
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                招待されたメールアドレスは変更できません。
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">お名前</Label>
            <Input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              maxLength={64}
              placeholder="山田 太郎"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">パスワード（10 文字以上）</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            参加先の権限: <span className="font-medium">{role}</span>
          </p>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={pending || !name.trim() || password.length < 10}
          >
            {pending ? '参加処理中…' : 'パスワードを設定して参加'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
