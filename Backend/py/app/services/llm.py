"""
One entry point for text generation. Every AI feature runs on Groq's hosted models (app/services/groq_service.py),
so the API needs no local model server and runs the same on a laptop and on a small cloud instance.

  GROQ_API_KEY   required for AI features
  GROQ_MODEL     the assistant, summaries, claims and the patent analyser (default openai/gpt-oss-120b)

Pest Vision (GROQ_VISION_MODEL) and the news sorter (GROQ_NEWS_MODEL) call groq_service with their own models.
"""
import json
import re
from dataclasses import dataclass
from typing import Any, Optional

from app.services import groq_service as groq


class LLMUnavailable(RuntimeError):
    """The AI can't be used right now (no key, usage limit reached). Maps to HTTP 503."""


@dataclass
class LLMResult:
    text: str
    model: str
    tokens: int


async def status() -> dict:
    """Which provider and model answer, and whether they can right now."""
    g = await groq.groq_service.get_status()
    return {"provider": "groq", "model": groq.default_model(), "available": g["available"], "reason": g["reason"]}


async def complete(
    prompt: str,
    *,
    system: Optional[str] = None,
    max_tokens: int = 1024,
    temperature: float = 0.3,
    json_mode: bool = False,
    schema: Optional[dict] = None,
    timeout_ms: int = 180_000,
) -> LLMResult:
    """One answer from Groq. Raises LLMUnavailable when it can't be used.

    `schema`: a JSON schema the answer must follow (written into the system prompt).
    """
    s = await status()
    if not s["available"]:
        raise LLMUnavailable(f"The AI is unavailable: {s['reason']}")
    try:
        text = await groq.groq_service.chat(
            prompt=prompt, system=system, json_mode=json_mode, schema=schema, temperature=temperature,
            timeout_ms=timeout_ms, max_tokens=max(max_tokens, 1024),
        )
    except groq.GroqRateLimited as error:
        raise LLMUnavailable(str(error)) from error
    return LLMResult(text=text, model=s["model"], tokens=-(-len(text) // 4))


def parse_json(text: str) -> Any:
    """JSON from a model answer, tolerating a ```json fence or words around it."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.I)
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()
        match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", cleaned)
        if not match:
            raise ValueError("The AI answer was not valid JSON")
        return json.loads(match.group(0))
