"""Claude API client for sales analysis."""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from anthropic import Anthropic

from .prompts import SYSTEM_PROMPT, build_user_prompt

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 4000


class ClaudeClient:
    """Wraps a single Claude API call that produces the CGO analysis."""

    def __init__(self, api_key: str | None = None, model: str = MODEL) -> None:
        self._client = Anthropic(api_key=api_key or os.environ["ANTHROPIC_API_KEY"])
        self._model = model

    def analyze(
        self,
        current_period_data: list[dict[str, Any]],
        all_time_data: list[dict[str, Any]],
        period_days: int = 14,
    ) -> dict[str, Any]:
        """Run the analysis. Returns the parsed JSON dict from Claude.

        Raises ValueError if Claude returns something that cannot be parsed.
        """
        end_date = _now_jst().date()
        start_date = end_date - timedelta(days=period_days)
        user_prompt = build_user_prompt(
            recent=current_period_data,
            all_time=all_time_data,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
            period_days=period_days,
        )

        logger.info(
            "Calling Claude (model=%s, recent=%d, all_time=%d)",
            self._model,
            len(current_period_data),
            len(all_time_data),
        )

        response = self._client.messages.create(
            model=self._model,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        text = "".join(block.text for block in response.content if block.type == "text")
        logger.debug("Claude raw response: %s", text)
        return _parse_json(text)


def _parse_json(text: str) -> dict[str, Any]:
    """Best-effort extraction of the first JSON object from Claude's reply."""
    text = text.strip()
    # Strip code fences if Claude added them despite instructions.
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    else:
        # Otherwise grab from the first { to the last }.
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            text = text[start : end + 1]
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Claude returned non-JSON output: {e}\n---\n{text}") from e


def _now_jst() -> datetime:
    return datetime.now(timezone(timedelta(hours=9)))
