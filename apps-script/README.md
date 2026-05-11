# AI CGO – Google Apps Script 版（推奨）

Python 版（`uspeak-ai-cgo/`）よりセットアップが圧倒的に簡単。サービスアカウントも GitHub も不要。**3分**で完了する。

## なぜこちらが楽か

- ✅ サービスアカウント / Google Cloud Console 不要（スクリプトがシート所有者として動く）
- ✅ GitHub / GitHub Actions 不要（Apps Script のトリガーで定期実行）
- ✅ 必要な認証情報は **Anthropic API キー** と **Slack Webhook URL** のみ
- ✅ コード1ファイル

## セットアップ手順（3分）

1. **Anthropic API キーを発行**
   https://console.anthropic.com/settings/keys → Create Key →`sk-ant-…` をコピー

2. **Slack Incoming Webhook を発行**
   https://api.slack.com/apps → Create New App → From scratch → ワークスペース選択 → 作成後の画面で左メニュー **Incoming Webhooks** をクリック → トグルを **On** → 下の **Add New Webhook to Workspace** → 投稿先チャンネル（例: `#cgo-report`）選択 → Allow → 発行された `https://hooks.slack.com/services/…` をコピー

3. **スプレッドシートを準備**
   1枚目のシート名を `営業活動ログ` にする。1行目に列ヘッダー（A〜O）を入れる。

4. **Apps Script に貼り付け**
   スプレッドシート → 拡張機能 → Apps Script → 既存の `Code.gs` をすべて削除 → `apps-script/Code.gs` の中身をまるごと貼り付け → 💾保存（Ctrl/Cmd+S）

5. **シークレットを登録**
   関数選択ドロップダウンで `setupSecrets` を選び → ▶ 実行 → 初回は権限承認ダイアログが出るので承認 → ダイアログで API キーと Webhook URL を順に貼り付け

6. **動作確認**
   関数 `testRun` を実行 → Slack にダミーレポートが届くことを確認

7. **自動投稿を有効化**
   関数 `createBiweeklyTriggers` を実行 → 毎月1日と15日の **9:00 JST** に自動投稿される

## シートのスキーマ

| 列 | カラム名 | 型 | 例 |
|---|---|---|---|
| A | アプローチ日 | 日付 | 2026-05-18 |
| B | 企業名 | 文字列 | ツリーベル英語教室 |
| C | 業種 | 文字列 | 英会話教室 |
| D | 地域 | 文字列 | 東京 |
| E | 規模 | 文字列 | 50-300名 |
| F | 担当者名 | 文字列 | 山田太郎 |
| G | 役職 | 文字列 | 代表 |
| H | アプローチ方法 | 文字列 | メール / 電話 / フォーム |
| I | 件名/メッセージ | 文字列 | （送信文） |
| J | ステータス | 文字列 | 未返信 / 返信あり / アポ獲得 / 失注 |
| K | 返信日 | 日付 | 2026-05-20 |
| L | アポ日 | 日付 | 2026-05-25 |
| M | 失注理由 | 文字列 | 価格 / 既存ツール / 検討中 |
| N | 次アクション | 文字列 | 来週再アプローチ |
| O | 備考 | 文字列 | 自由記述 |

## 関数リファレンス

| 関数 | 用途 | 実行頻度 |
|---|---|---|
| `setupSecrets` | API キー / Webhook URL を Script Properties に保存 | 初回1回 |
| `createBiweeklyTriggers` | 毎月1日・15日 9:00 のトリガー作成 | 初回1回 |
| `testSlack` | Slack ルートのみ確認 | 任意 |
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
| プロンプト | `SYSTEM_PROMPT` 定数、`userPrompt` 組み立て箇所 |
| Slack ブロック | `postReportToSlack` |
| 実行スケジュール | `createBiweeklyTriggers` の `onMonthDay` / `atHour` |

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `setupSecrets` 実行時に「承認が必要」 | 表示される画面で許可。Apps Script は最初の実行で権限を要求する |
| Slack に届かない | `testSlack` で切り分け。Webhook URL の有効性を確認 |
| `Claude API 401` | API キーをローテートして `setupSecrets` を再実行 |
| `Claude API 400` の model 関連 | `CONFIG.CLAUDE_MODEL` を最新の Sonnet ID に更新 |
| `シート「営業活動ログ」が見つかりません` | シート名（タブ名）を `営業活動ログ` に変更、または `CONFIG.SHEET_NAME` を実際の名前に |
| データ不足通知ばかり来る | `CONFIG.MIN_DATA_COUNT` を下げる |
| 列が増えた | `COLUMNS` 配列を更新（順序が重要） |
| トリガーを止めたい | Apps Script エディタ左の「⏰トリガー」アイコン → 削除 |

## Python 版との併用

`uspeak-ai-cgo/` の Python 版はそのまま残してあります。Apps Script 版で運用しつつ、将来複雑なロジックや CFO 連携など重い処理が必要になったときに Python 版に切り替える、という二段構えにできます。
