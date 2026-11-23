import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from elasticsearch import AsyncElasticsearch

from app.db.connection import db
from app.utils.logger import logger

_es = AsyncElasticsearch(hosts=[os.getenv("ELASTICSEARCH_URL", "http://localhost:9200")])

INDEX = "entopedia"


@dataclass
class SearchFilters:
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    filer: Optional[str] = None
    market: Optional[str] = None
    threat_score: Optional[tuple[float, float]] = None


@dataclass
class SearchQuery:
    q: str
    types: list[str]
    filters: Optional[SearchFilters] = None
    limit: int = 20
    offset: int = 0


class SearchService:
    async def search(self, query: SearchQuery) -> list[dict]:
        try:
            filters: list[dict] = []
            f = query.filters

            if f and (f.date_from or f.date_to):
                date_filter: dict = {}
                if f.date_from:
                    date_filter["gte"] = f.date_from.isoformat()
                if f.date_to:
                    date_filter["lte"] = f.date_to.isoformat()
                filters.append({"range": {"date": date_filter}})

            if f and f.filer:
                filters.append({"match": {"filer": f.filer}})

            if f and f.market:
                filters.append({"term": {"market": f.market}})

            if f and f.threat_score:
                filters.append({"range": {"threat_score": {"gte": f.threat_score[0], "lte": f.threat_score[1]}}})

            body = {
                "query": {
                    "bool": {
                        "must": [{"multi_match": {"query": query.q, "fields": ["title^3", "content", "summary"], "fuzziness": "AUTO"}}],
                        "filter": [{"terms": {"type": query.types}}, *filters],
                    }
                },
                "size": query.limit,
                "from": query.offset,
                "highlight": {"fields": {"content": {}, "title": {}}},
            }

            response = await _es.search(index=INDEX, body=body)

            results = []
            for hit in response["hits"]["hits"]:
                source = hit["_source"]
                highlight = hit.get("highlight", {})
                results.append({
                    "id": hit["_id"], "type": source.get("type"), "title": source.get("title"),
                    "snippet": (highlight.get("content") or [None])[0] or source.get("summary", ""),
                    "relevance": hit.get("_score", 0),
                    "metadata": {
                        "date": source.get("date"), "filer": source.get("filer"),
                        "threatScore": source.get("threat_score"), "source": source.get("source"),
                    },
                })
            return results
        except Exception as error:  # noqa: BLE001
            logger.error(f"Search error: {error}")
            raise

    async def index_patent(self, patent_id: str) -> None:
        try:
            patent = await db.query_one("SELECT * FROM patents WHERE id = $1", [patent_id])
            if not patent:
                return
            actives = ", ".join(patent.get("active_ingredients") or [])
            await _es.index(index=INDEX, id=patent_id, document={
                "type": "patent", "title": patent.get("title"),
                "content": f"{patent.get('abstract')} {actives}", "summary": patent.get("ai_summary"),
                "date": patent.get("filing_date"), "filer": patent.get("filer"), "threat_score": patent.get("threat_score"),
            })
        except Exception as error:  # noqa: BLE001
            logger.error(f"Patent indexing error: {error}")

    async def index_news(self, news_id: str) -> None:
        try:
            news = await db.query_one("SELECT * FROM news WHERE id = $1", [news_id])
            if not news:
                return
            await _es.index(index=INDEX, id=news_id, document={
                "type": "news", "title": news.get("title"), "content": news.get("content"),
                "summary": news.get("ai_summary"), "date": news.get("published_date"),
                "source": news.get("source"), "category": news.get("category"),
            })
        except Exception as error:  # noqa: BLE001
            logger.error(f"News indexing error: {error}")

    async def index_competitor(self, competitor_id: str) -> None:
        try:
            competitor = await db.query_one("SELECT * FROM competitors WHERE id = $1", [competitor_id])
            if not competitor:
                return
            patents = await db.query_many("SELECT COUNT(*) as count FROM patents WHERE filer = $1", [competitor["name"]])
            await _es.index(index=INDEX, id=competitor_id, document={
                "type": "competitor", "title": competitor.get("name"),
                "content": f"{competitor.get('ai_summary')} {competitor.get('country')}",
                "summary": competitor.get("ai_summary"), "threat_score": competitor.get("threat_score"),
                "filings_count": patents[0]["count"] if patents else 0, "date": competitor.get("last_updated"),
            })
        except Exception as error:  # noqa: BLE001
            logger.error(f"Competitor indexing error: {error}")

    async def bulk_index(self, documents: list[dict]) -> None:
        try:
            operations: list[Any] = []
            for doc in documents:
                operations.append({"index": {"_index": INDEX, "_id": doc["id"]}})
                operations.append(doc["data"])
            if operations:
                await _es.bulk(operations=operations)
                logger.info(f"Indexed {len(documents)} documents")
        except Exception as error:  # noqa: BLE001
            logger.error(f"Bulk indexing error: {error}")

    async def create_index(self) -> None:
        try:
            await _es.indices.create(
                index=INDEX,
                settings={"number_of_shards": 1, "number_of_replicas": 1, "analysis": {"analyzer": {"default": {"type": "standard", "stopwords": "_english_"}}}},
                mappings={"properties": {
                    "type": {"type": "keyword"}, "title": {"type": "text", "analyzer": "standard"},
                    "content": {"type": "text", "analyzer": "standard"}, "summary": {"type": "text"},
                    "date": {"type": "date"}, "filer": {"type": "keyword"}, "market": {"type": "keyword"},
                    "threat_score": {"type": "float"}, "source": {"type": "keyword"}, "category": {"type": "keyword"},
                }},
                ignore=[400],
            )
            logger.info("Elasticsearch index created or already exists")
        except Exception as error:  # noqa: BLE001
            logger.error(f"Index creation error: {error}")


search_service = SearchService()
