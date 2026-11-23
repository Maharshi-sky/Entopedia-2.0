import json
import os
import re
from typing import Any, Optional

import httpx

from app.utils.logger import logger

OLLAMA_HOST = (os.getenv("OLLAMA_HOST") or "http://localhost:11434").rstrip("/")
DEFAULT_MODEL = os.getenv("OLLAMA_MODEL") or "qwen2.5:7b"


class OllamaService:
    async def get_status(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                res = await client.get(f"{OLLAMA_HOST}/api/tags")
            if res.status_code != 200:
                return {"available": False, "host": OLLAMA_HOST, "defaultModel": DEFAULT_MODEL, "models": []}
            data = res.json()
            models = [m["name"] for m in data.get("models", [])] if isinstance(data.get("models"), list) else []
            return {"available": True, "host": OLLAMA_HOST, "defaultModel": DEFAULT_MODEL, "models": models}
        except Exception:  # noqa: BLE001
            return {"available": False, "host": OLLAMA_HOST, "defaultModel": DEFAULT_MODEL, "models": []}

    async def _resolve_model(self, preferred: Optional[str] = None) -> str:
        target = preferred or DEFAULT_MODEL
        status = await self.get_status()
        if not status["available"] or not status["models"]:
            return target

        prefix = target.split(":")[0]
        exact = next((m for m in status["models"] if m == target or m.startswith(f"{prefix}:")), None)
        if exact:
            return exact

        fallback = next((m for m in status["models"] if not re.search(r"moondream|llava|vision", m, re.I)), None)
        return fallback or status["models"][0]

    async def chat(
        self,
        prompt: str,
        system: Optional[str] = None,
        model: Optional[str] = None,
        json_mode: bool = False,
        schema: Optional[dict] = None,
        temperature: float = 0.2,
        timeout_ms: int = 120_000,
    ) -> str:
        active_model = await self._resolve_model(model)

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        body: dict[str, Any] = {
            "model": active_model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature, "num_ctx": 8192},
        }
        if schema:
            body["format"] = schema
        elif json_mode:
            body["format"] = "json"

        async with httpx.AsyncClient(timeout=timeout_ms / 1000) as client:
            res = await client.post(f"{OLLAMA_HOST}/api/chat", json=body)

        if res.status_code != 200:
            raise RuntimeError(f"Ollama HTTP {res.status_code}: {res.text}")

        data = res.json()
        return str((data.get("message") or {}).get("content") or "").strip()

    async def chat_json(
        self,
        prompt: str,
        system: Optional[str] = None,
        model: Optional[str] = None,
        schema: Optional[dict] = None,
        temperature: float = 0.2,
        timeout_ms: int = 120_000,
    ) -> Any:
        raw = await self.chat(
            prompt=prompt, system=system, model=model, json_mode=True, schema=schema,
            temperature=temperature, timeout_ms=timeout_ms,
        )
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            cleaned = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.I)
            cleaned = re.sub(r"\s*```$", "", cleaned, flags=re.I).strip()
            match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", cleaned)
            if not match:
                logger.error(f"Failed to parse JSON from Ollama response: {raw[:400]}")
                raise RuntimeError("Local AI returned invalid JSON structure")
            return json.loads(match.group(0))


ollama_service = OllamaService()
