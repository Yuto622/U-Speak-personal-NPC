"""Slack Incoming Webhook client.

Posts the CGO analysis as a Block Kit message. Failures during report
generation are reported with `send_error`.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

logger = logging.getLogger(__name__)


class SlackClient:
    """Minimal Slack Incoming Webhook wrapper."""

    def __init__(self, webhook_url: str | None = None, channel: str | None = None) -> None:
        self._webhook_url = webhook_url or os.environ["SLACK_WEBHOOK_URL"]
        self._channel = channel or os.environ.get("SLACK_CHANNEL")

    # ------------------------------------------------------------------ #
    # Public entry points
    # ------------------------------------------------------------------ #
    def send_report(
        self,
        analysis: dict[str, Any],
        recent_data: list[dict[str, Any]],
        sheet_url: str | None = None,
    ) -> None:
        """Post a structured CGO report built from `analysis`."""
        blocks = self._build_blocks(analysis, recent_data, sheet_url)
        warnings = analysis.get("warnings") or []
        text_fallback = "📊 AI CGO 隔週レポート"
        if warnings:
            text_fallback = "<!channel> " + text_fallback
        self._post({"text": text_fallback, "blocks": blocks})

    def send_simple_message(self, text: str) -> None:
        """Post a plain text message (used for data-insufficient notices)."""
        self._post({"text": text})

    def send_error(self, error: str) -> None:
        """Post an error notice so failures aren't silent."""
        self._post({"text": f"⚠️ AI CGO レポート生成失敗: {error}"})

    # ------------------------------------------------------------------ #
    # Internals
    # ------------------------------------------------------------------ #
    def _post(self, payload: dict[str, Any]) -> None:
        if self._channel:
            payload.setdefault("channel", self._channel)
        try:
            resp = requests.post(self._webhook_url, json=payload, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.error("Slack webhook failed: %s", e)
            raise

    def _build_blocks(
        self,
        analysis: dict[str, Any],
        recent_data: list[dict[str, Any]],
        sheet_url: str | None,
    ) -> list[dict[str, Any]]:
        end = _now_jst().date()
        start = end - timedelta(days=14)
        period = f"{start.isoformat()} 〜 {end.isoformat()}"

        kpi = analysis.get("kpi", {})
        insights = analysis.get("insights", []) or []
        actions = analysis.get("actions", []) or []
        warnings = analysis.get("warnings", []) or []
        summary = analysis.get("summary", "")

        blocks: list[dict[str, Any]] = [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": "📊 AI CGO 隔週レポート", "emoji": True},
            },
            {
                "type": "context",
                "elements": [{"type": "mrkdwn", "text": f"*対象期間:* {period}  |  *データ件数:* {len(recent_data)}件"}],
            },
            {"type": "divider"},
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*🎯 サマリー*\n{summary}"},
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*📈 アプローチ数*\n{kpi.get('approach_count', '—')}"},
                    {"type": "mrkdwn", "text": f"*💬 返信率*\n{kpi.get('reply_rate', '—')}"},
                    {"type": "mrkdwn", "text": f"*📅 アポ獲得率*\n{kpi.get('appointment_rate', '—')}"},
                    {"type": "mrkdwn", "text": f"*🔄 前期比*\n{kpi.get('vs_previous_period', '—')}"},
                ],
            },
        ]

        if insights:
            blocks.append({"type": "divider"})
            blocks.append(
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "*💡 インサイト*\n" + "\n".join(f"• {x}" for x in insights),
                    },
                }
            )

        if actions:
            blocks.append(
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "*🚀 次の2週間で打つべき手*\n"
                        + "\n".join(f"{i+1}. {a}" for i, a in enumerate(actions)),
                    },
                }
            )

        if warnings:
            blocks.append({"type": "divider"})
            blocks.append(
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "*⚠️ 警告* <!channel>\n" + "\n".join(f"• {w}" for w in warnings),
                    },
                }
            )

        if sheet_url:
            blocks.append({"type": "divider"})
            blocks.append(
                {
                    "type": "context",
                    "elements": [{"type": "mrkdwn", "text": f"📎 <{sheet_url}|元データを開く>"}],
                }
            )

        return blocks


def _now_jst() -> datetime:
    return datetime.now(timezone(timedelta(hours=9)))
