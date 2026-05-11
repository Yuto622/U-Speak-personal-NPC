# AI CGO (Chief Growth Officer)

合同会社U-Speak Labの「AI CGO」。営業代行が日次でGoogle Sheetsに書き込んだ営業活動データを、隔週月曜9:00 JSTに自動で分析し、Slackに「次の2週間の打ち手」をブロック形式で投稿する。人間の作業ゼロ。

```
Google Sheets ─→ Python (cgo_analyzer) ─→ Claude Sonnet 4 ─→ Slack #cgo-report
                       ▲
                  GitHub Actions (cron: 毎月1日・15日 09:00 JST)
```

---

## 30秒で読める概要

- **入力**: シート「営業活動ログ」に蓄積される B2B 営業データ（A〜O列）
- **処理**: 過去2週間の動向を累計データと比較し、Claudeが定量分析＋戦略提言
- **出力**: Slack に Block Kit で
  - 📊 ヘッダー・期間
  - 🎯 サマリー
  - 📈 KPI（アプローチ数 / 返信率 / アポ率 / 前期比）
  - 💡 インサイト
  - 🚀 次の2週間の打ち手
  - ⚠️ 警告（あれば `@channel` 通知）
  - 📎 元シートへのリンク
- **データ不足時**: 「データ蓄積中」の簡易メッセージを投稿してスキップ（Claude を呼ばない＝コスト0）
- **失敗時**: `⚠️ AI CGO レポート生成失敗: ...` を Slack に通知

Claude API のコールは **1ラン1回のみ**。`max_tokens=4000`、累計データは構造化に必要な列だけに圧縮済み。

---

## セットアップ（10分で完了）

### 必要な認証情報（事前取得物）

| # | 名前 | 取得先 |
|---|---|---|
| 1 | `ANTHROPIC_API_KEY` | https://console.anthropic.com/ |
| 2 | Google サービスアカウントの JSON 鍵 | Google Cloud Console |
| 3 | `SHEET_ID` | Google Sheets URL |
| 4 | `SLACK_WEBHOOK_URL` | https://api.slack.com/messaging/webhooks |

### Step 1: Google Cloud Console（3分）

1. https://console.cloud.google.com/ で新規プロジェクト作成（既存でも可）
2. 「APIとサービス」→「ライブラリ」→ **Google Sheets API** を有効化
3. 「IAMと管理」→「サービスアカウント」→ 新規作成（名前: `ai-cgo`）
4. 作成したアカウント →「鍵」→「鍵を追加」→ JSON でダウンロード（`credentials.json`）
5. JSON をbase64化:
   ```bash
   base64 -w 0 credentials.json  # Linux
   base64 -i credentials.json | tr -d '\n'  # macOS
   ```
   出力された文字列が `GOOGLE_CREDENTIALS_BASE64` の値。

### Step 2: Google Sheets を共有（30秒）

- 対象シートを開き、「共有」→ サービスアカウントのメールアドレス（`xxx@xxx.iam.gserviceaccount.com`）に **閲覧者** 権限を付与
- URL から `SHEET_ID` を抽出：`https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`
- シート1枚目のタブ名が `営業活動ログ` であることを確認（変えるなら `SHEET_RANGE` で指定）

### Step 3: Slack Incoming Webhook（2分）

1. https://api.slack.com/apps →「Create New App」→ From scratch
2. Features → **Incoming Webhooks** を ON
3. 「Add New Webhook to Workspace」→ 投稿先チャンネル（`#cgo-report`）を選択
4. 発行された Webhook URL を `SLACK_WEBHOOK_URL` に控える

### Step 4: Anthropic API キー（30秒）

- https://console.anthropic.com/ → API Keys → Create Key → 値を控える

### Step 5: GitHub Secrets を設定（2分）

リポジトリ → Settings → Secrets and variables → Actions → **New repository secret** で以下を登録：

| Secret 名 | 値 |
|---|---|
| `ANTHROPIC_API_KEY` | sk-ant-... |
| `SHEET_ID` | シートURLから抽出したID |
| `GOOGLE_CREDENTIALS_BASE64` | Step 1 で生成した base64 文字列 |
| `SLACK_WEBHOOK_URL` | Step 3 で発行したURL |
| `SLACK_CHANNEL` *(任意)* | `#cgo-report` |

### Step 6: 初回手動実行（2分）

リポジトリ → Actions → **AI CGO Biweekly Report** → Run workflow → ブランチ選択 → 実行。

Slack に `📊 AI CGO 隔週レポート` か、データ不足通知が届けば成功。

> **注意:** GitHub Actions のワークフロー定義は **リポジトリ直下** の `.github/workflows/biweekly_report.yml` も必要（同じ内容を `uspeak-ai-cgo/.github/workflows/` 配下にも参考用に置いている）。GitHub Actions はリポジトリ直下の `.github/workflows/` しか拾わないため、本リポジトリでは直下のファイルが実体。

---

## ローカル動作確認

```bash
cd uspeak-ai-cgo
pip install -r requirements.txt

# モックでスモークテスト（外部API不要）
python tests/test_analyzer.py
# または
pytest tests/

# 本番接続テスト（.env を作成してから）
cp .env.example .env
# .env を編集
python cgo_analyzer.py
```

---

## シートのスキーマ

シート名 `営業活動ログ`、A〜O列：

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
| I | 件名/メッセージ | 文字列 | 送信文 |
| J | ステータス | 文字列 | 未返信 / 返信あり / アポ獲得 / 失注 |
| K | 返信日 | 日付 | 2026-05-20 |
| L | アポ日 | 日付 | 2026-05-25 |
| M | 失注理由 | 文字列 | 価格 / 既存ツール / 検討中 |
| N | 次アクション | 文字列 | 来週再アプローチ |
| O | 備考 | 文字列 | 自由記述 |

1行目はヘッダー扱い。日付は `YYYY-MM-DD` か `YYYY/MM/DD` を許容。

---

## カスタマイズ

| 変更したいもの | 場所 |
|---|---|
| 分析期間（デフォルト14日） | env `ANALYSIS_PERIOD_DAYS` |
| 最低必要データ件数（デフォルト10） | env `MIN_DATA_COUNT` |
| シート範囲 | env `SHEET_RANGE`（例: `Sheet1!A:O`） |
| 投稿先チャンネル | env `SLACK_CHANNEL` |
| 分析プロンプト | `modules/prompts.py` |
| Slackブロックのレイアウト | `modules/slack_client.py::SlackClient._build_blocks` |
| 実行スケジュール | `.github/workflows/biweekly_report.yml` の `cron` |
| Claude モデル | `modules/claude_client.py::MODEL` |

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| Slack に何も来ない | Actions のログを確認。`SLACK_WEBHOOK_URL` の値、シートのサービスアカウント共有設定を再確認 |
| `HttpError 403` from Sheets | サービスアカウントのメールがシートに共有されているか確認 |
| `Claude returned non-JSON output` | `modules/prompts.py` の SYSTEM_PROMPT を強めるか、`max_tokens` を引き上げる |
| データ不足通知ばかり来る | `MIN_DATA_COUNT` を下げる、または営業データの蓄積を待つ |
| 列が増えた／減った | `modules/sheets_client.py::COLUMNS` を更新 |
| トークン超過 | `modules/prompts.py::_compact_all_time` でさらに列を間引く |

---

## ファイル構成

```
uspeak-ai-cgo/
├── README.md                      # このファイル
├── .env.example
├── .gitignore
├── requirements.txt
├── cgo_analyzer.py                # エントリポイント
├── modules/
│   ├── __init__.py
│   ├── sheets_client.py
│   ├── claude_client.py
│   ├── slack_client.py
│   └── prompts.py
├── tests/
│   └── test_analyzer.py
└── .github/workflows/biweekly_report.yml  # 参考用コピー
                                            # 実体はリポジトリ直下の .github/workflows/
```

---

## 拡張予定（コード内 TODO）

- AI CFO 連携（MRR・解約率データ統合）
- 音声データ連携（Notta → Drive → このパイプライン）
- メール DM 文案の自動生成機能
- 競合動向の自動 Web 監視
