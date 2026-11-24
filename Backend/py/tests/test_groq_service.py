import httpx
import pytest

from app.news import classifier
from app.services import groq_service as groq
from app.services import llm


def _response(status: int, payload: dict | None = None, headers: dict | None = None) -> httpx.Response:
    return httpx.Response(status, json=payload or {}, headers=headers or {}, request=httpx.Request("POST", groq.GROQ_URL))


def _answer(content: str) -> httpx.Response:
    return _response(200, {"choices": [{"message": {"content": content}}]})


@pytest.fixture
def groq_env(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test")
    for name in ("GROQ_MODEL", "GROQ_NEWS_MODEL", "GROQ_VISION_MODEL"):
        monkeypatch.delenv(name, raising=False)


class TestBuildBody:
    def test_schema_goes_into_system_prompt_with_json_mode(self):
        body = groq.build_body("hi", system="Sort.", model="llama-3.1-8b-instant", json_mode=False,
                               schema={"type": "object"}, temperature=0, max_tokens=100, images=None)
        assert body["response_format"] == {"type": "json_object"}
        assert body["messages"][0]["content"].startswith("Sort.\n\nReply with JSON matching this schema:")
        assert "reasoning_effort" not in body

    def test_images_become_data_uris_and_gpt_oss_reasons_low(self):
        body = groq.build_body("Identify", system=None, model="openai/gpt-oss-120b", json_mode=False,
                               schema=None, temperature=0.1, max_tokens=100, images=["QUJD"])
        content = body["messages"][0]["content"]
        assert content[0] == {"type": "text", "text": "Identify"}
        assert content[1]["image_url"]["url"] == "data:image/jpeg;base64,QUJD"
        assert "response_format" not in body
        assert body["reasoning_effort"] == "low"


class TestChat:
    async def test_strips_reasoning_and_parses_json(self, groq_env, mocker):
        mocker.patch("httpx.AsyncClient.post", return_value=_answer('<think>hmm</think>```json\n{"a": 1}\n```'))
        assert await groq.groq_service.chat_json("q") == {"a": 1}

    async def test_retries_a_short_rate_limit_then_succeeds(self, groq_env, mocker):
        post = mocker.patch("httpx.AsyncClient.post", side_effect=[_response(429, headers={"retry-after": "1"}), _answer("ok")])
        sleep = mocker.patch("asyncio.sleep")
        assert await groq.groq_service.chat("q") == "ok"
        assert post.call_count == 2
        sleep.assert_awaited_once_with(1.0)

    async def test_long_rate_limit_fails_straight_away(self, groq_env, mocker):
        mocker.patch("httpx.AsyncClient.post", return_value=_response(429, headers={"retry-after": "3600"}))
        with pytest.raises(groq.GroqRateLimited):
            await groq.groq_service.chat("q")

    async def test_missing_key(self, monkeypatch):
        monkeypatch.setenv("GROQ_API_KEY", "your_groq_api_key")
        assert (await groq.groq_service.get_status())["available"] is False


class TestCallers:
    async def test_llm_complete_uses_groq(self, groq_env, mocker):
        mocker.patch("httpx.AsyncClient.post", return_value=_answer("Hello"))
        result = await llm.complete("hi")
        assert (result.text, result.model) == ("Hello", "openai/gpt-oss-120b")

    async def test_llm_rate_limit_is_unavailable(self, groq_env, mocker):
        mocker.patch("httpx.AsyncClient.post", return_value=_response(429))
        with pytest.raises(llm.LLMUnavailable):
            await llm.complete("hi")

    async def test_news_sorter_uses_groq_news_model(self, groq_env):
        assert classifier.news_model() == "llama-3.1-8b-instant"
        assert await classifier.ai_available() == {"ok": True, "model": "llama-3.1-8b-instant"}
