'use client';

/**
 * 月次推移チャート（Recharts LineChart 12 ヶ月）
 *
 * 縦軸: 円, 横軸: 月（FY 開始月から）
 * 凡例: 「予算（pro-rata 月次）」「消化額」
 */
import * as React from 'react';
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export type MonthlyTrendPoint = {
  label: string; // "4月" 等
  budget: number;
  used: number;
};

export function MonthlyTrendChart({ data }: { data: MonthlyTrendPoint[] }) {
  const fmt = (v: number) =>
    v >= 1_000_000
      ? `¥${(v / 1_000_000).toFixed(1)}M`
      : v >= 1_000
        ? `¥${Math.round(v / 1_000)}k`
        : `¥${v}`;
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid stroke="#E7E5E0" strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            stroke="#7A7A75"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: '#E7E5E0' }}
          />
          <YAxis
            stroke="#7A7A75"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: '#E7E5E0' }}
            tickFormatter={fmt}
          />
          <Tooltip
            formatter={(v: number) => `¥${v.toLocaleString('ja-JP')}`}
            labelStyle={{ color: '#1F1F1B' }}
            contentStyle={{
              backgroundColor: '#FAFAF7',
              border: '1px solid #E7E5E0',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="budget"
            name="予算（月次按分）"
            stroke="#7A7A75"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="used"
            name="消化額"
            stroke="#1F6B4A"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
