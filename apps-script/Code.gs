/**
 * AI CGO (Chief Growth Officer) – Google Apps Script 版
 *
 * 合同会社U-Speak Labの営業活動データを隔週で分析し、
 * 経営コンサルティングファーム品質の戦略提言を Slack に投稿する。
 *
 * 構成:
 *   Google Sheets → Claude Opus 4.7 (Extended Thinking)
 *                 → Slack Block Kit（リッチメッセージ）
 *
 * 使い方:
 *   1) スプレッドシートを開く
 *   2) 拡張機能 → Apps Script
 *   3) このコード全体をエディタに貼り付けて保存
 *   4) `setupSecrets` を1回だけ実行（API Key と Webhook URL を保存）
 *   5) `testRun` を実行して Slack に届くことを確認
 *   6) `createBiweeklyTriggers` を実行して毎月1日・15日 9:00 JST に自動投稿
 */

// ============================================================
// 設定
// ============================================================
const CONFIG = {
  SHEET_NAME: '営業活動ログ',
  ANALYSIS_PERIOD_DAYS: 14,
  MIN_DATA_COUNT: 10,
  CLAUDE_MODEL: 'claude-opus-4-7',
  CLAUDE_MAX_TOKENS: 16000,
  CLAUDE_THINKING_BUDGET: 8000,
  TIMEZONE: 'Asia/Tokyo',
};

// シートの列順（A〜O）
const COLUMNS = [
  'approach_date', 'company', 'industry', 'region', 'size',
  'contact_name', 'title', 'approach_method', 'message', 'status',
  'reply_date', 'appointment_date', 'lost_reason', 'next_action', 'notes',
];


// ============================================================
// セットアップ用関数
// ============================================================

function setupSecrets() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();

  const k = ui.prompt('Anthropic API Key', 'sk-ant- で始まるキーを貼り付け', ui.ButtonSet.OK_CANCEL);
  if (k.getSelectedButton() !== ui.Button.OK) return;
  props.setProperty('ANTHROPIC_API_KEY', k.getResponseText().trim());

  const s = ui.prompt('Slack Webhook URL', 'https://hooks.slack.com/services/... を貼り付け', ui.ButtonSet.OK_CANCEL);
  if (s.getSelectedButton() !== ui.Button.OK) return;
  props.setProperty('SLACK_WEBHOOK_URL', s.getResponseText().trim());

  ui.alert('保存完了', '次は testRun() を実行して Slack に届くか確認してください。', ui.ButtonSet.OK);
}

function createBiweeklyTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'runBiweeklyReport') ScriptApp.deleteTrigger(t);
  });
  [1, 15].forEach(day => {
    ScriptApp.newTrigger('runBiweeklyReport')
      .timeBased()
      .onMonthDay(day)
      .atHour(9)
      .inTimezone(CONFIG.TIMEZONE)
      .create();
  });
  SpreadsheetApp.getUi().alert('完了', '毎月1日・15日の9時に自動投稿されます。', SpreadsheetApp.getUi().ButtonSet.OK);
}


// ============================================================
// メインエントリポイント
// ============================================================

function runBiweeklyReport() {
  try {
    Logger.log('Step 1/4: シートからデータ取得');
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) throw new Error(`シート「${CONFIG.SHEET_NAME}」が見つかりません`);

    const allRows = readSheet(sheet);
    const recent = filterRecent(allRows, CONFIG.ANALYSIS_PERIOD_DAYS);

    Logger.log(`Step 2/4: データチェック (recent=${recent.length}, all=${allRows.length})`);
    if (recent.length < CONFIG.MIN_DATA_COUNT) {
      postSimpleSlack(
        `📊 今期のデータが不足しています（${recent.length}件 / 最低${CONFIG.MIN_DATA_COUNT}件）。次回のレポートまでデータを蓄積中です。`
      );
      return;
    }

    Logger.log('Step 3/4: Claude Opus 4.7 で深い分析');
    const analysis = callClaude(recent, allRows);

    Logger.log('Step 4/4: Slack 投稿');
    postReportToSlack(analysis, recent);

    Logger.log('✅ レポート送信完了');
  } catch (e) {
    Logger.log(`❌ エラー: ${e && e.stack ? e.stack : e}`);
    try { postSimpleSlack(`⚠️ AI CGO レポート生成失敗: ${e.message || e}`); } catch (_) {}
    throw e;
  }
}


// ============================================================
// シート読み取り
// ============================================================

function readSheet(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
  return values
    .filter(row => row[0])
    .map(row => {
      const obj = {};
      COLUMNS.forEach((col, i) => {
        let v = row[i];
        if (v instanceof Date) v = Utilities.formatDate(v, CONFIG.TIMEZONE, 'yyyy-MM-dd');
        obj[col] = String(v == null ? '' : v).trim();
      });
      return obj;
    });
}

function filterRecent(rows, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return rows.filter(r => {
    const d = parseDate(r.approach_date);
    return d && d >= cutoff;
  });
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(/\//g, '-'));
  return isNaN(d.getTime()) ? null : d;
}


// ============================================================
// Claude API（経営コンサル品質のプロンプト）
// ============================================================

const SYSTEM_PROMPT = `あなたはMcKinsey、BCG、Bain出身のChief Growth Officerです。
合同会社U-Speak Labの営業データを分析し、CEOに対して経営コンサルティングファーム
レベルの戦略提言書を作成します。

# 思考プロセス（必ず守る）
1. データを定量的に分解する（業種×地域×規模のクロス集計、ファネル各段階の歩留まり）
2. 仮説を立てる前に、まず観測された事実を列挙する
3. 各仮説には必ず数値根拠を紐づける（思い込み禁止）
4. 提言は Impact × Feasibility の2軸で評価し、優先順位を明示する
5. 累計データと直近データを必ず比較し、構造変化を見抜く

# 提言の判断基準
- 数字とファクトに基づく（「〜かもしれません」「〜と思われます」は禁止）
- 「次の2週間で何をすべきか」を明確に提示
- 抽象論ではなく具体的アクション
- ROIを意識した優先順位付け
- 創業者目線（リソース有限を理解した現実的提案）

# 必須要素
- Executive Summary（thesis を1段落で）
- Situation Analysis（ファネル、前期比較）
- Segment Deep-dive（業種・地域・規模の3軸）
- Hypothesis Tree（仮説 → 根拠 → 結論を3〜5本）
- Strategic Recommendations（Impact × Feasibility 評価付き）
- 30/60/90日アクションプラン（オーナー・KPI付き）
- Risks & Assumptions

# 出力フォーマット
必ず以下のJSON形式のみで出力すること。前後に説明文や \`\`\` を付けない。
率は小数（0.12）、delta は文字列（"+15%"）。

{
  "metadata": {
    "report_date": "YYYY-MM-DD",
    "period_start": "YYYY-MM-DD",
    "period_end": "YYYY-MM-DD",
    "title_suffix": "短い副題"
  },
  "executive_summary": {
    "thesis": "1段落（150〜250字）の主張",
    "headline_kpis": [
      {"label": "アプローチ数", "value": "50", "delta": "+15%", "context": "前期比"},
      {"label": "返信率", "value": "12%", "delta": "+2pt", "context": "前期比"},
      {"label": "アポ獲得率", "value": "4%", "delta": "+1pt", "context": "前期比"},
      {"label": "学習塾比率", "value": "40%", "delta": "+10pt", "context": "構成比"}
    ],
    "top_recommendations": ["最重要提言1", "最重要提言2", "最重要提言3"]
  },
  "situation_analysis": {
    "narrative": "現状構造を200〜400字で論述",
    "funnel": {
      "approach_count": 50, "reply_count": 6, "appointment_count": 2,
      "reply_rate": 0.12, "appointment_rate": 0.04,
      "appointment_conversion_from_reply": 0.33
    },
    "vs_previous_period": {
      "approach_delta_pct": "+15%",
      "reply_rate_delta_pt": "+2pt",
      "appointment_rate_delta_pt": "+1pt",
      "key_structural_change": "構造変化の説明"
    }
  },
  "segment_analysis": {
    "by_industry": [{"name": "学習塾", "count": 20, "reply_rate": 0.20, "appointment_rate": 0.08, "insight": "..."}],
    "by_region":   [{"name": "東京",   "count": 30, "reply_rate": 0.15, "appointment_rate": 0.05, "insight": "..."}],
    "by_size":     [{"name": "50-100名","count": 25, "reply_rate": 0.16, "appointment_rate": 0.04, "insight": "..."}],
    "cross_insights": ["業種×地域: 東京の学習塾が最高セグメント"]
  },
  "hypotheses": [
    {
      "id": "H1",
      "statement": "仮説の文",
      "evidence": ["数値根拠1", "数値根拠2"],
      "conclusion": "だから何をすべきか",
      "confidence": "High"
    }
  ],
  "recommendations": [
    {
      "id": "R1",
      "priority": 1,
      "title": "提言タイトル",
      "rationale": "理由（数値根拠付き）",
      "impact": "High",
      "feasibility": "High",
      "expected_outcome": "期待される結果（定量）"
    }
  ],
  "action_plan": {
    "day_30": [{"task": "...", "owner": "営業代行/CEO", "deadline": "MM/DD", "kpi": "..."}],
    "day_60": [{"task": "...", "owner": "...", "deadline": "MM/DD", "kpi": "..."}],
    "day_90": [{"task": "...", "owner": "...", "deadline": "MM/DD", "kpi": "..."}]
  },
  "risks": [
    {"id": "RISK1", "description": "...", "likelihood": "Medium", "impact": "Medium", "mitigation": "..."}
  ],
  "assumptions": ["前提1", "前提2"]
}`;

function callClaude(recent, allTime) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 未設定。setupSecrets() を実行してください。');

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - CONFIG.ANALYSIS_PERIOD_DAYS);
  const fmt = d => Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd');

  const compactAll = allTime.map(r => ({
    approach_date: r.approach_date, industry: r.industry, region: r.region,
    size: r.size, approach_method: r.approach_method, status: r.status,
    lost_reason: r.lost_reason,
  }));

  const userPrompt =
    `以下は合同会社U-Speak Labの過去${CONFIG.ANALYSIS_PERIOD_DAYS}日間の営業活動データです。\n\n` +
    `【期間】${fmt(start)} 〜 ${fmt(end)}\n\n` +
    `【直近${CONFIG.ANALYSIS_PERIOD_DAYS}日間のデータ（${recent.length}件）】\n` +
    `${JSON.stringify(recent, null, 2)}\n\n` +
    `【累計データ（${allTime.length}件、構造分析用に列を絞っています）】\n` +
    `${JSON.stringify(compactAll, null, 2)}\n\n` +
    `【会社コンテキスト】\n` +
    `- 事業: B2B SaaS（AI英会話学習サービス）\n` +
    `- フェーズ: 創業期、1人運営、5/18から営業代行（月10万円）稼働\n` +
    `- ターゲット: 英会話教室・学習塾（生徒50〜300名規模）\n` +
    `- KGI: 3ヶ月で30社契約獲得、MRR 300万円\n` +
    `- 主要競合: Lepton、ECCジュニア、ペッピーキッズ\n\n` +
    `【作業指示】\n` +
    `1. 累計データを業種×地域×規模で分解し構造を把握\n` +
    `2. 直近データと累計データを定量比較\n` +
    `3. ファネル各段階の歩留まりを計算\n` +
    `4. ボトルネックを特定、仮説を3〜5本立てる\n` +
    `5. 各仮説に数値根拠を紐づける\n` +
    `6. Impact × Feasibility で提言を優先順位付け\n` +
    `7. 30/60/90日プラン作成\n` +
    `8. リスクと前提を明示\n\n` +
    `経営コンサルティングファーム品質の戦略提言書を、指定のJSON形式で出力してください。`;

  const payload = {
    model: CONFIG.CLAUDE_MODEL,
    max_tokens: CONFIG.CLAUDE_MAX_TOKENS,
    thinking: { type: 'enabled', budget_tokens: CONFIG.CLAUDE_THINKING_BUDGET },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  };

  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  if (code !== 200) throw new Error(`Claude API ${code}: ${res.getContentText()}`);

  const body = JSON.parse(res.getContentText());
  const text = (body.content || []).map(c => c.text || '').join('');
  const analysis = parseClaudeJson(text);

  // metadata の補完
  const meta = analysis.metadata || (analysis.metadata = {});
  meta.report_date = meta.report_date || fmt(end);
  meta.period_start = meta.period_start || fmt(start);
  meta.period_end = meta.period_end || fmt(end);
  return analysis;
}

function parseClaudeJson(text) {
  const trimmed = String(text).trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced
    ? fenced[1]
    : trimmed.substring(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1);
  return JSON.parse(candidate);
}


// ============================================================
// Slack Block Kit レンダリング（経営コンサル成果物風）
// ============================================================

function postReportToSlack(analysis, recent) {
  const meta = analysis.metadata || {};
  const exec = analysis.executive_summary || {};
  const sit = analysis.situation_analysis || {};
  const seg = analysis.segment_analysis || {};
  const hyp = analysis.hypotheses || [];
  const recs = analysis.recommendations || [];
  const plan = analysis.action_plan || {};
  const risks = analysis.risks || [];
  const assumptions = analysis.assumptions || [];

  const sheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  const blocks = [];

  // ── 表紙 ──
  blocks.push({ type: 'header', text: { type: 'plain_text', text: '📊 AI CGO 戦略提言書', emoji: true } });
  if (meta.title_suffix) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `*${meta.title_suffix}*` }]
    });
  }
  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `📅 対象期間: *${meta.period_start || '—'}* 〜 *${meta.period_end || '—'}*  |  📋 データ件数: *${recent.length}件*  |  🤖 Claude Opus 4.7`
    }]
  });

  // ── Executive Summary ──
  blocks.push({ type: 'divider' });
  blocks.push({ type: 'header', text: { type: 'plain_text', text: '1️⃣  Executive Summary', emoji: true } });
  if (exec.thesis) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `> ${exec.thesis.replace(/\n/g, '\n> ')}` } });
  }

  // KPI ダッシュボード
  const kpis = (exec.headline_kpis || []).slice(0, 4);
  if (kpis.length) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*📊 KPI ダッシュボード*' } });
    blocks.push({
      type: 'section',
      fields: kpis.flatMap(k => [{
        type: 'mrkdwn',
        text: `*${k.label}*\n*${k.value}*  \`${k.delta || ''}\`\n_${k.context || ''}_`
      }]).slice(0, 10),
    });
  }

  // Top 3 提言
  if (exec.top_recommendations && exec.top_recommendations.length) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🎯 最重要提言（Top 3）*\n' + exec.top_recommendations.slice(0, 3)
          .map((r, i) => `*${i + 1}.* ${r}`).join('\n')
      }
    });
  }

  // ── Situation Analysis ──
  blocks.push({ type: 'divider' });
  blocks.push({ type: 'header', text: { type: 'plain_text', text: '2️⃣  現状分析（Situation Analysis）', emoji: true } });

  if (sit.narrative) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: sit.narrative } });
  }

  // ファネル（テキストバーで可視化）
  if (sit.funnel) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*🔻 セールスファネル*\n```' + renderFunnel(sit.funnel) + '```' }
    });
  }

  // 前期比較
  if (sit.vs_previous_period) {
    const v = sit.vs_previous_period;
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🔄 前期比較*\n' +
          `• アプローチ数: \`${v.approach_delta_pct || '—'}\`\n` +
          `• 返信率: \`${v.reply_rate_delta_pt || '—'}\`\n` +
          `• アポ率: \`${v.appointment_rate_delta_pt || '—'}\`\n` +
          (v.key_structural_change ? `\n📌 *主要構造変化:* ${v.key_structural_change}` : '')
      }
    });
  }

  // ── Segment Deep-dive ──
  blocks.push({ type: 'divider' });
  blocks.push({ type: 'header', text: { type: 'plain_text', text: '3️⃣  セグメント深掘り', emoji: true } });

  ['by_industry', 'by_region', 'by_size'].forEach((key, idx) => {
    const segments = seg[key] || [];
    if (!segments.length) return;
    const label = ['業種別', '地域別', '規模別'][idx];
    const lines = segments.map(s =>
      `• *${s.name}* — ${s.count || 0}件 | 返信率 \`${pct(s.reply_rate)}\` | アポ率 \`${pct(s.appointment_rate)}\`\n   _${s.insight || ''}_`
    );
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*🔍 ${label}*\n${lines.join('\n')}` }
    });
  });

  if (seg.cross_insights && seg.cross_insights.length) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🧬 クロスセグメント・インサイト*\n' +
          seg.cross_insights.map(c => `• ${c}`).join('\n')
      }
    });
  }

  // ── Hypothesis Tree ──
  if (hyp.length) {
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'header', text: { type: 'plain_text', text: '4️⃣  仮説と根拠（Hypothesis Tree）', emoji: true } });
    hyp.forEach(h => {
      const evidence = (h.evidence || []).map(e => `   ◦ ${e}`).join('\n');
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${h.id || 'H?'}: ${h.statement || ''}*  \`${h.confidence || ''}\`\n` +
            `📎 根拠:\n${evidence}\n` +
            `→ *結論:* ${h.conclusion || ''}`
        }
      });
    });
  }

  // ── Recommendations (Impact × Feasibility) ──
  if (recs.length) {
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'header', text: { type: 'plain_text', text: '5️⃣  戦略提言（Impact × Feasibility）', emoji: true } });

    // 2x2 マトリクス（テキスト版）
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '```' + renderMatrix(recs) + '```' }
    });

    // 各提言の詳細
    recs.sort((a, b) => (a.priority || 99) - (b.priority || 99)).forEach(r => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*#${r.priority || '?'}  ${r.id || ''}: ${r.title || ''}*\n` +
            `📊 Impact: \`${r.impact || '—'}\`  |  ⚡ Feasibility: \`${r.feasibility || '—'}\`\n` +
            `💡 *Rationale:* ${r.rationale || ''}\n` +
            `🎯 *Expected:* ${r.expected_outcome || ''}`
        }
      });
    });
  }

  // ── Action Plan ──
  if (plan.day_30 || plan.day_60 || plan.day_90) {
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'header', text: { type: 'plain_text', text: '6️⃣  アクションプラン（30/60/90日）', emoji: true } });
    ['day_30', 'day_60', 'day_90'].forEach((phase, i) => {
      const tasks = plan[phase] || [];
      if (!tasks.length) return;
      const label = ['🟢 直近30日', '🟡 直近60日', '🔴 直近90日'][i];
      const lines = tasks.map(t =>
        `• *${t.task || ''}*\n   👤 ${t.owner || '—'}  |  📅 ${t.deadline || '—'}  |  🎯 ${t.kpi || '—'}`
      );
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*${label}*\n${lines.join('\n')}` }
      });
    });
  }

  // ── Risks & Assumptions ──
  if (risks.length || assumptions.length) {
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'header', text: { type: 'plain_text', text: '7️⃣  リスクと前提', emoji: true } });

    if (risks.length) {
      const lines = risks.map(r =>
        `• *[${r.id || '?'}]* ${r.description || ''}\n` +
        `   発生確率: \`${r.likelihood || '—'}\`  |  影響度: \`${r.impact || '—'}\`\n` +
        `   🛡️ 緩和策: ${r.mitigation || ''}`
      );
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '*⚠️ 主要リスク* <!channel>\n' + lines.join('\n\n') }
      });
    }

    if (assumptions.length) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*📋 前提条件*\n' + assumptions.map(a => `• ${a}`).join('\n')
        }
      });
    }
  }

  // ── フッター ──
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `📎 <${sheetUrl}|元データを開く>` },
      { type: 'mrkdwn', text: `🤖 Generated by Claude Opus 4.7 (Extended Thinking)` },
    ]
  });

  // Slack は1メッセージ最大50ブロックなので、超えたら分割投稿
  const fallback = risks.length ? '<!channel> 📊 AI CGO 戦略提言書' : '📊 AI CGO 戦略提言書';
  postBlocksChunked(blocks, fallback);
}

function postBlocksChunked(blocks, fallback) {
  const MAX = 48;
  if (blocks.length <= MAX) {
    postSlackPayload({ text: fallback, blocks });
    return;
  }
  // 大きい場合は分割（区切りはdivider優先）
  let chunk = [];
  for (let i = 0; i < blocks.length; i++) {
    chunk.push(blocks[i]);
    if (chunk.length >= MAX - 2 && blocks[i].type === 'divider') {
      postSlackPayload({ text: fallback, blocks: chunk });
      Utilities.sleep(500);
      chunk = [];
    }
  }
  if (chunk.length) postSlackPayload({ text: fallback, blocks: chunk });
}


// ============================================================
// テキスト可視化ヘルパー
// ============================================================

function renderFunnel(f) {
  const a = Number(f.approach_count) || 0;
  const r = Number(f.reply_count) || 0;
  const p = Number(f.appointment_count) || 0;
  const maxV = Math.max(a, 1);
  const bar = n => '▰'.repeat(Math.round((n / maxV) * 20)) + '▱'.repeat(20 - Math.round((n / maxV) * 20));
  const rr = a ? `${(r / a * 100).toFixed(1)}%` : '—';
  const pr = a ? `${(p / a * 100).toFixed(1)}%` : '—';
  return [
    `アプローチ ${bar(a)} ${a}`,
    `返信       ${bar(r)} ${r}  (${rr})`,
    `アポ獲得   ${bar(p)} ${p}  (${pr})`,
  ].join('\n');
}

function renderMatrix(recs) {
  const score = { Low: 0, Medium: 1, High: 2 };
  // 行=Impact (High上)、列=Feasibility (High右)
  const grid = [[[], [], []], [[], [], []], [[], [], []]]; // [impactRow][feasibilityCol]
  recs.forEach(r => {
    const imp = score[r.impact] != null ? 2 - score[r.impact] : 1;
    const feas = score[r.feasibility] != null ? score[r.feasibility] : 1;
    grid[imp][feas].push(r.id || `R${r.priority || '?'}`);
  });
  const cell = arr => (arr.length ? arr.join(',').padEnd(10) : '·'.padEnd(10));
  const rows = [
    '             Feasibility →',
    '             Low        Medium     High',
    `Impact High  ${cell(grid[0][0])} ${cell(grid[0][1])} ${cell(grid[0][2])}`,
    `       Med   ${cell(grid[1][0])} ${cell(grid[1][1])} ${cell(grid[1][2])}`,
    `       Low   ${cell(grid[2][0])} ${cell(grid[2][1])} ${cell(grid[2][2])}`,
  ];
  return rows.join('\n');
}

function pct(v) {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}


// ============================================================
// Slack 投稿
// ============================================================

function postSimpleSlack(text) { postSlackPayload({ text }); }

function postSlackPayload(payload) {
  const url = PropertiesService.getScriptProperties().getProperty('SLACK_WEBHOOK_URL');
  if (!url) throw new Error('SLACK_WEBHOOK_URL 未設定。setupSecrets() を実行してください。');
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code !== 200) throw new Error(`Slack ${code}: ${res.getContentText()}`);
}


// ============================================================
// テスト用関数
// ============================================================

function testSlack() {
  postSimpleSlack('✅ AI CGO テスト送信成功（Slackルートは生きています）');
}

/** ダミーデータで Claude を呼び、Slackにフルレポートを投稿（実シート不要） */
function testRun() {
  const dummy = [];
  for (let i = 0; i < 14; i++) {
    dummy.push({
      approach_date: '2026-05-0' + ((i % 9) + 1),
      company: `テスト企業${i + 1}`,
      industry: i % 2 ? '英会話教室' : '学習塾',
      region: ['東京', '大阪', '名古屋'][i % 3],
      size: ['50-100名', '100-300名'][i % 2],
      contact_name: '担当者',
      title: '代表',
      approach_method: ['メール', '電話', 'フォーム'][i % 3],
      message: '提案',
      status: ['返信あり', '未返信', 'アポ獲得', '失注'][i % 4],
      reply_date: '', appointment_date: '',
      lost_reason: i % 4 === 3 ? '価格' : '',
      next_action: '', notes: '',
    });
  }
  const analysis = callClaude(dummy, dummy);
  Logger.log(JSON.stringify(analysis, null, 2));
  postReportToSlack(analysis, dummy);
}

/** 実シートに対して runBiweeklyReport() を手動実行 */
function manualRun() { runBiweeklyReport(); }
