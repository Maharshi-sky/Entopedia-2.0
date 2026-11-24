"""
Groq (hosted models, OpenAI-compatible API): every AI feature of the API runs through here.

Models come from the environment because Groq retires models often:

  GROQ_MODEL          assistant, summaries, claims      (default openai/gpt-oss-120b)
  GROQ_NEWS_MODEL     news sorting, many small calls    (default llama-3.1-8b-instant)
  GROQ_VISION_MODEL   Pest Vision, reads photos          (default qwen/qwen3.8-27b)

JSON answers use Groq's json_object mode (works on every model) with the schema written into the system
prompt, so a model without strict schema support still answers in the right shape.
"""
import asyncio
import json
import os
import re
from typing import Any, Optional

import httpx

from app.utils.logger import logger

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


def api_key() -> str:
    key = (os.getenv("GROQ_API_KEY") or "").strip()
    return "" if key.startswith("your_") else key


def default_model() -> str:
    return os.getenv("GROQ_MODEL") or "openai/gpt-oss-120b"


def news_model() -> str:
    return os.getenv("GROQ_NEWS_MODEL") or "llama-3.1-8b-instant"


def vision_model() -> str:
    return os.getenv("GROQ_VISION_MODEL") or "qwen/qwen3.8-27b"


class GroqRateLimited(RuntimeError):
    """Groq answered 429: the free tier's per-minute or per-day limit is used up."""


_THINK = re.compile(r"<think>[\s\S]*?</think>", re.I)


def _clean(text: str) -> str:
    """The answer without a reasoning block some models put before it."""
    return _THINK.sub("", text).strip()


def parse_json(raw: str) -> Any:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.I)
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()
        match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", cleaned)
        if not match:
            logger.error(f"Failed to parse JSON from Groq response: {raw[:400]}")
            raise RuntimeError("The AI returned invalid JSON")
        return json.loads(match.group(0))


def build_body(
    prompt: str,
    *,
    system: Optional[str],
    model: str,
    json_mode: bool,
    schema: Optional[dict],
    temperature: float,
    max_tokens: int,
    images: Optional[list[str]],
) -> dict:
    """The request body. `images` are base64 JPEG/PNG data without the data: prefix."""
    if schema:
        system = (system + "\n\n" if system else "") + f"Reply with JSON matching this schema: {json.dumps(schema)}"
    elif json_mode:
        system = (system + "\n\n" if system else "") + "Reply with JSON only."

    messages: list[dict[str, Any]] = []
    if system:
        messages.append({"role": "system", "content": system})
    if images:
        content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
        content += [{"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img}"}} for img in images]
        messages.append({"role": "user", "content": content})
    else:
        messages.append({"role": "user", "content": prompt})

    body: dict[str, Any] = {
        "model": model, "messages": messages, "temperature": temperature, "max_completion_tokens": max_tokens,
    }
    if json_mode or schema:
        body["response_format"] = {"type": "json_object"}
    if model.startswith("openai/gpt-oss"):
        body["reasoning_effort"] = "low"  # these think before answering; low keeps it fast and within limits
    return body


def _retry_after(res: httpx.Response) -> Optional[float]:
    try:
        return max(1.0, float(res.headers.get("retry-after", "")))
    except ValueError:
        return None


class GroqService:
    async def get_status(self) -> dict:
        key = api_key()
        return {
            "available": bool(key), "host": "api.groq.com", "defaultModel": default_model(),
            "reason": None if key else "GROQ_API_KEY is not set",
        }

    async def chat(
        self,
        prompt: str,
        system: Optional[str] = None,
        model: Optional[str] = None,
        json_mode: bool = False,
        schema: Optional[dict] = None,
        temperature: float = 0.2,
        timeout_ms: int = 120_000,
        images: Optional[list[str]] = None,
        max_tokens: int = 4096,
    ) -> str:
        key = api_key()
        if not key:
            raise RuntimeError("GROQ_API_KEY is not set")
        body = build_body(
            prompt, system=system, model=model or default_model(), json_mode=json_mode, schema=schema,
            temperature=temperature, max_tokens=max_tokens, images=images,
        )
        async with httpx.AsyncClient(timeout=timeout_ms / 1000) as client:
            for attempt in range(3):
                res = await client.post(GROQ_URL, json=body, headers={"Authorization": f"Bearer {key}"})
                if res.status_code != 429:
                    break
                # Per-minute limit: wait as long as Groq asks (if short) and try again. A daily limit asks
                # for longer, so it fails straight away.
                wait = _retry_after(res)
                if attempt == 2 or wait is None or wait > 20:
                    raise GroqRateLimited("The AI usage limit was reached; try again in a minute")
                logger.info(f"Groq rate limit on {body['model']}; retrying in {wait:.0f}s")
                await asyncio.sleep(wait)

        if res.status_code != 200:
            raise RuntimeError(f"Groq HTTP {res.status_code}: {res.text[:500]}")

        data = res.json()
        choice = (data.get("choices") or [{}])[0]
        return _clean(str((choice.get("message") or {}).get("content") or ""))

    async def chat_json(
        self,
        prompt: str,
        system: Optional[str] = None,
        model: Optional[str] = None,
        schema: Optional[dict] = None,
        temperature: float = 0.2,
        timeout_ms: int = 120_000,
        images: Optional[list[str]] = None,
    ) -> Any:
        raw = await self.chat(
            prompt=prompt, system=system, model=model, json_mode=True, schema=schema,
            temperature=temperature, timeout_ms=timeout_ms, images=images,
        )
        return parse_json(raw)


groq_service = GroqService()
