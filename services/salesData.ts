// 営業成績ダッシュボード用のデータモデルと集計ロジック
//
// このファイルのデータ構造は、営業管理スプレッドシートの
// 「KPIダッシュボード」セクションに完全準拠しています。
//   重要指標 : コール数 / 担当接触数 / 担当接触率 / アポ獲得数 /
//              アポ獲得率（対架電）/ アポ獲得率（対担当者）
//   ステータス: 不通 / 電話番号違い / 担当者不在 / 折り返し待ち /
//              見込み / 資料送付 / 受付NG / キーマンNG / アポ獲得
//
// スプレッドシートの実データは現状すべて 0（テンプレート）のため、
// 構造はそのままに、デモ用のサンプル値を決定論的に生成しています。

export interface DayMetrics {
  /** 表示用ラベル（例: "2/3"） */
  date: string;
  /** ISO 日付（並び替え用） */
  iso: string;
  calls: number;          // コール数
  noAnswer: number;       // 不通
  wrongNumber: number;    // 電話番号違い
  absent: number;         // 担当者不在
  callbackWait: number;   // 折り返し待ち
  prospect: number;       // 見込み
  materialSent: number;   // 資料送付
  receptionNG: number;    // 受付NG
  keymanNG: number;       // キーマンNG
  appointment: number;    // アポ獲得
}

export interface AggMetrics extends DayMetrics {
  /** 担当接触数 = キーマンと会話できた件数 */
  keymanContact: number;
  /** 担当接触率（対架電） */
  keymanContactRate: number;
  /** アポ獲得率（対架電） */
  apoRateCalls: number;
  /** アポ獲得率（対担当者） */
  apoRateKeyman: number;
}

export interface RepMetrics {
  name: string;
  calls: number;
  keymanContact: number;
  appointment: number;
  apoRate: number; // 対架電
}

export type PeriodMode = 'daily' | 'weekly' | 'monthly';

// 営業ステータスの定義（色付き・順序固定）------------------------------
export const STATUS_DEFS: {
  key: keyof DayMetrics;
  label: string;
  color: string;
  positive?: boolean;
}[] = [
  { key: 'appointment', label: 'アポ獲得', color: '#16a34a', positive: true },
  { key: 'prospect', label: '見込み', color: '#22c55e', positive: true },
  { key: 'materialSent', label: '資料送付', color: '#84cc16', positive: true },
  { key: 'callbackWait', label: '折り返し待ち', color: '#eab308' },
  { key: 'keymanNG', label: 'キーマンNG', color: '#f97316' },
  { key: 'receptionNG', label: '受付NG', color: '#ef4444' },
  { key: 'absent', label: '担当者不在', color: '#a855f7' },
  { key: 'noAnswer', label: '不通', color: '#94a3b8' },
  { key: 'wrongNumber', label: '電話番号違い', color: '#64748b' },
];

// 決定論的な擬似乱数（シード固定）------------------------------------
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 営業日（平日）の日次データを生成 ----------------------------------
function generateDailyData(): DayMetrics[] {
  const rand = mulberry32(20260201);
  const days: DayMetrics[] = [];
  const start = new Date(2026, 1, 2); // 2026-02-02 (月)

  for (let i = 0; i < 20; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + Math.floor(i * 1.4)); // 平日中心に間引き
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // 土日スキップ

    const calls = 70 + Math.floor(rand() * 70); // 70〜140
    // ステータス比率（合計が calls になるよう配分）
    const noAnswer = Math.round(calls * (0.20 + rand() * 0.08));
    const wrongNumber = Math.round(calls * (0.03 + rand() * 0.02));
    const absent = Math.round(calls * (0.16 + rand() * 0.06));
    const receptionNG = Math.round(calls * (0.18 + rand() * 0.06));
    const callbackWait = Math.round(calls * (0.06 + rand() * 0.03));
    const keymanNG = Math.round(calls * (0.10 + rand() * 0.04));
    const materialSent = Math.round(calls * (0.05 + rand() * 0.03));
    const prospect = Math.round(calls * (0.04 + rand() * 0.03));
    let appointment = Math.round(calls * (0.025 + rand() * 0.025));
    // 端数調整: 残りを不通に寄せる
    const used =
      noAnswer + wrongNumber + absent + receptionNG + callbackWait +
      keymanNG + materialSent + prospect + appointment;
    const fixedNoAnswer = Math.max(0, noAnswer + (calls - used));

    days.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      iso: d.toISOString().slice(0, 10),
      calls,
      noAnswer: fixedNoAnswer,
      wrongNumber,
      absent,
      callbackWait,
      prospect,
      materialSent,
      receptionNG,
      keymanNG,
      appointment,
    });
    if (days.length >= 15) break;
  }
  return days;
}

export const DAILY_DATA: DayMetrics[] = generateDailyData();

// 派生指標を付与 -----------------------------------------------------
export function withDerived(d: DayMetrics): AggMetrics {
  const keymanContact =
    d.prospect + d.materialSent + d.keymanNG + d.appointment;
  return {
    ...d,
    keymanContact,
    keymanContactRate: d.calls ? keymanContact / d.calls : 0,
    apoRateCalls: d.calls ? d.appointment / d.calls : 0,
    apoRateKeyman: keymanContact ? d.appointment / keymanContact : 0,
  };
}

function emptyDay(date: string, iso: string): DayMetrics {
  return {
    date, iso, calls: 0, noAnswer: 0, wrongNumber: 0, absent: 0,
    callbackWait: 0, prospect: 0, materialSent: 0, receptionNG: 0,
    keymanNG: 0, appointment: 0,
  };
}

function sumDays(label: string, iso: string, group: DayMetrics[]): DayMetrics {
  return group.reduce((acc, d) => {
    acc.calls += d.calls;
    acc.noAnswer += d.noAnswer;
    acc.wrongNumber += d.wrongNumber;
    acc.absent += d.absent;
    acc.callbackWait += d.callbackWait;
    acc.prospect += d.prospect;
    acc.materialSent += d.materialSent;
    acc.receptionNG += d.receptionNG;
    acc.keymanNG += d.keymanNG;
    acc.appointment += d.appointment;
    return acc;
  }, emptyDay(label, iso));
}

// ISO週番号でグルーピング
function isoWeekKey(iso: string): string {
  const d = new Date(iso);
  const day = (d.getDay() + 6) % 7; // 月=0
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  return monday.toISOString().slice(0, 10);
}

export function getSeries(mode: PeriodMode): AggMetrics[] {
  if (mode === 'daily') {
    return DAILY_DATA.map(withDerived);
  }
  if (mode === 'weekly') {
    const buckets = new Map<string, DayMetrics[]>();
    for (const d of DAILY_DATA) {
      const k = isoWeekKey(d.iso);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(d);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, group]) => {
        const m = new Date(k);
        const label = `${m.getMonth() + 1}/${m.getDate()}週`;
        return withDerived(sumDays(label, k, group));
      });
  }
  // monthly
  const buckets = new Map<string, DayMetrics[]>();
  for (const d of DAILY_DATA) {
    const k = d.iso.slice(0, 7); // YYYY-MM
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(d);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, group]) => {
      const label = `${Number(k.slice(5, 7))}月`;
      return withDerived(sumDays(label, k + '-01', group));
    });
}

export function getTotals(mode: PeriodMode): AggMetrics {
  const series = getSeries(mode);
  const total = sumDays('合計', '', series);
  return withDerived(total);
}

// 担当者別ランキング（デモ）------------------------------------------
export function getRepRanking(): RepMetrics[] {
  const total = getTotals('daily');
  const names = ['真田 悠斗', '佐藤 玲奈', '田中 健', '鈴木 美咲', '高橋 翔'];
  const weights = [0.27, 0.23, 0.20, 0.17, 0.13];
  const rand = mulberry32(777);
  return names
    .map((name, i) => {
      const calls = Math.round(total.calls * weights[i]);
      const keymanContact = Math.round(total.keymanContact * weights[i] * (0.85 + rand() * 0.3));
      const appointment = Math.round(total.appointment * weights[i] * (0.8 + rand() * 0.5));
      return {
        name,
        calls,
        keymanContact,
        appointment,
        apoRate: calls ? appointment / calls : 0,
      };
    })
    .sort((a, b) => b.appointment - a.appointment);
}

// 直近アポ獲得リスト（リストシートのサンプル）------------------------
export interface RecentApo {
  company: string;
  industry: string;
  rep: string;
  date: string;
  status: 'アポ獲得' | '見込み' | '資料送付';
}

export const RECENT_ACTIVITY: RecentApo[] = [
  { company: 'ＳＯＤＡ株式会社', industry: '英会話スクール', rep: '真田 悠斗', date: '2/26', status: 'アポ獲得' },
  { company: '株式会社川久', industry: '学習塾', rep: '佐藤 玲奈', date: '2/26', status: 'アポ獲得' },
  { company: 'ステップフォワード株式会社', industry: '学習塾', rep: '田中 健', date: '2/25', status: '見込み' },
  { company: 'Ａｚａｌｅａ Ｇｒｏｕｐ株式会社', industry: '英会話スクール', rep: '鈴木 美咲', date: '2/25', status: 'アポ獲得' },
  { company: '株式会社タイム・イングリッシュ・スクール', industry: '英会話スクール', rep: '高橋 翔', date: '2/24', status: '資料送付' },
  { company: '株式会社スマイルカルチャー', industry: '学習塾', rep: '真田 悠斗', date: '2/24', status: '見込み' },
  { company: '合同会社ラウル英会話教室', industry: '英会話スクール', rep: '佐藤 玲奈', date: '2/23', status: 'アポ獲得' },
  { company: '株式会社フライト', industry: '教養・技能教授', rep: '田中 健', date: '2/23', status: '資料送付' },
];
