"""Smoke tests for the AI CGO pipeline using mock data.

Run:
    pytest tests/
or:
    python tests/test_analyzer.py    # standalone dry-run with mocks
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules.claude_client import _parse_json  # noqa: E402
from modules.prompts import build_user_prompt  # noqa: E402
from modules.slack_client import SlackClient  # noqa: E402


MOCK_RECENT = [
    {
        "approach_date": "2026-05-04",
        "company": "ツリーベル英語教室",
        "industry": "英会話教室",
        "region": "東京",
        "size": "50-100名",
        "contact_name": "山田太郎",
        "title": "代表",
        "approach_method": "メール",
        "message": "AI英会話学習のご提案",
        "status": "返信あり",
        "reply_date": "2026-05-06",
        "appointment_date": "",
        "lost_reason": "",
        "next_action": "資料送付",
        "notes": "",
    },
    {
        "approach_date": "2026-05-05",
        "company": "プラス学習塾",
        "industry": "学習塾",
        "region": "大阪",
        "size": "100-300名",
        "contact_name": "佐藤花子",
        "title": "教室長",
        "approach_method": "フォーム",
        "message": "AI英会話導入のご案内",
        "status": "アポ獲得",
        "reply_date": "2026-05-06",
        "appointment_date": "2026-05-11",
        "lost_reason": "",
        "next_action": "商談準備",
        "notes": "",
    },
]


MOCK_ALL_TIME = MOCK_RECENT + [
    {
        "approach_date": "2026-04-20",
        "company": "旧A社",
        "industry": "英会話教室",
        "region": "東京",
        "size": "50-100名",
        "contact_name": "",
        "title": "",
        "approach_method": "電話",
        "message": "",
        "status": "失注",
        "reply_date": "",
        "appointment_date": "",
        "lost_reason": "価格",
        "next_action": "",
        "notes": "",
    }
]


MOCK_CLAUDE_RESPONSE = {
    "summary": "返信率は12%、アポ獲得率4%。\n学習塾セグメントの反応が良い。\n価格訴求の見直しが必要。",
    "kpi": {
        "approach_count": 50,
        "reply_rate": "12%",
        "appointment_rate": "4%",
        "vs_previous_period": "+15%",
    },
    "insights": [
        "学習塾セグメントの返信率が英会話教室より20%高い",
        "東京エリアの反応率が地方の2倍",
    ],
    "actions": [
        "学習塾セグメントへ来週リソースを集中",
        "東京の50-100名規模を最優先ターゲットに設定",
        "価格訴求文を見直し、ROI訴求に切替",
    ],
    "warnings": ["失注理由TOP1に『価格』が浮上、料金訴求の見直しが急務"],
}


def test_parse_json_handles_code_fences() -> None:
    raw = '```json\n{"a": 1, "b": "x"}\n```'
    assert _parse_json(raw) == {"a": 1, "b": "x"}


def test_parse_json_handles_bare_object() -> None:
    raw = 'noise before {"a": 1} noise after'
    assert _parse_json(raw) == {"a": 1}


def test_build_user_prompt_renders_dates_and_counts() -> None:
    prompt = build_user_prompt(
        MOCK_RECENT, MOCK_ALL_TIME, "2026-04-27", "2026-05-11", period_days=14
    )
    assert "2026-04-27" in prompt
    assert "2026-05-11" in prompt
    assert "2件" in prompt or "件" in prompt


def test_slack_build_blocks_structure() -> None:
    client = SlackClient.__new__(SlackClient)
    client._webhook_url = "http://example.invalid"  # type: ignore[attr-defined]
    client._channel = None  # type: ignore[attr-defined]
    blocks = client._build_blocks(MOCK_CLAUDE_RESPONSE, MOCK_RECENT, "https://example.com")
    types = [b["type"] for b in blocks]
    assert "header" in types
    assert "section" in types
    assert any("⚠️ 警告" in (b.get("text", {}).get("text") or "") for b in blocks if b["type"] == "section")


def test_full_pipeline_with_mocks() -> None:
    """End-to-end dry run: mocks Sheets + Claude + Slack and ensures main() returns 0."""
    os.environ.setdefault("ANTHROPIC_API_KEY", "test")
    os.environ.setdefault("SHEET_ID", "test")
    os.environ.setdefault("GOOGLE_CREDENTIALS_BASE64", "test")
    os.environ.setdefault("SLACK_WEBHOOK_URL", "http://example.invalid")

    fake_sheets = MagicMock()
    fake_sheets.fetch_recent_data.return_value = MOCK_RECENT * 6  # 12 rows (above min)
    fake_sheets.fetch_all_data.return_value = MOCK_ALL_TIME * 6

    fake_claude = MagicMock()
    fake_claude.analyze.return_value = MOCK_CLAUDE_RESPONSE

    fake_slack = MagicMock()

    with patch("cgo_analyzer.SheetsClient", return_value=fake_sheets), patch(
        "cgo_analyzer.ClaudeClient", return_value=fake_claude
    ), patch("cgo_analyzer.SlackClient", return_value=fake_slack):
        import cgo_analyzer

        rc = cgo_analyzer.main()

    assert rc == 0
    fake_slack.send_report.assert_called_once()
    args, kwargs = fake_slack.send_report.call_args
    assert args[0] == MOCK_CLAUDE_RESPONSE


def test_pipeline_skips_when_data_insufficient() -> None:
    os.environ.setdefault("ANTHROPIC_API_KEY", "test")
    os.environ.setdefault("SHEET_ID", "test")
    os.environ.setdefault("GOOGLE_CREDENTIALS_BASE64", "test")
    os.environ.setdefault("SLACK_WEBHOOK_URL", "http://example.invalid")

    fake_sheets = MagicMock()
    fake_sheets.fetch_recent_data.return_value = MOCK_RECENT  # 2 rows < min 10
    fake_sheets.fetch_all_data.return_value = MOCK_ALL_TIME

    fake_claude = MagicMock()
    fake_slack = MagicMock()

    with patch("cgo_analyzer.SheetsClient", return_value=fake_sheets), patch(
        "cgo_analyzer.ClaudeClient", return_value=fake_claude
    ), patch("cgo_analyzer.SlackClient", return_value=fake_slack):
        import importlib

        import cgo_analyzer

        importlib.reload(cgo_analyzer)
        with patch("cgo_analyzer.SheetsClient", return_value=fake_sheets), patch(
            "cgo_analyzer.ClaudeClient", return_value=fake_claude
        ), patch("cgo_analyzer.SlackClient", return_value=fake_slack):
            rc = cgo_analyzer.main()

    assert rc == 0
    fake_claude.analyze.assert_not_called()
    fake_slack.send_simple_message.assert_called_once()


if __name__ == "__main__":
    # Standalone dry run for quick local smoke check.
    test_parse_json_handles_code_fences()
    test_parse_json_handles_bare_object()
    test_build_user_prompt_renders_dates_and_counts()
    test_slack_build_blocks_structure()
    test_full_pipeline_with_mocks()
    test_pipeline_skips_when_data_insufficient()
    print("✅ All dry-run tests passed")
    print(json.dumps(MOCK_CLAUDE_RESPONSE, ensure_ascii=False, indent=2))
