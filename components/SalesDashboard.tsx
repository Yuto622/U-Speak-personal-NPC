import React, { useMemo, useState } from 'react';
import {
  PeriodMode,
  STATUS_DEFS,
  getSeries,
  getTotals,
  getRepRanking,
  RECENT_ACTIVITY,
  AggMetrics,
  DayMetrics,
} from '../services/salesData';

// ------- 小さなフォーマッタ ----------------------------------------
const fmt = (n: number) => n.toLocaleString('ja-JP');
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// ------- KPIカード --------------------------------------------------
interface KpiProps {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  icon: React.ReactNode;
  delta?: number; // 前期比（小数）
}

const KpiCard: React.FC<KpiProps> = ({ label, value, sub, accent, icon, delta }) => {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
          style={{ backgroundColor: accent }}
        >
          {icon}
        </span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold tracking-tight text-gray-900">{value}</span>
        {sub && <span className="text-sm text-gray-400 mb-1">{sub}</span>}
      </div>
      {delta !== undefined && (
        <div className="flex items-center gap-1 text-xs font-medium">
          <span className={up ? 'text-emerald-600' : 'text-rose-500'}>
            {up ? '▲' : '▼'} {pct(Math.abs(delta))}
          </span>
          <span className="text-gray-400">前期比</span>
        </div>
      )}
    </div>
  );
};

// ------- 棒＋折れ線 複合チャート（コール数 / アポ獲得 / アポ率）------
const TrendChart: React.FC<{ series: AggMetrics[] }> = ({ series }) => {
  const W = 720;
  const H = 260;
  const padL = 40;
  const padR = 44;
  const padT = 20;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxCalls = Math.max(...series.map((s) => s.calls), 1);
  const maxRate = Math.max(...series.map((s) => s.apoRateCalls), 0.001);
  const n = series.length;
  const slot = innerW / n;
  const barW = Math.min(28, slot * 0.45);

  const xCenter = (i: number) => padL + slot * i + slot / 2;
  const yCalls = (v: number) => padT + innerH - (v / maxCalls) * innerH;
  const yRate = (v: number) => padT + innerH - (v / maxRate) * innerH;

  const linePath = series
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xCenter(i)} ${yRate(s.apoRateCalls)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {/* 横グリッド */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = padT + innerH - innerH * t;
        return (
          <g key={t}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#f1f5f9" strokeWidth={1} />
            <text x={padL - 8} y={y + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
              {Math.round(maxCalls * t)}
            </text>
          </g>
        );
      })}
      {/* コール数の棒 + アポ獲得の棒（重ね） */}
      {series.map((s, i) => {
        const cx = xCenter(i);
        const callH = (s.calls / maxCalls) * innerH;
        const apoH = (s.appointment / maxCalls) * innerH;
        return (
          <g key={i}>
            <rect
              x={cx - barW / 2}
              y={yCalls(s.calls)}
              width={barW}
              height={callH}
              rx={3}
              fill="#c7d2fe"
            />
            <rect
              x={cx - barW / 2}
              y={padT + innerH - apoH}
              width={barW}
              height={apoH}
              rx={3}
              fill="#4f46e5"
            />
            <text x={cx} y={H - 10} textAnchor="middle" fontSize={9} fill="#64748b">
              {s.date}
            </text>
          </g>
        );
      })}
      {/* アポ率の折れ線 */}
      <path d={linePath} fill="none" stroke="#f59e0b" strokeWidth={2.5} />
      {series.map((s, i) => (
        <circle key={i} cx={xCenter(i)} cy={yRate(s.apoRateCalls)} r={3.5} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} />
      ))}
    </svg>
  );
};

// ------- ドーナツ（ステータス内訳）---------------------------------
const Donut: React.FC<{ total: DayMetrics }> = ({ total }) => {
  const size = 180;
  const r = 70;
  const stroke = 26;
  const c = 2 * Math.PI * r;
  const sum = STATUS_DEFS.reduce((acc, d) => acc + (total[d.key] as number), 0) || 1;

  let offset = 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {STATUS_DEFS.map((d) => {
          const val = total[d.key] as number;
          const frac = val / sum;
          const dash = frac * c;
          const seg = (
            <circle
              key={d.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return seg;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-gray-900">{fmt(sum)}</span>
        <span className="text-xs text-gray-400">総コール</span>
      </div>
    </div>
  );
};

// ------- ファネル ---------------------------------------------------
const Funnel: React.FC<{ total: AggMetrics }> = ({ total }) => {
  const stages = [
    { label: 'コール数', value: total.calls, color: '#6366f1' },
    { label: '担当接触', value: total.keymanContact, color: '#8b5cf6' },
    { label: '見込み+', value: total.prospect + total.materialSent + total.appointment, color: '#22c55e' },
    { label: 'アポ獲得', value: total.appointment, color: '#16a34a' },
  ];
  const max = stages[0].value || 1;
  return (
    <div className="space-y-3">
      {stages.map((s, i) => {
        const w = Math.max(8, (s.value / max) * 100);
        const conv = i === 0 ? 100 : (s.value / stages[i - 1].value) * 100;
        return (
          <div key={s.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium text-gray-600">{s.label}</span>
              <span className="text-gray-400">
                {fmt(s.value)} {i > 0 && <span className="text-gray-300">({conv.toFixed(1)}%)</span>}
              </span>
            </div>
            <div className="h-7 bg-gray-50 rounded-lg overflow-hidden">
              <div
                className="h-full rounded-lg transition-all duration-500"
                style={{ width: `${w}%`, backgroundColor: s.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ------- メイン -----------------------------------------------------
const PERIOD_LABEL: Record<PeriodMode, string> = {
  daily: '日次',
  weekly: '週次',
  monthly: '月次',
};

const SalesDashboard: React.FC = () => {
  const [mode, setMode] = useState<PeriodMode>('daily');

  const series = useMemo(() => getSeries(mode), [mode]);
  const totals = useMemo(() => getTotals(mode), [mode]);
  const reps = useMemo(() => getRepRanking(), []);

  // 前期比（最後と最後から2番目）
  const delta = (sel: (m: AggMetrics) => number) => {
    if (series.length < 2) return undefined;
    const last = sel(series[series.length - 1]);
    const prev = sel(series[series.length - 2]);
    if (!prev) return undefined;
    return (last - prev) / prev;
  };

  const statusSum = STATUS_DEFS.reduce((a, d) => a + (totals[d.key] as number), 0) || 1;

  return (
    <div className="min-h-screen w-full bg-gray-50 text-gray-900 overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ヘッダー */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg">
              U
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">営業成績ダッシュボード</h1>
              <p className="text-sm text-gray-500">合同会社U-Speak Lab ・ テレアポKPI</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
              {(['daily', 'weekly', 'monthly'] as PeriodMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    mode === m ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {PERIOD_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* KPIカード */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard
            label="コール数"
            value={fmt(totals.calls)}
            sub="件"
            accent="#6366f1"
            delta={delta((m) => m.calls)}
            icon={<PhoneIcon />}
          />
          <KpiCard
            label="担当接触数"
            value={fmt(totals.keymanContact)}
            sub={`接触率 ${pct(totals.keymanContactRate)}`}
            accent="#8b5cf6"
            delta={delta((m) => m.keymanContact)}
            icon={<UserIcon />}
          />
          <KpiCard
            label="アポ獲得数"
            value={fmt(totals.appointment)}
            sub="件"
            accent="#16a34a"
            delta={delta((m) => m.appointment)}
            icon={<CheckIcon />}
          />
          <KpiCard
            label="アポ獲得率（対架電）"
            value={pct(totals.apoRateCalls)}
            sub={`対担当者 ${pct(totals.apoRateKeyman)}`}
            accent="#f59e0b"
            delta={delta((m) => m.apoRateCalls)}
            icon={<TargetIcon />}
          />
        </section>

        {/* メイングリッド */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
          {/* トレンド */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-gray-800">コール数 / アポ獲得 推移</h2>
              <div className="flex items-center gap-4 text-xs">
                <Legend color="#c7d2fe" label="コール数" />
                <Legend color="#4f46e5" label="アポ獲得" />
                <Legend color="#f59e0b" label="アポ率" line />
              </div>
            </div>
            <TrendChart series={series} />
          </div>

          {/* ファネル */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-800 mb-4">営業ファネル</h2>
            <Funnel total={totals} />
          </div>
        </section>

        {/* ステータス内訳 + ランキング */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
          {/* ステータス内訳 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-800 mb-4">ステータス内訳</h2>
            <div className="flex flex-col items-center gap-5">
              <Donut total={totals} />
              <div className="w-full grid grid-cols-1 gap-1.5">
                {STATUS_DEFS.map((d) => {
                  const val = totals[d.key] as number;
                  return (
                    <div key={d.key} className="flex items-center text-sm">
                      <span className="w-2.5 h-2.5 rounded-sm mr-2" style={{ backgroundColor: d.color }} />
                      <span className="flex-1 text-gray-600">{d.label}</span>
                      <span className="font-medium text-gray-800 tabular-nums mr-2">{fmt(val)}</span>
                      <span className="text-gray-400 tabular-nums w-12 text-right">
                        {pct(val / statusSum)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 担当者ランキング */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-800 mb-4">担当者別 成績ランキング</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-xs border-b border-gray-100">
                    <th className="text-left font-medium py-2 pl-1">#</th>
                    <th className="text-left font-medium py-2">担当者</th>
                    <th className="text-right font-medium py-2">コール</th>
                    <th className="text-right font-medium py-2">担当接触</th>
                    <th className="text-right font-medium py-2">アポ</th>
                    <th className="text-right font-medium py-2 pr-1">アポ率</th>
                  </tr>
                </thead>
                <tbody>
                  {reps.map((r, i) => (
                    <tr key={r.name} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 pl-1">
                        <span
                          className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-bold ${
                            i === 0
                              ? 'bg-amber-100 text-amber-700'
                              : i === 1
                              ? 'bg-gray-100 text-gray-600'
                              : i === 2
                              ? 'bg-orange-100 text-orange-700'
                              : 'text-gray-400'
                          }`}
                        >
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-2.5 font-medium text-gray-800">{r.name}</td>
                      <td className="py-2.5 text-right tabular-nums text-gray-600">{fmt(r.calls)}</td>
                      <td className="py-2.5 text-right tabular-nums text-gray-600">{fmt(r.keymanContact)}</td>
                      <td className="py-2.5 text-right tabular-nums font-semibold text-gray-900">{fmt(r.appointment)}</td>
                      <td className="py-2.5 text-right pr-1">
                        <span className="inline-block px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-xs font-medium tabular-nums">
                          {pct(r.apoRate)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 直近アクティビティ */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-8">
          <h2 className="font-semibold text-gray-800 mb-4">直近の獲得・進捗</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
            {RECENT_ACTIVITY.map((a, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-gray-50">
                <StatusBadge status={a.status} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{a.company}</p>
                  <p className="text-xs text-gray-400">{a.industry}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-500">{a.rep}</p>
                  <p className="text-xs text-gray-400">{a.date}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="text-center text-xs text-gray-400 pb-8">
          ※ 数値は営業管理スプレッドシートのKPI構造に基づくサンプルデータです。
        </footer>
      </div>
    </div>
  );
};

// ------- 補助コンポーネント ----------------------------------------
const Legend: React.FC<{ color: string; label: string; line?: boolean }> = ({ color, label, line }) => (
  <span className="flex items-center gap-1.5 text-gray-500">
    <span
      className={line ? 'w-4 h-0.5 rounded-full' : 'w-2.5 h-2.5 rounded-sm'}
      style={{ backgroundColor: color }}
    />
    {label}
  </span>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, string> = {
    アポ獲得: 'bg-emerald-100 text-emerald-700',
    見込み: 'bg-lime-100 text-lime-700',
    資料送付: 'bg-sky-100 text-sky-700',
  };
  return (
    <span className={`shrink-0 px-2 py-1 rounded-md text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
};

// ------- アイコン（インラインSVG）----------------------------------
const PhoneIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const TargetIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

export default SalesDashboard;
