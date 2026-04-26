'use client';

/**
 * メンバー管理 Client（Phase 1 polish 本実装）
 *
 * 1 ファイルで 3 つのモードを提供する:
 *  - mode='invite'      → header の「招待する」ボタン + Dialog
 *  - mode='member'      → 行の三点メニュー（ロール変更 / 無効化）
 *  - mode='invitation'  → 行の「再送」「取消」ボタン
 *
 * DEC-021 のとおり Radix overlay は client component が必須。
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  EllipsisHorizontalIcon,
  EnvelopeIcon,
  UserPlusIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  inviteMember,
  updateMemberRole,
  deactivateMember,
  cancelInvitation,
  resendInvitation,
} from '@/lib/actions/invite';

type GroupOption = { id: string; name: string };

type Props =
  | {
      mode: 'invite';
      organizationId: string;
      groupOptions: GroupOption[];
    }
  | {
      mode: 'member';
      organizationId: string;
      userId: string;
      currentRole: string;
      isActive: boolean;
    }
  | {
      mode: 'invitation';
      organizationId: string;
      invitationId: string;
    };

export function MembersClient(props: Props) {
  if (props.mode === 'invite') return <InviteButton {...props} />;
  if (props.mode === 'member') return <MemberRowActions {...props} />;
  return <InvitationRowActions {...props} />;
}

/* -------------------------------------------------------------------------- */
/* Invite                                                                      */
/* -------------------------------------------------------------------------- */

function InviteButton({
  organizationId,
  groupOptions,
}: {
  organizationId: string;
  groupOptions: GroupOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<'admin' | 'member'>('member');
  const [groupId, setGroupId] = React.useState<string>('');
  const [groupRole, setGroupRole] = React.useState<'manager' | 'member'>(
    'member',
  );
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Dialog open 時に招待フォームをリセットする意図的な setState。
  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEmail('');
      setRole('member');
      setGroupId('');
      setGroupRole('member');
      setError(null);
    }
  }, [open]);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim()) {
      setError('メールアドレスを入力してください');
      return;
    }
    setPending(true);
    const res = await inviteMember({
      email: email.trim(),
      organizationId,
      role,
      groupId: groupId || undefined,
      groupRole: groupId ? groupRole : undefined,
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button variant="accent" size="sm" onClick={() => setOpen(true)}>
        <UserPlusIcon className="h-4 w-4" aria-hidden="true" />
        招待する
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>メンバーを招待</DialogTitle>
            <DialogDescription>
              入力したメールアドレスに招待リンクを送信します（有効期限 7 日）。
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
            >
              <ExclamationTriangleIcon
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">メールアドレス</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                disabled={pending}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-role">全体ロール</Label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as 'admin' | 'member')
                }
                disabled={pending}
                className="block h-9 w-full rounded-md border border-border bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-court-green/40"
              >
                <option value="member">メンバー</option>
                <option value="admin">管理者</option>
              </select>
            </div>

            {groupOptions.length > 0 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="invite-group">所属グループ（任意）</Label>
                  <select
                    id="invite-group"
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    disabled={pending}
                    className="block h-9 w-full rounded-md border border-border bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-court-green/40"
                  >
                    <option value="">（指定しない）</option>
                    {groupOptions.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                {groupId && (
                  <div className="space-y-2">
                    <Label htmlFor="invite-group-role">
                      グループ内ロール
                    </Label>
                    <select
                      id="invite-group-role"
                      value={groupRole}
                      onChange={(e) =>
                        setGroupRole(
                          e.target.value as 'manager' | 'member',
                        )
                      }
                      disabled={pending}
                      className="block h-9 w-full rounded-md border border-border bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-court-green/40"
                    >
                      <option value="member">メンバー</option>
                      <option value="manager">マネージャ</option>
                    </select>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              キャンセル
            </Button>
            <Button variant="accent" onClick={onSubmit} disabled={pending}>
              <EnvelopeIcon className="h-4 w-4" aria-hidden="true" />
              {pending ? '送信中…' : '招待を送る'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Member row actions                                                          */
/* -------------------------------------------------------------------------- */

function MemberRowActions({
  organizationId,
  userId,
  currentRole,
  isActive,
}: {
  organizationId: string;
  userId: string;
  currentRole: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const changeRole = async (role: 'owner' | 'admin' | 'member') => {
    if (role === currentRole) return;
    setPending(true);
    setError(null);
    const res = await updateMemberRole({ organizationId, userId, role });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  };

  const onDeactivate = async () => {
    setPending(true);
    setError(null);
    const res = await deactivateMember({ organizationId, userId });
    setPending(false);
    setConfirmOpen(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="メンバー操作"
            disabled={pending}
          >
            <EllipsisHorizontalIcon className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>ロールを変更</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() => changeRole('member')}
            data-disabled={currentRole === 'member' ? '' : undefined}
          >
            メンバー
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => changeRole('admin')}
            data-disabled={currentRole === 'admin' ? '' : undefined}
          >
            管理者
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => changeRole('owner')}
            data-disabled={currentRole === 'owner' ? '' : undefined}
          >
            オーナー
          </DropdownMenuItem>
          {isActive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setConfirmOpen(true)}
                className="text-danger focus:bg-danger/10 focus:text-danger"
              >
                無効化
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>メンバーを無効化しますか？</DialogTitle>
            <DialogDescription>
              無効化されたメンバーはログインできなくなります。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={pending}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={onDeactivate}
              disabled={pending}
            >
              {pending ? '処理中…' : '無効化する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Invitation row actions                                                      */
/* -------------------------------------------------------------------------- */

function InvitationRowActions({
  organizationId,
  invitationId,
}: {
  organizationId: string;
  invitationId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<'resend' | 'cancel' | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);

  const onResend = async () => {
    setPending('resend');
    setError(null);
    const res = await resendInvitation({ organizationId, invitationId });
    setPending(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  };

  const onCancel = async () => {
    setPending('cancel');
    setError(null);
    const res = await cancelInvitation({ organizationId, invitationId });
    setPending(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={onResend}
        disabled={pending !== null}
      >
        {pending === 'resend' ? '送信中…' : '再送'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onCancel}
        disabled={pending !== null}
        className="text-danger hover:bg-danger/10 hover:text-danger"
      >
        {pending === 'cancel' ? '取消中…' : '取消'}
      </Button>
      {error && (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
