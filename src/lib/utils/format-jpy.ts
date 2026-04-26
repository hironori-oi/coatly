/**
 * 日本円表示ヘルパ
 *
 * - Intl.NumberFormat で ¥1,234,567 形式を生成
 * - タビュラー数字の CSS は font-variant-numeric: tabular-nums で別途付与
 * - 小数点なし（amount は integer JPY 前提）
 */
const formatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

export function formatJpy(amount: number): string {
  if (!Number.isFinite(amount)) return '¥0';
  return formatter.format(Math.trunc(amount));
}

/**
 * 通貨記号なしの数値部分のみ（"1,234,567"）。タビュラー数字 cell 用。
 */
const plainFormatter = new Intl.NumberFormat('ja-JP', {
  maximumFractionDigits: 0,
});

export function formatJpyPlain(amount: number): string {
  if (!Number.isFinite(amount)) return '0';
  return plainFormatter.format(Math.trunc(amount));
}
