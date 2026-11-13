import { Client } from '@elastic/elasticsearch';
import { db } from '../db/connection';
import { logger } from '../utils/logger';

const elasticsearchClient = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
});

export interface SearchQuery {
  q: string;
  types: ('patent' | 'news' | 'competitor' | 'regulation' | 'paper')[];
  filters?: {
    dateFrom?: Date;
    dateTo?: Date;
    filer?: string;
    market?: string;
    threatScore?: [number, number];
  };
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  snippet: string;
  relevance: number;
  metadata: Record<string, any>;
}

export class SearchService {
  async search(query: SearchQuery): Promise<SearchResult[]> {
    try {
      const filters: any[] = [];

      // Date range filter
      if (query.filters?.dateFrom || query.filters?.dateTo) {
        const dateFilter: any = {};
        if (query.filters.dateFrom) dateFilter.gte = query.filters.dateFrom;
        if (query.filters.dateTo) dateFilter.lte = query.filters.dateTo;
        filters.push({ range: { date: dateFilter } });
      }

      // Filer/Company filter
      if (query.filters?.filer) {
        filters.push({ match: { filer: query.filters.filer } });
      }

      // Market filter
      if (query.filters?.market) {
        filters.push({ term: { market: query.filters.market } });
      }

      // Threat score filter
      if (query.filters?.threatScore) {
        filters.push({
          range: { threat_score: { gte: query.filters.threatScore[0], lte: query.filters.threatScore[1] } },
        });
      }

      const searchBody: any = {
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: query.q,
                  fields: ['title^3', 'content', 'summary'],
                  fuzziness: 'AUTO',
                },
              },
            ],
            filter: [
              {
                terms: { type: query.types },
              },
              ...filters,
            ],
          },
        },
        size: query.limit || 20,
        from: query.offset || 0,
        highlight: {
          fields: {
            content: {},
            title: {},
          },
        },
      };

      const response = await elasticsearchClient.search({
        index: 'entopedia',
        body: searchBody,
      });

      return response.hits.hits.map((hit: any) => ({
        id: hit._id,
        type: hit._source.type,
        title: hit._source.title,
        snippet: hit.highlight?.content?.[0] || hit._source.summary || '',
        relevance: hit._score || 0,
        metadata: {
          date: hit._source.date,
          filer: hit._source.filer,
          threatScore: hit._source.threat_score,
          source: hit._source.source,
        },
      }));
    } catch (error) {
      logger.error('Search error:', error);
      throw error;
    }
  }

  async indexPatent(patentId: string): Promise<void> {
    try {
      const patent = await db.queryOne('SELECT * FROM patents WHERE id = $1', [patentId]);

      if (!patent) return;

      await elasticsearchClient.index({
        index: 'entopedia',
        id: patentId,
        body: {
          type: 'patent',
          title: patent.title,
          content: `${patent.abstract} ${patent.active_ingredients?.join(', ')}`,
          summary: patent.ai_summary,
          date: patent.filing_date,
          filer: patent.filer,
          threat_score: patent.threat_score,
        },
      });
    } catch (error) {
      logger.error('Patent indexing error:', error);
    }
  }

  async indexNews(newsId: string): Promise<void> {
    try {
      const news = await db.queryOne('SELECT * FROM news WHERE id = $1', [newsId]);

      if (!news) return;

      await elasticsearchClient.index({
        index: 'entopedia',
        id: newsId,
        body: {
          type: 'news',
          title: news.title,
          content: news.content,
          summary: news.ai_summary,
          date: news.published_date,
          source: news.source,
          category: news.category,
        },
      });
    } catch (error) {
      logger.error('News indexing error:', error);
    }
  }

  async indexCompetitor(competitorId: string): Promise<void> {
    try {
      const competitor = await db.queryOne('SELECT * FROM competitors WHERE id = $1', [competitorId]);

      if (!competitor) return;

      const patents = await db.queryMany('SELECT COUNT(*) as count FROM patents WHERE filer = $1', [competitor.name]);

      await elasticsearchClient.index({
        index: 'entopedia',
        id: competitorId,
        body: {
          type: 'competitor',
          title: competitor.name,
          content: `${competitor.ai_summary} ${competitor.country}`,
          summary: competitor.ai_summary,
          threat_score: competitor.threat_score,
          filings_count: patents[0]?.count || 0,
          date: competitor.last_updated,
        },
      });
    } catch (error) {
      logger.error('Competitor indexing error:', error);
    }
  }

  async bulkIndex(documents: Array<{ id: string; type: string; data: any }>): Promise<void> {
    try {
      const operations: any[] = [];

      documents.forEach(doc => {
        operations.push({ index: { _index: 'entopedia', _id: doc.id } });
        operations.push(doc.data);
      });

      if (operations.length > 0) {
        await elasticsearchClient.bulk({ operations });
        logger.info(`Indexed ${documents.length} documents`);
      }
    } catch (error) {
      logger.error('Bulk indexing error:', error);
    }
  }

  async createIndex(): Promise<void> {
    try {
      await elasticsearchClient.indices.create(
        {
          index: 'entopedia',
          body: {
            settings: {
              number_of_shards: 1,
              number_of_replicas: 1,
              analysis: {
                analyzer: {
                  default: {
                    type: 'standard',
                    stopwords: '_english_',
                  },
                },
              },
            },
            mappings: {
              properties: {
                type: { type: 'keyword' },
                title: { type: 'text', analyzer: 'standard' },
                content: { type: 'text', analyzer: 'standard' },
                summary: { type: 'text' },
                date: { type: 'date' },
                filer: { type: 'keyword' },
                market: { type: 'keyword' },
                threat_score: { type: 'float' },
                source: { type: 'keyword' },
                category: { type: 'keyword' },
              },
            },
          },
        },
        { ignore: [400] }
      );

      logger.info('Elasticsearch index created or already exists');
    } catch (error) {
      logger.error('Index creation error:', error);
    }
  }
}

export const searchService = new SearchService();
