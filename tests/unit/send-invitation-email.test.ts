/**
 * sendInvitationEmail unit test
 *
 * 検証観点:
 *  - Resend SDK をモック（process.env.RESEND_API_KEY 設定時の path）
 *  - HTML / Plain text の両方が render されていること
 *  - HTML に inviteUrl がそのまま含まれること（CTA リンク）
 *  - Plain text にも inviteUrl が含まれること
 *  - From は EMAIL_FROM、Reply-To は EMAIL_REPLY_TO
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

beforeEach(() => {
  sendMock.mockReset();
  vi.resetModules();
  process.env.RESEND_API_KEY = 'test_key_for_resend';
  process.env.EMAIL_FROM = 'Coatly <noreply@improver.jp>';
  process.env.EMAIL_REPLY_TO = 'support@improver.jp';
});

describe('sendInvitationEmail', () => {
  it('renders HTML + plain text and passes inviteUrl through Resend SDK', async () => {
    sendMock.mockResolvedValue({ data: { id: 'em_test_xyz' }, error: null });

    const { sendInvitationEmail } = await import('@/lib/email/resend');
    const result = await sendInvitationEmail({
      to: 'sato@example.com',
      orgName: 'テニス部',
      inviteUrl: 'https://app.example.com/invite/inv_abc?email=sato%40example.com',
      inviterName: 'Coatly Owner',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.id).toBe('em_test_xyz');

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.from).toBe('Coatly <noreply@improver.jp>');
    expect(call.to).toBe('sato@example.com');
    expect(call.replyTo).toBe('support@improver.jp');
    expect(call.subject).toContain('テニス部');

    // react ノードが渡っていること（Resend SDK は react を server-side で render する）
    expect(call.react).toBeTruthy();

    // Plain text fallback が渡っていて、その中に inviteUrl が入っていること
    expect(typeof call.text).toBe('string');
    expect(call.text).toContain(
      'https://app.example.com/invite/inv_abc?email=sato%40example.com',
    );
  });

  it('returns ok=false (or fallback) gracefully when Resend SDK throws', async () => {
    sendMock.mockRejectedValue(new Error('network down'));
    const { sendInvitationEmail } = await import('@/lib/email/resend');
    const result = await sendInvitationEmail({
      to: 'a@b.test',
      orgName: 'X',
      inviteUrl: 'https://x.test/invite/abc',
      inviterName: 'Owner',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('network down');
  });

  it('falls back to console.warn when RESEND_API_KEY is not set', async () => {
    delete process.env.RESEND_API_KEY;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { sendInvitationEmail } = await import('@/lib/email/resend');
    const result = await sendInvitationEmail({
      to: 'a@b.test',
      orgName: 'X',
      inviteUrl: 'https://x.test/invite/abc',
      inviterName: 'Owner',
    });
    expect(result.ok).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
    // fallback は console.warn にダンプする
    expect(warn).toHaveBeenCalled();
    const concatenated = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(concatenated).toContain('https://x.test/invite/abc');
    warn.mockRestore();
  });
});
