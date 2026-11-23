import base64
import json
import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional


from app.db.connection import db
from app.db.redis_client import redis
from app.services import llm
from app.utils.logger import logger

# Text comes from the provider in AI_PROVIDER (default: local Ollama); see app/services/llm.py.


@dataclass
class AIResponse:
    query_id: str
    answer: str
    sources: list[dict]
    confidence: str
    tokens_used: int
    retrieved_points: list[str] = field(default_factory=list)
    inferred_points: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "queryId": self.query_id,
            "answer": self.answer,
            "sources": self.sources,
            "confidence": self.confidence,
            "tokensUsed": self.tokens_used,
            "retrievedPoints": self.retrieved_points,
            "inferredPoints": self.inferred_points,
        }


class AIService:
    async def ask_question(
        self, question: str, modules: list[str], user_id: str, temperature: float = 0.7
    ) -> AIResponse:
        context_data = await self._build_context(modules)

        cache_key = f"ai:question:{','.join(modules)}-{base64.b64encode(question.encode()).decode()}"
        cached = await redis.get(cache_key) if redis.is_ready() else None
        if cached:
            logger.info("Returning cached AI response")
            data = json.loads(cached)
            return AIResponse(
                query_id=data["queryId"], answer=data["answer"], sources=data["sources"],
                confidence=data["confidence"], tokens_used=data["tokensUsed"],
                retrieved_points=data.get("retrievedPoints", []), inferred_points=data.get("inferredPoints", []),
            )

        system_prompt = f"""You are an expert intelligence analyst for Entopedia, a pest and competitive intelligence platform for Reckitt (Mortein brand).

You have access to the following data:
{json.dumps(context_data, default=str, indent=2)}

Rules:
1. Always cite your sources with [Source: type/title]
2. Distinguish between retrieved facts and inferred conclusions
3. Rate your confidence in the answer (high/medium/low)
4. Be concise but comprehensive
5. For regulatory or safety questions, always err on the side of caution"""

        result = await llm.complete(question, system=system_prompt, max_tokens=1500, temperature=temperature)
        answer = result.text

        sources = self._extract_sources(answer)
        confidence = self._assess_confidence(answer)
        retrieved, inferred = self._categorize_answer_points(answer)

        response = AIResponse(
            query_id=str(uuid.uuid4()), answer=answer, sources=sources, confidence=confidence,
            tokens_used=result.tokens,
            retrieved_points=retrieved, inferred_points=inferred,
        )

        await self._log_query(user_id, modules, question, response)
        if redis.is_ready():
            await redis.set(cache_key, json.dumps(response.to_dict()), 3600)

        return response

    async def generate_claims(self, product_description: str, target_market: str, photo_url: Optional[str] = None) -> Any:
        prompt = f"""You are a product claims expert. Generate 15-20 potential product claims for:
Product: {product_description}
Target Market: {target_market}
{f"Product Image: {photo_url}" if photo_url else ""}

For each claim, provide:
1. Claim text
2. Category (efficacy, safety, speed, durability, etc.)
3. Evidence needed (studies, tests, certifications)
4. Confidence level (high/medium/low)

Format as JSON array with these fields."""
        result = await llm.complete(prompt, max_tokens=2000, json_mode=True)
        return json.loads(self._extract_json(result.text or "{}"))

    async def summarize_document(self, content: str, doc_type: str) -> str:
        prompts = {
            "patent": f"Summarize this patent in 3-4 sentences focusing on: active ingredients, innovation, and applications:\n\n{content}",
            "paper": f"Summarize this research paper in 3-4 sentences focusing on: methodology, findings, and implications:\n\n{content}",
            "regulation": f"Summarize this regulation in 2-3 sentences focusing on: approval status, restrictions, and market impact:\n\n{content}",
            "news": f"Summarize this news article in 2-3 sentences focusing on: key announcement and market implications:\n\n{content}",
        }
        result = await llm.complete(prompts[doc_type], max_tokens=500)
        return result.text

    async def _build_context(self, modules: list[str]) -> dict:
        context: dict[str, Any] = {}
        if "competitor" in modules:
            context["competitors"] = await db.query_many(
                "SELECT name, threat_score, recent_filings_count, ai_summary FROM competitors LIMIT 20"
            )
        if "patent" in modules:
            context["patents"] = await db.query_many(
                "SELECT patent_number, title, filer, filing_date, threat_score FROM patents ORDER BY threat_score DESC LIMIT 30"
            )
        if "regulatory" in modules:
            context["regulations"] = await db.query_many(
                "SELECT active_ingredient, market, approval_status, max_concentration, risk_rating FROM regulations LIMIT 50"
            )
        if "news" in modules:
            context["news"] = await db.query_many(
                "SELECT title, source, category, published_date FROM news ORDER BY published_date DESC LIMIT 20"
            )
        return context

    def _extract_sources(self, answer: str) -> list[dict]:
        sources = []
        for match in re.finditer(r"\[Source:?\s*([^\]]+)\]", answer, re.I):
            ref = match.group(1).strip()
            parts = ref.split("/")
            sources.append({"type": parts[0] if parts else "unknown", "title": parts[1] if len(parts) > 1 else ref, "relevance": 0.85})
        return sources[:10]

    def _assess_confidence(self, answer: str) -> str:
        low_words = ["uncertain", "unclear", "limited", "insufficient"]
        if any(w in answer.lower() for w in low_words):
            return "medium"
        if len(answer) < 100:
            return "low"
        return "high"

    def _categorize_answer_points(self, answer: str) -> tuple[list[str], list[str]]:
        retrieved: list[str] = []
        inferred: list[str] = []
        for sentence in re.split(r"[.!?]+", answer):
            s = sentence.strip()
            if "[Source:" in s:
                retrieved.append(s)
            elif any(w in s for w in ("infer", "suggest", "imply")):
                inferred.append(s)
            elif len(s) > 20:
                retrieved.append(s)
        return retrieved[:5], inferred[:5]

    def _extract_json(self, text: str) -> str:
        match = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", text)
        return match.group(0) if match else "{}"

    async def _log_query(self, user_id: str, modules: list[str], query: str, response: AIResponse) -> None:
        try:
            await db.execute(
                """INSERT INTO ai_queries (id, user_id, modules, query_text, response, confidence_level, tokens_used, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())""",
                [response.query_id, user_id, modules, query, json.dumps(response.to_dict()), response.confidence, response.tokens_used],
            )
        except Exception as error:  # noqa: BLE001
            logger.error(f"Failed to log AI query: {error}")


ai_service = AIService()
