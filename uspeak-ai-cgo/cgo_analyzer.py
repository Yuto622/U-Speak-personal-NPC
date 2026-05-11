"""AI CGO biweekly report entrypoint.

Pulls the latest sales activity data from Google Sheets, asks Claude for a
strategic analysis, and posts the report to Slack. Designed to be run on a
GitHub Actions cron schedule (1st and 15th of every month, 09:00 JST).

Future extensions (TODO):
- TODO: AI CFO 連携（MRR・解約率データ統合）
- TODO: 音声データ連携（Notta → Drive → このパイプライン）
- TODO: メールDM文案の自動生成機能
- TODO: 競合動向の自動Web監視
"""

from __future__ import annotations

import logging
import os
import sys

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # python-dotenv is optional at runtime
    pass

from modules import ClaudeClient, SheetsClient, SlackClient

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("cgo_analyzer")


def main() -> int:
    period_days = int(os.environ.get("ANALYSIS_PERIOD_DAYS", "14"))
    min_data_count = int(os.environ.get("MIN_DATA_COUNT", "10"))

    # Slack is initialised first so we can use it to report bootstrap failures.
    try:
        slack = SlackClient()
    except KeyError as e:
        logger.error("Missing required env var: %s", e)
        return 1

    try:
        logger.info("Step 1/4: Fetching data from Google Sheets")
        sheets = SheetsClient()
        recent = sheets.fetch_recent_data(days=period_days)
        all_time = sheets.fetch_all_data()

        logger.info("Step 2/4: Checking data sufficiency (%d rows)", len(recent))
        if len(recent) < min_data_count:
            msg = (
                f"📊 今期のデータが不足しています（{len(recent)}件 / 最低{min_data_count}件）。"
                "次回のレポートまでデータを蓄積中です。"
            )
            slack.send_simple_message(msg)
            logger.info("Insufficient data; sent placeholder message")
            return 0

        logger.info("Step 3/4: Running Claude analysis")
        claude = ClaudeClient()
        analysis = claude.analyze(recent, all_time, period_days=period_days)

        logger.info("Step 4/4: Posting report to Slack")
        sheet_url = _sheet_url(os.environ.get("SHEET_ID"))
        slack.send_report(analysis, recent, sheet_url=sheet_url)

        logger.info("✅ レポート送信完了")
        return 0

    except Exception as e:  # noqa: BLE001 — top-level guard, report and exit
        logger.exception("AI CGO failed")
        try:
            slack.send_error(f"{type(e).__name__}: {e}")
        except Exception:  # noqa: BLE001
            logger.exception("Also failed to notify Slack")
        return 1


def _sheet_url(sheet_id: str | None) -> str | None:
    if not sheet_id:
        return None
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit"


if __name__ == "__main__":
    sys.exit(main())
