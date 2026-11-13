import { db } from '../db/connection';
import { logger } from '../utils/logger';

export interface Analytics {
  activeUsers: number;
  totalQueries: number;
  averageQueryTime: number;
  topModules: Array<{ module: string; count: number }>;
  aiQueryStats: {
    totalQueries: number;
    averageTokens: number;
    confidenceLevels: Record<string, number>;
  };
  searchStats: {
    totalSearches: number;
    averageResultsPerSearch: number;
    searchCategories: Record<string, number>;
  };
  patentStats: {
    totalIndexed: number;
    newThisMonth: number;
    threatScoreDistribution: Record<string, number>;
  };
  newsStats: {
    totalArticles: number;
    categoriesCount: Record<string, number>;
    sourceBreakdown: Record<string, number>;
  };
}

export class AnalyticsService {
  async getAnalytics(period = '30d'): Promise<Analytics> {
    try {
      const [activeUsers, totalQueries, moduleUsage, aiStats, patentStats, newsStats] = await Promise.all([
        this.getActiveUsers(period),
        this.getTotalQueries(period),
        this.getModuleUsage(period),
        this.getAIQueryStats(period),
        this.getPatentStats(),
        this.getNewsStats(),
      ]);

      return {
        activeUsers,
        totalQueries,
        averageQueryTime: 250,
        topModules: moduleUsage,
        aiQueryStats: aiStats,
        searchStats: { totalSearches: 0, averageResultsPerSearch: 0, searchCategories: {} },
        patentStats,
        newsStats,
      };
    } catch (error) {
      logger.error('Analytics error:', error);
      throw error;
    }
  }

  private async getActiveUsers(period: string): Promise<number> {
    const result = await db.queryOne(
      'SELECT COUNT(DISTINCT user_id) as count FROM ai_queries WHERE created_at > NOW() - INTERVAL $1',
      [period]
    );
    return result?.count || 0;
  }

  private async getTotalQueries(period: string): Promise<number> {
    const result = await db.queryOne(
      'SELECT COUNT(*) as count FROM ai_queries WHERE created_at > NOW() - INTERVAL $1',
      [period]
    );
    return result?.count || 0;
  }

  private async getModuleUsage(period: string): Promise<Array<{ module: string; count: number }>> {
    const results = await db.queryMany(
      'SELECT UNNEST(modules) as module, COUNT(*) as count FROM ai_queries WHERE created_at > NOW() - INTERVAL $1 GROUP BY UNNEST(modules) ORDER BY count DESC LIMIT 10',
      [period]
    );
    return results || [];
  }

  private async getAIQueryStats(period: string): Promise<any> {
    const results = await db.queryMany(
      'SELECT confidence_level, COUNT(*) as count, AVG(tokens_used) as avg_tokens FROM ai_queries WHERE created_at > NOW() - INTERVAL $1 GROUP BY confidence_level',
      [period]
    );

    const stats = {
      totalQueries: 0,
      averageTokens: 0,
      confidenceLevels: {} as Record<string, number>,
    };

    for (const row of results) {
      stats.totalQueries += row.count;
      stats.averageTokens = row.avg_tokens;
      stats.confidenceLevels[row.confidence_level] = row.count;
    }

    return stats;
  }

  private async getPatentStats(): Promise<any> {
    const [total, thisMonth, threatScores] = await Promise.all([
      db.queryOne('SELECT COUNT(*) as count FROM patents'),
      db.queryOne('SELECT COUNT(*) as count FROM patents WHERE filing_date > NOW() - INTERVAL \'1 month\''),
      db.queryMany('SELECT CAST(ROUND(threat_score) AS INTEGER) as score, COUNT(*) as count FROM patents GROUP BY CAST(ROUND(threat_score) AS INTEGER)'),
    ]);

    const distribution: Record<string, number> = {};
    for (const row of threatScores || []) {
      distribution[`score_${row.score}`] = row.count;
    }

    return {
      totalIndexed: total?.count || 0,
      newThisMonth: thisMonth?.count || 0,
      threatScoreDistribution: distribution,
    };
  }

  private async getNewsStats(): Promise<any> {
    const [total, byCategory, bySource] = await Promise.all([
      db.queryOne('SELECT COUNT(*) as count FROM news'),
      db.queryMany('SELECT category, COUNT(*) as count FROM news GROUP BY category ORDER BY count DESC'),
      db.queryMany('SELECT source, COUNT(*) as count FROM news GROUP BY source ORDER BY count DESC LIMIT 10'),
    ]);

    const categoryBreakdown: Record<string, number> = {};
    for (const row of byCategory || []) {
      categoryBreakdown[row.category] = row.count;
    }

    const sourceBreakdown: Record<string, number> = {};
    for (const row of bySource || []) {
      sourceBreakdown[row.source] = row.count;
    }

    return {
      totalArticles: total?.count || 0,
      categoriesCount: categoryBreakdown,
      sourceBreakdown,
    };
  }

  async trackEvent(userId: string, eventType: string, metadata: any): Promise<void> {
    try {
      await db.query(
        'INSERT INTO analytics_events (user_id, event_type, metadata, created_at) VALUES ($1, $2, $3, NOW())',
        [userId, eventType, JSON.stringify(metadata)]
      );
    } catch (error) {
      logger.error('Event tracking error:', error);
    }
  }

  async getUserAnalytics(userId: string): Promise<any> {
    try {
      const queries = await db.queryOne('SELECT COUNT(*) as count FROM ai_queries WHERE user_id = $1', [userId]);
      const lastActive = await db.queryOne(
        'SELECT MAX(created_at) as date FROM ai_queries WHERE user_id = $1',
        [userId]
      );
      const moduleUsage = await db.queryMany(
        'SELECT UNNEST(modules) as module, COUNT(*) as count FROM ai_queries WHERE user_id = $1 GROUP BY UNNEST(modules)',
        [userId]
      );

      return {
        totalQueries: queries?.count || 0,
        lastActive: lastActive?.date,
        moduleUsage,
      };
    } catch (error) {
      logger.error('User analytics error:', error);
      throw error;
    }
  }
}

export const analyticsService = new AnalyticsService();
