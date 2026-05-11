/**
 * AI CGO (Chief Growth Officer) – Google Apps Script 版
 *
 * 合同会社U-Speak Labの営業活動データを隔週で分析し、
 * Slack に戦略提言を投稿する。
 *
 * 使い方:
 *   1) スプレッドシートを開く
 *   2) 拡張機能 → Apps Script
 *   3) このコード全体をエディタに貼り付けて保存
 *   4) エディタ上で関数 `setupSecrets` を1回だけ実行
 *      （ANTHROPIC_API_KEY / SLACK_WEBHOOK_URL の入力を求められる）
 *   5) 関数 `testRun` を1回実行して Slack に届くことを確認
 *   6) 関数 `createBiweeklyTriggers` を1回実行
 *      → 毎月1日と15日 09:00 JST に自動投稿
 *
 * 必要な認証情報（PropertiesService に保存される、コードに直書きしない）:
 *   - ANTHROPIC_API_KEY    Anthropic Console で発行
 *   - SLACK_WEBHOOK_URL    Slack Incoming Webhook で発行
 *
 * 拡張予定 (TODO):
 *   - TODO: AI CFO 連携（MRR・解約率データ統合）
 *   - TODO: 音声データ連携（Notta → Drive → このパイプライン）
 *   - TODO: メールDM文案の自動生成機能
 *   - TODO: 競合動向の自動Web監視
 */

// ============================================================
// 設定
// ============================================================
const CONFIG = {
  SHEET_NAME: '営業活動ログ',
  ANALYSIS_PERIOD_DAYS: 14,
  MIN_DATA_COUNT: 10,
  CLAUDE_MODEL: 'claude-sonnet-4-5',
  CLAUDE_MAX_TOKENS: 4000,
  TIMEZONE: 'Asia/Tokyo',
};

// シートの列順（A〜O）
const COLUMNS = [
  'approach_date',    // A: アプローチ日
  'company',          // B: 企業名
  'industry',         // C: 業種
  'region',           // D: 地域
  'size',             // E: 規模
  'contact_name',     // F: 担当者名
  'title',            // G: 役職
  'approach_method',  // H: アプローチ方法
  'message',          // I: 件名/メッセージ
  'status',           // J: ステータス
  'reply_date',       // K: 返信日
  'appointment_date', // L: アポ日
  'lost_reason',      // M: 失注理由
  'next_action',      // N: 次アクション
  'notes',            // O: 備考
];


// ============================================================
// セットアップ用関数（1回だけ実行）
// ============================================================

/** API キーと Webhook URL を Script Properties に保存する */
function setupSecrets() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();

  const k = ui.prompt('Anthropic API Key', 'sk-ant- で始まるキーを貼り付け', ui.ButtonSet.OK_CANCEL);
  if (k.getSelectedButton() !== ui.Button.OK) return;
  props.setProperty('ANTHROPIC_API_KEY', k.getResponseText().trim());

  const s = ui.prompt('Slack Webhook URL', 'https://hooks.slack.com/services/... を貼り付け', ui.ButtonSet.OK_CANCEL);
  if (s.getSelectedButton() !== ui.Button.OK) return;
  props.setProperty('SLACK_WEBHOOK_URL', s.getResponseText().trim());

  ui.alert('保存完了', '次は testRun() を実行してSlackに届くか確認してください。', ui.ButtonSet.OK);
}

/** 毎月1日と15日 9:00 に自動実行するトリガーを作成する */
function createBiweeklyTriggers() {
  // 既存の同名トリガーを削除
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'runBiweeklyReport') ScriptApp.deleteTrigger(t);
  });
  // 1日と15日にそれぞれ作成
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

    Logger.log('Step 3/4: Claude 分析');
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
// Claude API
// ============================================================

const SYSTEM_PROMPT = `あなたはB2B SaaS企業のChief Growth Officer（CGO）です。
合同会社U-Speak Labの営業データを分析し、CEOに対して戦略提言を行います。

判断基準：
- 数字とファクトに基づく
- 「次の2週間で何をすべきか」を明確に提示
- 抽象論ではなく具体的なアクションを提案
- ROIを意識した優先順位付け
- 直近データだけでなく、累計データとの比較で構造を見抜く

トーン：簡潔・断定的・創業者目線・データで語る（「〜かもしれません」禁止）

必ず以下のJSON形式のみで出力すること。前後に説明文や \`\`\` は付けない。

{
  "summary": "3行要約（改行区切り）",
  "kpi": {
    "approach_count": 数値,
    "reply_rate": "12%",
    "appointment_rate": "4%",
    "vs_previous_period": "+15%"
  },
  "insights": ["インサイト1", "..."],
  "actions": ["打ち手1", "..."],
  "warnings": ["警告（なければ空配列）"]
}`;

function callClaude(recent, allTime) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 未設定。setupSecrets() を実行してください。');

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - CONFIG.ANALYSIS_PERIOD_DAYS);
  const fmt = d => Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd');

  // 累計データはトークン削減のため構造的な列だけに圧縮
  const compactAll = allTime.map(r => ({
    approach_date: r.approach_date,
    industry: r.industry,
    region: r.region,
    size: r.size,
    approach_method: r.approach_method,
    status: r.status,
    lost_reason: r.lost_reason,
  }));

  const userPrompt =
    `以下は合同会社U-Speak Labの過去2週間の営業活動データです。\n\n` +
    `【期間】${fmt(start)} 〜 ${fmt(end)}\n\n` +
    `【直近${CONFIG.ANALYSIS_PERIOD_DAYS}日間のデータ（${recent.length}件）】\n` +
    `${JSON.stringify(recent, null, 2)}\n\n` +
    `【累計データ（${allTime.length}件）】\n` +
    `${JSON.stringify(compactAll, null, 2)}\n\n` +
    `【コンテキスト】\n` +
    `- 営業代行（月10万円）を5/18から稼働開始\n` +
    `- ターゲット：英会話教室・学習塾（生徒50〜300名規模）\n` +
    `- KGI: 3ヶ月で30社契約獲得、MRR 300万円\n` +
    `- 主要競合：Lepton、ECCジュニア、ペッピーキッズ等\n\n` +
    `このデータを分析し、指定のJSON形式で出力してください。`;

  const payload = {
    model: CONFIG.CLAUDE_MODEL,
    max_tokens: CONFIG.CLAUDE_MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  };

  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  if (code !== 200) throw new Error(`Claude API ${code}: ${res.getContentText()}`);

  const body = JSON.parse(res.getContentText());
  const text = (body.content || []).map(c => c.text || '').join('');
  return parseClaudeJson(text);
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
// Slack
// ============================================================

function postReportToSlack(analysis, recent) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - CONFIG.ANALYSIS_PERIOD_DAYS);
  const fmt = d => Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd');

  const kpi = analysis.kpi || {};
  const insights = analysis.insights || [];
  const actions = analysis.actions || [];
  const warnings = analysis.warnings || [];
  const summary = analysis.summary || '';

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '📊 AI CGO 隔週レポート', emoji: true } },
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `*対象期間:* ${fmt(start)} 〜 ${fmt(end)}  |  *データ件数:* ${recent.length}件`
      }],
    },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: `*🎯 サマリー*\n${summary}` } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*📈 アプローチ数*\n${kpi.approach_count || '—'}` },
        { type: 'mrkdwn', text: `*💬 返信率*\n${kpi.reply_rate || '—'}` },
        { type: 'mrkdwn', text: `*📅 アポ獲得率*\n${kpi.appointment_rate || '—'}` },
        { type: 'mrkdwn', text: `*🔄 前期比*\n${kpi.vs_previous_period || '—'}` },
      ],
    },
  ];

  if (insights.length) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*💡 インサイト*\n' + insights.map(x => `• ${x}`).join('\n') },
    });
  }

  if (actions.length) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🚀 次の2週間で打つべき手*\n' + actions.map((a, i) => `${i + 1}. ${a}`).join('\n'),
      },
    });
  }

  if (warnings.length) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*⚠️ 警告* <!channel>\n' + warnings.map(w => `• ${w}`).join('\n') },
    });
  }

  const sheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `📎 <${sheetUrl}|元データを開く>` }],
  });

  const fallback = warnings.length
    ? '<!channel> 📊 AI CGO 隔週レポート'
    : '📊 AI CGO 隔週レポート';
  postSlackPayload({ text: fallback, blocks });
}

function postSimpleSlack(text) {
  postSlackPayload({ text });
}

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

/** Slack に「テスト送信成功」のメッセージを投げるだけ */
function testSlack() {
  postSimpleSlack('✅ AI CGO テスト送信成功（Slackルートは生きています）');
}

/** Claude を呼んで Slack にダミーレポートを投げる（シート不要） */
function testRun() {
  const dummy = [];
  for (let i = 0; i < 12; i++) {
    dummy.push({
      approach_date: '2026-05-0' + ((i % 9) + 1),
      company: `テスト企業${i + 1}`,
      industry: i % 2 ? '英会話教室' : '学習塾',
      region: i % 3 ? '東京' : '大阪',
      size: '50-100名',
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
function manualRun() {
  runBiweeklyReport();
}
