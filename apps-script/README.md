# AI CGO – Google Apps Script 版（コンサル品質 / Slack完結）

合同会社U-Speak Labの営業データを、隔週で **Claude Opus 4.7 + Extended Thinking** が深く分析し、McKinsey/BCG 風の戦略提言書を **Slack のリッチメッセージ**として投稿する。PDF や外部サービス不要、すべて Slack 内で読める。

## 何が出てくるか（Slack投稿の構成）

```
📊 AI CGO 戦略提言書
─────────────────────
1️⃣ Executive Summary
   • Thesis（主張1段落）
   • KPIダッシュボード（4指標）
   • 最重要提言 Top 3

2️⃣ 現状分析（Situation Analysis）
   • 構造分析の論述
   • セールスファネル（▰▱バー表示）
   • 前期比較

3️⃣ セグメント深掘り
   • 業種別 / 地域別 / 規模別
   • クロスセグメント・インサイト

4️⃣ 仮説と根拠（Hypothesis Tree）
   • 仮説 → 数値根拠 → 結論を 3〜5本

5️⃣ 戦略提言（Impact × Feasibility）
   • 2x2マトリクス（テキスト版）
   • 各提言: Rationale, Impact, Feasibility, Expected outcome

6️⃣ アクションプラン
   • 30/60/90日: タスク・オーナー・期限・KPI

7️⃣ リスクと前提
```

## なぜ Apps Script で済むか

- Sheets の中で動く → サービスアカウント不要
- Slack Webhook へ Block Kit を POST → Bot Token 不要
- Apps Script の時間ベーストリガー → GitHub Actions 不要
- 必要な認証情報は **2つだけ**: Anthropic API キーと Slack Webhook URL

## セットアップ（3分）

### 1. Anthropic API キーを発行
https://console.anthropic.com/settings/keys → Create Key → コピー

### 2. Slack Incoming Webhook を発行
https://api.slack.com/apps → アプリを開く → 左メニュー **Incoming Webhooks** → トグル **On** → Add New Webhook to Workspace → チャンネル選択 → Allow → URL をコピー

### 3. スプレッドシートを準備
1枚目のシート名を `営業活動ログ` に。1行目に A〜O のヘッダー：
`アプローチ日 / 企業名 / 業種 / 地域 / 規模 / 担当者名 / 役職 / アプローチ方法 / 件名 / ステータス / 返信日 / アポ日 / 失注理由 / 次アクション / 備考`

### 4. Apps Script に貼り付け
拡張機能 → Apps Script → 既存の `function myFunction() {}` を削除 → このリポジトリの `apps-script/Code.gs` を全文コピペ → 保存

### 5. シークレットを保存
関数選択で `setupSecrets` → ▶ 実行 → 権限承認 → ダイアログで API キーと Webhook URL を順に貼り付け

### 6. 動作確認
関数選択で `testRun` → ▶ 実行 → Slack にフルレポートが届くか確認

### 7. 自動投稿を有効化
関数選択で `createBiweeklyTriggers` → ▶ 実行 → 毎月1日と15日 9:00 JST に自動投稿

## 関数リファレンス

| 関数 | 用途 | 実行頻度 |
|---|---|---|
| `setupSecrets` | API キー / Webhook URL を保存 | 初回1回 |
| `createBiweeklyTriggers` | 毎月1日・15日 9:00 のトリガー作成 | 初回1回 |
| `testSlack` | Slack ルートのみ確認（API無料） | 任意 |
| `testRun` | ダミーデータで Claude→Slack の往復確認 | 任意 |
| `manualRun` | 実シートに対して即時実行 | 任意 |
| `runBiweeklyReport` | 本番ロジック（トリガーから呼ばれる） | 自動 |

## カスタマイズ

| 項目 | 場所 |
|---|---|
| 分析期間（デフォルト14日） | `CONFIG.ANALYSIS_PERIOD_DAYS` |
| 最低必要データ件数（デフォルト10） | `CONFIG.MIN_DATA_COUNT` |
| シート名 | `CONFIG.SHEET_NAME` |
| Claude モデル | `CONFIG.CLAUDE_MODEL` |
| Thinking バジェット | `CONFIG.CLAUDE_THINKING_BUDGET` |
| プロンプト | `SYSTEM_PROMPT` 定数 |
| Slack ブロック構成 | `postReportToSlack` |
| スケジュール | `createBiweeklyTriggers` の `onMonthDay` / `atHour` |

## コスト

- Claude Opus 4.7: 1回あたり概ね $0.10〜$0.30（Extended Thinking 含む）
- 月2回実行 → **月 $0.20〜$0.60**（誤差レベル）
- Apps Script: 無料
- Slack Webhook: 無料

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `setupSecrets` で「承認が必要」 | 表示画面で許可。Apps Script は最初の実行で権限要求 |
| Slack に届かない | `testSlack` で切り分け。Webhook URL の有効性を確認 |
| `Claude API 401` | API キーをローテートして `setupSecrets` 再実行 |
| `Claude API 400` (model) | `CONFIG.CLAUDE_MODEL` を最新の Opus ID に更新 |
| `シート「営業活動ログ」が見つかりません` | タブ名を `営業活動ログ` に変更、または `CONFIG.SHEET_NAME` を実名に |
| データ不足通知ばかり来る | `CONFIG.MIN_DATA_COUNT` を下げる |
| Slack が長すぎて切れる | コードは自動で50ブロック単位で分割投稿します |
| 列が増えた | `COLUMNS` 配列を更新（順序が重要） |
| トリガーを止めたい | Apps Script 左の「⏰トリガー」アイコン → 削除 |

## Python 版との関係

`uspeak-ai-cgo/` の Python 版（GitHub Actions + サービスアカウント）はそのまま残してあります。シンプル運用なら Apps Script、将来 BI 連携や PDF 出力など重い処理が必要になったら Python 版に切り替え可能。
