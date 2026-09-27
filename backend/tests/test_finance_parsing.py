"""Tests for the finance CSV parsers.

The parsers are the layer most likely to break silently: a mis-parsed amount
still looks like a number, it is just the wrong one.
"""

import pytest

from routers import finance


class TestParseValue:
    def test_plain_float(self):
        assert finance._parse_value("1234.56") == 1234.56

    def test_currency_suffix(self):
        assert finance._parse_value("1434943 JPY") == 1434943.0
        assert finance._parse_value("12.5 EUR") == 12.5

    def test_thousands_separators(self):
        assert finance._parse_value("1,234,567") == 1234567.0

    def test_unit_suffix_from_crypto_export(self):
        assert finance._parse_value("0.00846247 BTC") == pytest.approx(0.00846247)

    def test_negative_amount(self):
        assert finance._parse_value("-40000 JPY") == -40000.0

    def test_unparseable(self):
        assert finance._parse_value("") is None
        assert finance._parse_value("n/a") is None

    def test_multi_currency_cell_is_unparseable_scalar(self):
        # _parse_value is a scalar parser. "127.00 EUR, 6864 JPY" is not a number,
        # which is exactly why _read_cashflow_csv falls back to _split_multi_currency
        # instead of silently keeping one of the two amounts.
        assert finance._parse_value("127.00 EUR, 6864 JPY") is None


class TestSplitMultiCurrency:
    def test_splits_both_amounts(self):
        parts = finance._split_multi_currency("127.0000000000000000000 EUR, 6864 JPY")
        assert [v for _, v in parts] == [127.0, 6864.0]

    def test_negative_second_amount(self):
        parts = finance._split_multi_currency("23.62 EUR, -22000 JPY")
        assert [v for _, v in parts] == [23.62, -22000.0]

    def test_single_amount_returns_none(self):
        assert finance._split_multi_currency("300611 JPY") is None

    def test_unparseable_returns_none(self):
        assert finance._split_multi_currency("") is None


class TestSimpleCsv:
    def test_bank_savings(self, monkeypatch, finance_dir):
        monkeypatch.setattr(finance, "FINANCE_DATA_DIR", str(finance_dir))
        rows = finance._read_simple_csv("bank_savings.csv", value_col="balance")

        accounts = [r["account"] for r in rows]
        assert accounts[0] == "assets:bank:everyday"
        assert "total" in accounts

        everyday = rows[0]
        assert everyday["balance"] == 3420.55
        assert everyday["raw"] == "3420.55 EUR"

        jpy = next(r for r in rows if r["account"] == "assets:bank:jpy")
        assert jpy["balance"] == 482000.0

    def test_missing_file_raises_404(self, monkeypatch, finance_dir):
        from fastapi import HTTPException

        monkeypatch.setattr(finance, "FINANCE_DATA_DIR", str(finance_dir))
        try:
            finance._read_simple_csv("does-not-exist.csv")
        except HTTPException as exc:
            assert exc.status_code == 404
        else:
            raise AssertionError("expected HTTPException")


class TestCashflowCsv:
    def test_single_month_emits_one_row_per_currency(self, monkeypatch, finance_dir):
        monkeypatch.setattr(finance, "FINANCE_DATA_DIR", str(finance_dir))
        rows = finance._read_cashflow_csv("last_month.csv")

        contracting = [r for r in rows if r["account"] == "income:contracting"]
        assert len(contracting) == 2, "a two-currency cell must yield two rows"
        assert {r["amount"] for r in contracting} == {127.0, 6864.0}

        # Section headers, the totals and the Net line are not line items.
        assert not any(r["account"] in ("Revenues", "Expenses", "total", "Net:") for r in rows)
        assert max(r["amount"] for r in rows) > 0

    def test_multi_month_keeps_raw_cells(self, monkeypatch, finance_dir):
        monkeypatch.setattr(finance, "FINANCE_DATA_DIR", str(finance_dir))
        rows = finance._read_cashflow_csv("monthly_income.csv", all_months=True)

        months = [k for k in rows[0] if k != "account"]
        assert len(months) == 12
        assert months == sorted(months)
        assert months[0].endswith("-09")

        accounts = {r["account"] for r in rows}
        assert {"income:salary", "expenses:rent"} <= accounts
        assert "total" not in accounts and "Net:" not in accounts

        contracting = next(r for r in rows if r["account"] == "income:contracting")
        assert any("EUR, " in str(v) and "JPY" in str(v) for v in contracting.values())

    def test_short_file_returns_empty(self, monkeypatch, tmp_path):
        path = tmp_path / "tiny.csv"
        path.write_text('"Account","Jan"\n', encoding="utf-8")
        monkeypatch.setattr(finance, "FINANCE_DATA_DIR", str(tmp_path))
        assert finance._read_cashflow_csv("tiny.csv") == []


class TestWatchlistConfig:
    def test_every_symbol_has_a_currency(self):
        for etf in finance.ETF_WATCHLIST:
            assert etf["symbol"] in finance.ETF_CURRENCIES, etf["symbol"]

    def test_range_config_covers_the_periods_the_ui_offers(self):
        assert set(finance.ETF_RANGE_CONFIG) == {"24h", "1w", "1m", "6m", "1y", "all"}

