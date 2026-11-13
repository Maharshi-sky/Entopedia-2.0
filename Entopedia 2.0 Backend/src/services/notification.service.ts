import { db } from '../db/connection';
import { logger } from '../utils/logger';
import { queueService } from './queue.service';

export interface Notification {
  id: string;
  userId: string;
  type: 'alert' | 'patent_filed' | 'competitor_move' | 'regulatory_change' | 'news_update';
  title: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  sourceModule: string;
  data: Record<string, any>;
  read: boolean;
  createdAt: Date;
}

export class NotificationService {
  async createNotification(notification: Omit<Notification, 'id' | 'createdAt'>): Promise<string> {
    try {
      const id = await db.queryOne(
        'INSERT INTO notifications (user_id, type, title, message, severity, source_module, data, read, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING id',
        [
          notification.userId,
          notification.type,
          notification.title,
          notification.message,
          notification.severity,
          notification.sourceModule,
          JSON.stringify(notification.data),
          false,
        ]
      );

      // Queue notification sending (email, push, etc.)
      await queueService.queueNotification(notification.userId, notification.type, notification.message);

      return id.id;
    } catch (error) {
      logger.error('Notification creation error:', error);
      throw error;
    }
  }

  async getUserNotifications(userId: string, limit = 50, offset = 0): Promise<Notification[]> {
    try {
      const notifications = await db.queryMany(
        'SELECT id, user_id as userId, type, title, message, severity, source_module as sourceModule, data, read, created_at as createdAt FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
      );

      return notifications.map(n => ({
        ...n,
        data: typeof n.data === 'string' ? JSON.parse(n.data) : n.data,
      }));
    } catch (error) {
      logger.error('Get notifications error:', error);
      throw error;
    }
  }

  async markAsRead(notificationId: string): Promise<void> {
    try {
      await db.query('UPDATE notifications SET read = true WHERE id = $1', [notificationId]);
    } catch (error) {
      logger.error('Mark as read error:', error);
      throw error;
    }
  }

  async markAllAsRead(userId: string): Promise<void> {
    try {
      await db.query('UPDATE notifications SET read = true WHERE user_id = $1', [userId]);
    } catch (error) {
      logger.error('Mark all as read error:', error);
      throw error;
    }
  }

  // Trigger notifications based on events
  async notifyPatentFiled(patentData: any, relevantUsers: string[]): Promise<void> {
    for (const userId of relevantUsers) {
      await this.createNotification({
        userId,
        type: 'patent_filed',
        title: `New patent filing from ${patentData.filer}`,
        message: patentData.title,
        severity: patentData.threatScore > 0.8 ? 'high' : 'medium',
        sourceModule: 'patent',
        data: { patentId: patentData.id, threatScore: patentData.threatScore },
      });
    }
  }

  async notifyCompetitorMove(competitorData: any, relevantUsers: string[]): Promise<void> {
    for (const userId of relevantUsers) {
      await this.createNotification({
        userId,
        type: 'competitor_move',
        title: `Competitor activity: ${competitorData.name}`,
        message: `${competitorData.recentFilingsCount} new filings this month`,
        severity: competitorData.threatScore > 0.8 ? 'critical' : 'high',
        sourceModule: 'competitor',
        data: { competitorId: competitorData.id, threatScore: competitorData.threatScore },
      });
    }
  }

  async notifyRegulatoryChange(regulationData: any, relevantUsers: string[]): Promise<void> {
    for (const userId of relevantUsers) {
      await this.createNotification({
        userId,
        type: 'regulatory_change',
        title: `Regulatory update: ${regulationData.market}`,
        message: `${regulationData.activeIngredient} status changed to ${regulationData.approvalStatus}`,
        severity: regulationData.approvalStatus === 'suspended' ? 'critical' : 'high',
        sourceModule: 'regulatory',
        data: {
          regulationId: regulationData.id,
          market: regulationData.market,
          activeIngredient: regulationData.activeIngredient,
          approvalStatus: regulationData.approvalStatus,
        },
      });
    }
  }

  async notifyNewsUpdate(newsData: any, relevantUsers: string[]): Promise<void> {
    for (const userId of relevantUsers) {
      await this.createNotification({
        userId,
        type: 'news_update',
        title: newsData.title,
        message: newsData.source,
        severity: 'medium',
        sourceModule: 'news',
        data: { newsId: newsData.id, category: newsData.category },
      });
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    try {
      const result = await db.queryOne('SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = false', [
        userId,
      ]);
      return result?.count || 0;
    } catch (error) {
      logger.error('Get unread count error:', error);
      return 0;
    }
  }

  async deleteNotification(notificationId: string): Promise<void> {
    try {
      await db.query('DELETE FROM notifications WHERE id = $1', [notificationId]);
    } catch (error) {
      logger.error('Delete notification error:', error);
      throw error;
    }
  }
}

export const notificationService = new NotificationService();
