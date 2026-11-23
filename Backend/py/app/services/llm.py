"""
One entry point for text generation, so the whole API can move between providers with a setting:

  AI_PROVIDER=ollama      (default) the local Ollama server, model OLLAMA_MODEL (qwen2.5:7b)
  AI_PROVIDER=anthropic   Claude, model ANTHROPIC_MODEL, key ANTHROPIC_API_KEY

Features with their own model needs (Pest Vision's image model, the news sorter's OLLAMA_NEWS_MODEL)
call Ollama directly and are not switched by this setting.
"""
import json
import os
import re
from dataclasses import dataclass
from typing import Any, Optional

from app.services.ollama_service import DEFAULT_MODEL as OLLAMA_MODEL
from app.services.ollama_service import ollama_service


class LLMUnavailable(RuntimeError):
    """The configured provider can't be used right now (not running, no key). Maps to HTTP 503."""


@dataclass
class LLMResult:
    text: str
    model: str
    tokens: int


def provider() -> str:
    return (os.getenv("AI_PROVIDER") or "ollama").strip().lower()


def anthropic_model() -> str:
    return os.getenv("ANTHROPIC_MODEL") or "claude-opus-5-5"


async def status() -> dict:
    """Which provider and model answer, and whether they can right now."""
    if provider() == "anthropic":
        key = os.getenv("ANTHROPIC_API_KEY") or ""
        ok = bool(key) and not key.startswith("your_")
        return {"provider": "anthropic", "model": anthropic_model(), "available": ok,
                "reason": None if ok else "ANTHROPIC_API_KEY is not set"}
    s = await ollama_service.get_status()
    installed = any(m == OLLAMA_MODEL or m.startswith(f"{OLLAMA_MODEL.split(':')[0]}:") for m in s["models"])
    reason = None if s["available"] and installed else (
        f"Ollama is not reachable at {s['host']}" if not s["available"] else f"model {OLLAMA_MODEL} is not installed (ollama pull {OLLAMA_MODEL})"
    )
    return {"provider": "ollama", "model": OLLAMA_MODEL, "available": reason is None, "reason": reason}


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
    """One answer from the configured provider. Raises LLMUnavailable when it can't be reached.

    `schema`: a JSON schema the answer must follow (Ollama enforces it; Claude is told it).
    """
    if provider() == "anthropic":
        if schema:
            system = (system + "\n\n" if system else "") + f"The JSON must match this schema: {json.dumps(schema)}"
        return await _anthropic(prompt, system, max_tokens, temperature, json_mode or bool(schema))

    s = await status()
    if not s["available"]:
        raise LLMUnavailable(f"Local AI is unavailable: {s['reason']}. Start Ollama and try again.")
    text = await ollama_service.chat(
        prompt=prompt, system=system, json_mode=json_mode, schema=schema, temperature=temperature, timeout_ms=timeout_ms,
    )
    return LLMResult(text=text, model=OLLAMA_MODEL, tokens=-(-len(text) // 4))


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


async def _anthropic(prompt: str, system: Optional[str], max_tokens: int, temperature: float, json_mode: bool) -> LLMResult:
    s = await status()
    if not s["available"]:
        raise LLMUnavailable(f"Claude is unavailable: {s['reason']}")
    from app.services.anthropic_client import anthropic_client  # loaded only when Claude is chosen

    if json_mode:
        system = (system + "\n\n" if system else "") + "Reply with JSON only, no other text."
    kwargs: dict[str, Any] = {"model": s["model"], "max_tokens": max_tokens, "temperature": temperature,
                              "messages": [{"role": "user", "content": prompt}]}
    if system:
        kwargs["system"] = system
    message = await anthropic_client.messages.create(**kwargs)
    text = "".join(block.text for block in message.content if getattr(block, "type", "") == "text")
    return LLMResult(text=text, model=s["model"], tokens=message.usage.output_tokens if message.usage else 0)
