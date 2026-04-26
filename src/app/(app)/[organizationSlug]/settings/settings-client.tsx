'use client';

/**
 * 設定ページの client セクション
 *
 * - プロフィール（name 編集 → updateProfile）
 * - パスワード変更（authClient.changePassword）
 * - 退会（Phase 2 stub）
 *
 * テーマ切替は layout 側 ThemeToggle ですでに利用可能なため、
 * 設定ページにも視覚的に置いておく（next-themes の useTheme）。
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  KeyIcon,
  UserIcon,
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth/client';
import { updateProfile } from '@/lib/actions/profile';

type Props = {
  initialName: string;
  email: string;
};

export function SettingsClient({ initialName, email }: Props) {
  return (
    <div className="space-y-6">
      <ProfileSection initialName={initialName} email={email} />
      <ThemeSection />
      <PasswordSection />
      <DangerZone />
    </div>
  );
}

function ProfileSection({
  initialName,
  email,
}: {
  initialName: string;
  email: string;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(initialName);
  const [pending, setPending] = React.useState(false);
  const [feedback, setFeedback] = React.useState<
    { type: 'ok' | 'error'; message: string } | null
  >(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setPending(true);
    const res = await updateProfile({ name });
    setPending(false);
    if (!res.ok) {
      setFeedback({ type: 'error', message: res.error });
      return;
    }
    setFeedback({ type: 'ok', message: '保存しました' });
    router.refresh();
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <header className="flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-court-green" aria-hidden="true" />
          <h2 className="text-lg font-semibold">プロフィール</h2>
        </header>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="settings-email">メールアドレス</Label>
            <Input
              id="settings-email"
              type="email"
              value={email}
              disabled
              readOnly
            />
            <p className="text-xs text-muted-foreground">
              メールアドレスの変更は管理者にお問い合わせください。
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-name">表示名</Label>
            <Input
              id="settings-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              maxLength={80}
            />
          </div>
          <FeedbackBanner feedback={feedback} />
          <div>
            <Button
              type="submit"
              variant="accent"
              size="sm"
              disabled={pending || name.trim() === initialName.trim()}
            >
              {pending ? '保存中…' : '保存する'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ThemeSection() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  // next-themes 公式の hydration-safe パターン。SSR / client で theme が
  // 一致しないため初回 render 後に有効化する必要がある。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setMounted(true), []);

  const options = [
    { value: 'light', label: 'ライト', Icon: SunIcon },
    { value: 'dark', label: 'ダーク', Icon: MoonIcon },
    { value: 'system', label: 'システム', Icon: ComputerDesktopIcon },
  ] as const;

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <header>
          <h2 className="text-lg font-semibold">外観</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            テーマを切り替えます。設定はブラウザに保存されます。
          </p>
        </header>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {options.map(({ value, label, Icon }) => {
            const active = mounted && theme === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(value)}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'border-court-green bg-court-green/10 text-court-green'
                    : 'border-border bg-card hover:bg-stone-100'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordSection() {
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [feedback, setFeedback] = React.useState<
    { type: 'ok' | 'error'; message: string } | null
  >(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (next.length < 10) {
      setFeedback({
        type: 'error',
        message: '新しいパスワードは 10 文字以上で入力してください',
      });
      return;
    }
    if (next !== confirm) {
      setFeedback({
        type: 'error',
        message: '確認用パスワードが一致しません',
      });
      return;
    }
    setPending(true);
    try {
      const res = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (res.error) {
        setFeedback({
          type: 'error',
          message: res.error.message ?? 'パスワード変更に失敗しました',
        });
      } else {
        setFeedback({ type: 'ok', message: 'パスワードを変更しました' });
        setCurrent('');
        setNext('');
        setConfirm('');
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'unknown_error',
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <header className="flex items-center gap-2">
          <KeyIcon className="h-5 w-5 text-court-green" aria-hidden="true" />
          <h2 className="text-lg font-semibold">パスワード変更</h2>
        </header>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="settings-current">現在のパスワード</Label>
            <Input
              id="settings-current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              disabled={pending}
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-next">新しいパスワード</Label>
            <Input
              id="settings-next"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              disabled={pending}
              autoComplete="new-password"
              minLength={10}
            />
            <p className="text-xs text-muted-foreground">
              10 文字以上で入力してください。
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-confirm">新しいパスワード（確認）</Label>
            <Input
              id="settings-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              disabled={pending}
              autoComplete="new-password"
              minLength={10}
            />
          </div>
          <FeedbackBanner feedback={feedback} />
          <div>
            <Button
              type="submit"
              variant="accent"
              size="sm"
              disabled={pending || !current || !next || !confirm}
            >
              {pending ? '変更中…' : 'パスワードを変更'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function DangerZone() {
  return (
    <Card className="border-danger/30">
      <CardContent className="space-y-3 p-6">
        <header>
          <h2 className="text-lg font-semibold text-danger">退会</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            アカウント削除は Phase 2 で対応予定です。退会をご希望の場合は
            管理者までご連絡ください。
          </p>
        </header>
        <Button variant="destructive" size="sm" disabled>
          退会する（Phase 2）
        </Button>
      </CardContent>
    </Card>
  );
}

function FeedbackBanner({
  feedback,
}: {
  feedback: { type: 'ok' | 'error'; message: string } | null;
}) {
  if (!feedback) return null;
  const isOk = feedback.type === 'ok';
  return (
    <div
      role={isOk ? 'status' : 'alert'}
      className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
        isOk
          ? 'border-court-green/30 bg-court-green/10 text-court-green'
          : 'border-danger/30 bg-danger/10 text-danger'
      }`}
    >
      {isOk ? (
        <CheckCircleIcon
          className="mt-0.5 h-4 w-4 shrink-0"
          aria-hidden="true"
        />
      ) : (
        <ExclamationTriangleIcon
          className="mt-0.5 h-4 w-4 shrink-0"
          aria-hidden="true"
        />
      )}
      <span>{feedback.message}</span>
    </div>
  );
}
