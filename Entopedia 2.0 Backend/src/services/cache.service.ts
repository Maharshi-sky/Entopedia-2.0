import { redis } from '../db/redis';
import { logger } from '../utils/logger';

export class CacheService {
  private defaultTTL = 3600; // 1 hour

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redis.get(key);
      if (data) {
        logger.debug(`Cache hit: ${key}`);
        return JSON.parse(data);
      }
      return null;
    } catch (error) {
      logger.error(`Cache get error for ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      await redis.set(key, JSON.stringify(value), ttl || this.defaultTTL);
      logger.debug(`Cache set: ${key}`);
    } catch (error) {
      logger.error(`Cache set error for ${key}:`, error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
      logger.debug(`Cache deleted: ${key}`);
    } catch (error) {
      logger.error(`Cache delete error for ${key}:`, error);
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const client = redis.getClient();
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(keys);
        logger.debug(`Invalidated ${keys.length} cache keys matching ${pattern}`);
      }
    } catch (error) {
      logger.error(`Cache invalidation error for pattern ${pattern}:`, error);
    }
  }

  // Domain-specific cache keys
  getPatentKey(patentId: string): string {
    return `patent:${patentId}`;
  }

  getCompetitorKey(competitorId: string): string {
    return `competitor:${competitorId}`;
  }

  getNewsKey(newsId: string): string {
    return `news:${newsId}`;
  }

  getDashboardKey(userId: string, timeRange: string): string {
    return `dashboard:${userId}:${timeRange}`;
  }

  getSearchKey(query: string, filters: string): string {
    return `search:${Buffer.from(`${query}:${filters}`).toString('base64')}`;
  }

  getAIQueryKey(question: string, modules: string[]): string {
    return `ai:${Buffer.from(`${question}:${modules.join(',')}`).toString('base64')}`;
  }

  // Invalidation helpers
  async invalidateCompetitor(competitorId: string): Promise<void> {
    await this.del(this.getCompetitorKey(competitorId));
  }

  async invalidatePatent(patentId: string): Promise<void> {
    await this.del(this.getPatentKey(patentId));
  }

  async invalidateDashboard(userId: string): Promise<void> {
    await this.invalidatePattern(`dashboard:${userId}:*`);
  }

  async invalidateNews(newsId: string): Promise<void> {
    await this.del(this.getNewsKey(newsId));
  }

  async warmCache(key: string, loader: () => Promise<any>, ttl?: number): Promise<any> {
    try {
      const cached = await this.get(key);
      if (cached) return cached;

      const data = await loader();
      await this.set(key, data, ttl);
      return data;
    } catch (error) {
      logger.error(`Cache warming error for ${key}:`, error);
      throw error;
    }
  }
}

export const cacheService = new CacheService();
