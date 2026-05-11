"""Google Sheets client for fetching sales activity data.

Reads from the spreadsheet defined by the SHEET_ID environment variable, using a
service account whose JSON key is provided base64-encoded in
GOOGLE_CREDENTIALS_BASE64.
"""

from __future__ import annotations

import base64
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
DEFAULT_RANGE = "営業活動ログ!A:O"

# Canonical column order expected in the sheet.
COLUMNS = [
    "approach_date",   # A: アプローチ日
    "company",         # B: 企業名
    "industry",        # C: 業種
    "region",          # D: 地域
    "size",            # E: 規模
    "contact_name",    # F: 担当者名
    "title",           # G: 役職
    "approach_method", # H: アプローチ方法
    "message",         # I: 件名/メッセージ
    "status",          # J: ステータス
    "reply_date",      # K: 返信日
    "appointment_date",# L: アポ日
    "lost_reason",     # M: 失注理由
    "next_action",     # N: 次アクション
    "notes",           # O: 備考
]


class SheetsClient:
    """Thin wrapper around the Google Sheets API v4."""

    def __init__(
        self,
        sheet_id: str | None = None,
        sheet_range: str | None = None,
        credentials_b64: str | None = None,
    ) -> None:
        self.sheet_id = sheet_id or os.environ["SHEET_ID"]
        self.sheet_range = sheet_range or os.environ.get("SHEET_RANGE", DEFAULT_RANGE)
        credentials_b64 = credentials_b64 or os.environ["GOOGLE_CREDENTIALS_BASE64"]

        info = json.loads(base64.b64decode(credentials_b64))
        creds = service_account.Credentials.from_service_account_info(
            info, scopes=SCOPES
        )
        self._service = build("sheets", "v4", credentials=creds, cache_discovery=False)

    def _fetch_rows(self) -> list[dict[str, str]]:
        """Fetch all rows and normalise to a list of dicts keyed by COLUMNS."""
        try:
            result = (
                self._service.spreadsheets()
                .values()
                .get(spreadsheetId=self.sheet_id, range=self.sheet_range)
                .execute()
            )
        except HttpError as e:
            logger.error("Google Sheets API error: %s", e)
            raise

        values: list[list[str]] = result.get("values", [])
        if not values:
            logger.warning("Sheet is empty: %s", self.sheet_range)
            return []

        # Drop header row if it looks like one.
        header = values[0]
        data_rows = values[1:] if _looks_like_header(header) else values

        rows: list[dict[str, str]] = []
        for raw in data_rows:
            # Pad short rows so missing trailing cells become empty strings.
            padded = list(raw) + [""] * (len(COLUMNS) - len(raw))
            rows.append({col: (padded[i] or "").strip() for i, col in enumerate(COLUMNS)})
        return rows

    def fetch_all_data(self) -> list[dict[str, str]]:
        """Return every data row from the sheet."""
        rows = self._fetch_rows()
        logger.info("Fetched %d total rows", len(rows))
        return rows

    def fetch_recent_data(self, days: int = 14) -> list[dict[str, str]]:
        """Return rows whose approach_date falls within the last `days` days (JST)."""
        rows = self._fetch_rows()
        cutoff = _now_jst().date() - timedelta(days=days)
        recent: list[dict[str, str]] = []
        for row in rows:
            d = _parse_date(row.get("approach_date", ""))
            if d is not None and d >= cutoff:
                recent.append(row)
        logger.info("Fetched %d rows in the last %d days", len(recent), days)
        return recent


def _looks_like_header(row: list[str]) -> bool:
    if not row:
        return False
    first = row[0].strip()
    # If the first column doesn't parse as a date, treat the row as a header.
    return _parse_date(first) is None


def _parse_date(value: Any) -> Any:
    if not value:
        return None
    s = str(value).strip().replace("/", "-")
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(s[: len(fmt) + 2], fmt).date()
        except ValueError:
            continue
    return None


def _now_jst() -> datetime:
    return datetime.now(timezone(timedelta(hours=9)))
