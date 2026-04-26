/**
 * 招待メールテンプレ（src/lib/email/templates 配下）
 *
 * 実体は `src/emails/invitation-email.tsx`（react-email/components）。
 * - W3-A polish で `sendInvitationEmail` から参照される位置として
 *   templates/ 配下に re-export を置く（test や preview の探索性を改善）。
 * - 余計なフォーク版を作らないことで HTML / plain text の duplicate を避ける。
 */
export {
  default as InvitationEmail,
  type InvitationEmailProps,
} from '@/emails/invitation-email';
