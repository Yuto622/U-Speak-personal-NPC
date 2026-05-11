"""Prompt templates for the AI CGO Claude analysis call."""

from __future__ import annotations

import json
from typing import Any

SYSTEM_PROMPT = """あなたはB2B SaaS企業のChief Growth Officer（CGO）です。
合同会社U-Speak Labの営業データを分析し、CEOに対して戦略提言を行います。

あなたの判断基準：
- 数字とファクトに基づく
- 「次の2週間で何をすべきか」を明確に提示
- 抽象論ではなく具体的なアクションを提案
- ROIを意識した優先順位付け
- 直近データだけでなく、累計データとの比較で構造を見抜く

提言のトーン：
- 簡潔・断定的（曖昧な「〜かもしれません」は禁止）
- 創業者目線（リソース有限を理解した現実的な提案）
- データで語る

出力フォーマット：
必ず以下のJSON形式のみで出力すること。前後に説明文や ``` を付けない。

{
  "summary": "3行要約（改行区切り）",
  "kpi": {
    "approach_count": 数値,
    "reply_rate": "12%",
    "appointment_rate": "4%",
    "vs_previous_period": "+15%"
  },
  "insights": ["インサイト1", "インサイト2", "..."],
  "actions": ["打ち手1", "打ち手2", "..."],
  "warnings": ["警告1（なければ空配列）"]
}
"""


USER_PROMPT_TEMPLATE = """以下は合同会社U-Speak Labの過去2週間の営業活動データです。

【期間】{start_date} 〜 {end_date}

【直近{period_days}日間のデータ（{recent_count}件）】
{recent_data_json}

【累計データ（{all_count}件）】
{all_time_data_json}

【コンテキスト】
- 営業代行（月10万円）を5/18から稼働開始
- ターゲット：英会話教室・学習塾（生徒50〜300名規模）
- KGI: 3ヶ月で30社契約獲得、MRR 300万円
- 主要競合：Lepton、ECCジュニア、ペッピーキッズ等

このデータを分析し、指定のJSON形式で出力してください。
"""


def build_user_prompt(
    recent: list[dict[str, Any]],
    all_time: list[dict[str, Any]],
    start_date: str,
    end_date: str,
    period_days: int = 14,
) -> str:
    """Render the user prompt with the given data."""
    return USER_PROMPT_TEMPLATE.format(
        start_date=start_date,
        end_date=end_date,
        period_days=period_days,
        recent_count=len(recent),
        all_count=len(all_time),
        recent_data_json=json.dumps(recent, ensure_ascii=False, indent=2),
        all_time_data_json=json.dumps(_compact_all_time(all_time), ensure_ascii=False, indent=2),
    )


def _compact_all_time(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Trim the cumulative dataset to keep token usage low.

    Keeps only the fields useful for structural comparison (drops free-text
    fields like message/notes which dominate token count).
    """
    keep = {
        "approach_date",
        "industry",
        "region",
        "size",
        "approach_method",
        "status",
        "lost_reason",
    }
    return [{k: v for k, v in row.items() if k in keep} for row in rows]
