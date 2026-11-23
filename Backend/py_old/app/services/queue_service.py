"""
Background job queue. The original used Bull (Redis-backed); this port uses
an in-process asyncio queue per job type, which is sufficient since nothing
outside the (also unwired) websocket module calls into this service.
"""
import asyncio
import json
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from app.db.connection import db
from app.services.ai_service import ai_service
from app.services.search_service import search_service
from app.utils.logger import logger
from app.utils.tasks import spawn


@dataclass
class Job:
    id: str
    data: dict
    state: str = "waiting"
    progress: int = 0
    result: Any = None
    error: Optional[str] = None


class _Queue:
    def __init__(self, name: str, processor: Callable[[Job], Any]):
        self.name = name
        self._processor = processor
        self._jobs: dict[str, Job] = {}

    async def add(self, data: dict) -> Job:
        job = Job(id=str(uuid.uuid4()), data=data)
        self._jobs[job.id] = job
        spawn(self._run(job))
        return job

    async def _run(self, job: Job) -> None:
        job.state = "active"
        try:
            job.result = await self._processor(job)
            job.progress = 100
            job.state = "completed"
            logger.info(f"{self.name} job completed: {job.id}")
        except Exception as error:  # noqa: BLE001
            job.error = str(error)
            job.state = "failed"
            logger.error(f"{self.name} job failed: {job.id} {error}")

    def get(self, job_id: str) -> Optional[Job]:
        return self._jobs.get(job_id)

    def remove(self, job_id: str) -> None:
        self._jobs.pop(job_id, None)


async def _process_ai_query(job: Job) -> Any:
    data = job.data
    response = await ai_service.ask_question(data["question"], data["modules"], data["userId"])
    return response.to_dict()


async def _process_indexing(job: Job) -> None:
    data = job.data
    doc_type = data["type"]
    if doc_type == "patent":
        await search_service.index_patent(data["documentId"])
    elif doc_type == "news":
        await search_service.index_news(data["documentId"])
    elif doc_type == "competitor":
        await search_service.index_competitor(data["documentId"])


async def _process_export(job: Job) -> dict:
    data = job.data
    fmt, rows, filename, user_id = data["format"], data["data"], data["filename"], data["userId"]
    if fmt == "csv":
        content = _convert_to_csv(rows)
    else:
        content = json.dumps(rows)

    await db.execute(
        "INSERT INTO exports (id, user_id, filename, format, content, created_at) VALUES (uuid_generate_v4(), $1, $2, $3, $4, NOW())",
        [user_id, filename, fmt, content],
    )
    return {"filename": filename, "format": fmt}


async def _process_report(job: Job) -> Any:
    data = job.data
    template_type, user_id, parameters = data["templateType"], data["userId"], data["parameters"]
    generators = {
        "patent_landscape": _generate_patent_landscape_report,
        "research_digest": _generate_research_digest,
        "teardown_summary": _generate_teardown_summary,
        "quarterly_deck": _generate_quarterly_deck,
    }
    report_content = generators.get(template_type, lambda p: {})(parameters)

    row = await db.query_one(
        "INSERT INTO deliverables (id, template_type, created_by, content, created_at, updated_at) VALUES (uuid_generate_v4(), $1, $2, $3, NOW(), NOW()) RETURNING id",
        [template_type, user_id, json.dumps(report_content)],
    )
    return row


async def _process_notification(job: Job) -> None:
    data = job.data
    await db.execute(
        "INSERT INTO notifications (id, user_id, type, message, created_at) VALUES (uuid_generate_v4(), $1, $2, $3, NOW())",
        [data["userId"], data["type"], data["message"]],
    )
    logger.info(f"Notification sent to {data['userId']}: {data['message']}")


def _convert_to_csv(data: list[dict]) -> str:
    if not data:
        return ""
    headers = list(data[0].keys())
    rows = [",".join(str(item.get(h, "")) for h in headers) for item in data]
    return "\n".join([",".join(headers), *rows])


def _generate_patent_landscape_report(params: dict) -> dict:
    return {
        "title": "Patent Landscape Report", "parameters": params,
        "sections": [
            {"name": "Executive Summary", "content": "Patent landscape overview"},
            {"name": "Competitor Analysis", "content": "Top filers and trends"},
            {"name": "Technology Gaps", "content": "White space opportunities"},
        ],
    }


def _generate_research_digest(params: dict) -> dict:
    return {"title": "Research Digest", "parameters": params, "sections": [{"name": "Key Findings", "content": "Latest research highlights"}]}


def _generate_teardown_summary(params: dict) -> dict:
    return {"title": "Competitor Teardown", "parameters": params, "sections": [{"name": "Product Analysis", "content": "Detailed breakdown"}]}


def _generate_quarterly_deck(params: dict) -> dict:
    return {
        "title": "Quarterly Intelligence Deck", "parameters": params,
        "sections": [
            {"name": "Market Overview", "content": "Q review"},
            {"name": "Competitive Moves", "content": "Competitor activity"},
            {"name": "Regulatory Changes", "content": "Compliance updates"},
        ],
    }


_ai_query_queue = _Queue("ai-queries", _process_ai_query)
_indexing_queue = _Queue("indexing", _process_indexing)
_export_queue = _Queue("exports", _process_export)
_report_queue = _Queue("reports", _process_report)
_notification_queue = _Queue("notifications", _process_notification)

_QUEUES = {
    "ai-queries": _ai_query_queue,
    "indexing": _indexing_queue,
    "exports": _export_queue,
    "reports": _report_queue,
    "notifications": _notification_queue,
}


class QueueService:
    async def queue_ai_query(self, user_id: str, question: str, modules: list[str]) -> str:
        job = await _ai_query_queue.add({"userId": user_id, "question": question, "modules": modules})
        return job.id

    async def queue_indexing(self, document_id: str, type_: str) -> str:
        job = await _indexing_queue.add({"documentId": document_id, "type": type_})
        return job.id

    async def queue_export(self, user_id: str, format_: str, data: Any, filename: str) -> str:
        job = await _export_queue.add({"userId": user_id, "format": format_, "data": data, "filename": filename})
        return job.id

    async def queue_report_generation(self, user_id: str, template_type: str, parameters: dict) -> str:
        job = await _report_queue.add({"userId": user_id, "templateType": template_type, "parameters": parameters})
        return job.id

    async def queue_notification(self, user_id: str, type_: str, message: str) -> str:
        job = await _notification_queue.add({"userId": user_id, "type": type_, "message": message})
        return job.id

    async def get_job_status(self, job_id: str, queue_name: str) -> Optional[dict]:
        queue = _QUEUES.get(queue_name)
        if not queue:
            raise ValueError(f"Unknown queue: {queue_name}")
        job = queue.get(job_id)
        if not job:
            return None
        return {"id": job.id, "state": job.state, "progress": job.progress, "data": job.data, "result": job.result, "error": job.error}

    async def cancel_job(self, job_id: str, queue_name: str) -> None:
        queue = _QUEUES.get(queue_name)
        if not queue:
            raise ValueError(f"Unknown queue: {queue_name}")
        queue.remove(job_id)


queue_service = QueueService()
