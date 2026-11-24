import os

import pytest

from app.news.classifier import ai_available, ai_sort, is_market_report, relevance_options, system_prompt
from app.news.types import NewsBrand, Story

BRAND = NewsBrand(name="All Out", about="SC Johnson's mosquito repellent brand in India", search_terms=["mosquito"], company="SC Johnson")
COMPANY_ROW = NewsBrand(name="Godrej Consumer Products", about="GCPL", search_terms=[], company=None)


def _story(title: str) -> Story:
    return Story(title=title, publisher="ET", url=title, published=None, query="q")


class TestSystemPrompt:
    def test_names_brand_company_and_categories(self):
        p = system_prompt(BRAND)
        assert "\"All Out\" (SC Johnson's mosquito repellent brand in India), made by SC Johnson." in p
        assert '"company"   the headline is about SC Johnson as a company' in p
        assert '"goes all out"' in p
        assert "market research press releases" in p
        assert "even a crime, accident or misuse involving it" in p
        assert '"stock market list"' in p

    def test_offers_company_only_for_a_brand_with_a_company(self):
        assert relevance_options(BRAND) == ["brand", "company", "related", "unrelated"]
        assert relevance_options(COMPANY_ROW) == ["brand", "related", "unrelated"]
        assert '"company"' not in system_prompt(COMPANY_ROW)


class TestAiSort:
    @pytest.mark.asyncio
    async def test_applies_verdicts_by_number_and_asks_for_json_schema(self, mocker):
        chat = mocker.patch(
            "app.news.classifier.groq_service.chat_json",
            return_value={
                "items": [
                    {"i": 0, "relevance": "brand", "category": "product launch"},
                    {"i": 1, "relevance": "unrelated", "category": "other"},
                    {"i": 2, "relevance": "maybe", "category": "nonsense"},
                    {"i": 9, "relevance": "brand", "category": "other"},
                ]
            },
        )
        items = [_story("All Out launches refill"), _story("Teams go all out"), _story("Mosquito repellent market grows")]
        assert await ai_sort(BRAND, items) is True
        assert [(i.relevance, i.category) for i in items] == [
            ("brand", "product launch"),
            ("unrelated", "other"),
            ("unrelated", "other"),  # invalid values fall back safely
        ]
        call_kwargs = chat.call_args_list[0].kwargs
        assert call_kwargs["temperature"] == 0
        assert call_kwargs["schema"] is not None
        assert call_kwargs["prompt"] == "0. All Out launches refill (ET)\n1. Teams go all out (ET)\n2. Mosquito repellent market grows (ET)"

    @pytest.mark.asyncio
    async def test_sends_headlines_in_batches(self, mocker):
        os.environ["NEWS_AI_BATCH_SIZE"] = "2"
        try:
            chat = mocker.patch("app.news.classifier.groq_service.chat_json", return_value={"items": []})
            await ai_sort(BRAND, [_story("a"), _story("b"), _story("c")])
            assert chat.call_count == 2
        finally:
            del os.environ["NEWS_AI_BATCH_SIZE"]

    @pytest.mark.asyncio
    async def test_reports_a_failed_batch_so_caller_sorts_by_keyword(self, mocker):
        mocker.patch("app.news.classifier.groq_service.chat_json", side_effect=RuntimeError("timeout"))
        items = [_story("All Out launches refill")]
        assert await ai_sort(BRAND, items) is False
        assert items[0].relevance is None


class TestAiAvailable:
    @pytest.mark.asyncio
    async def test_off_without_a_groq_key(self, monkeypatch):
        monkeypatch.delenv("GROQ_API_KEY", raising=False)
        result = await ai_available()
        assert result["ok"] is False
        assert result["reason"] == "GROQ_API_KEY is not set"

    @pytest.mark.asyncio
    async def test_on_with_a_key_and_uses_the_news_model(self, monkeypatch):
        monkeypatch.setenv("GROQ_API_KEY", "gsk_test")
        monkeypatch.setenv("GROQ_NEWS_MODEL", "openai/gpt-oss-20b")
        assert await ai_available() == {"ok": True, "model": "openai/gpt-oss-20b"}


@pytest.mark.parametrize(
    "title,expected",
    [
        ("Mosquito Racket Market Size, Share | Growth Forecast [2034]", True),
        ("Insect Repellent Market to grow at 6.1% CAGR", True),
        ("Household Insecticides Market Report 2026-2033", True),
        ("Godrej Consumer Q2 net profit rises 14%", False),
        ("All Out launches 45-night refill", False),
        ("Stock market today: Sensex falls", False),
    ],
)
def test_is_market_report(title, expected):
    assert is_market_report(title) is expected
