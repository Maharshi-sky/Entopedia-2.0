import { Server } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { notificationService } from '../services/notification.service';
import { queueService } from '../services/queue.service';

export function setupWebSocket(httpServer: HTTPServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
      methods: ['GET', 'POST'],
    },
  });

  // Middleware: Authenticate socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      socket.data.user = decoded;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    const userId = (socket.data.user as any).id;
    logger.info(`User connected: ${userId}`);

    // Join user-specific room
    socket.join(`user:${userId}`);

    // Real-time notifications
    socket.on('subscribe-notifications', async () => {
      logger.debug(`User subscribed to notifications: ${userId}`);

      // Send existing unread notifications
      try {
        const notifications = await notificationService.getUserNotifications(userId, 20, 0);
        socket.emit('notifications-list', notifications);
      } catch (error) {
        logger.error('Failed to fetch notifications:', error);
      }
    });

    // AI Query submission with real-time progress
    socket.on('submit-ai-query', async (data: { question: string; modules: string[] }) => {
      try {
        const jobId = await queueService.queueAIQuery(userId, data.question, data.modules);

        socket.emit('query-queued', { jobId });

        // Poll job status
        const statusCheckInterval = setInterval(async () => {
          const status = await queueService.getJobStatus(jobId, 'ai-queries');

          if (!status) {
            clearInterval(statusCheckInterval);
            return;
          }

          socket.emit('query-progress', {
            jobId,
            state: status.state,
            progress: status.progress,
          });

          if (status.state === 'completed') {
            clearInterval(statusCheckInterval);
            socket.emit('query-completed', {
              jobId,
              result: status.result,
            });
          } else if (status.state === 'failed') {
            clearInterval(statusCheckInterval);
            socket.emit('query-failed', {
              jobId,
              error: status.error,
            });
          }
        }, 500);
      } catch (error) {
        logger.error('Query submission error:', error);
        socket.emit('query-error', { error: 'Failed to submit query' });
      }
    });

    // Report generation with real-time progress
    socket.on('generate-report', async (data: { templateType: string; parameters: any }) => {
      try {
        const jobId = await queueService.queueReportGeneration(userId, data.templateType, data.parameters);

        socket.emit('report-queued', { jobId });

        const statusCheckInterval = setInterval(async () => {
          const status = await queueService.getJobStatus(jobId, 'reports');

          if (!status) {
            clearInterval(statusCheckInterval);
            return;
          }

          socket.emit('report-progress', {
            jobId,
            progress: status.progress,
          });

          if (status.state === 'completed') {
            clearInterval(statusCheckInterval);
            socket.emit('report-completed', {
              jobId,
              reportId: status.result,
            });
          }
        }, 500);
      } catch (error) {
        logger.error('Report generation error:', error);
        socket.emit('report-error', { error: 'Failed to generate report' });
      }
    });

    // Live search with debounce
    let searchTimeout: NodeJS.Timeout;
    socket.on('live-search', (data: { q: string; types: string[] }) => {
      clearTimeout(searchTimeout);

      searchTimeout = setTimeout(async () => {
        try {
          // Call search service
          socket.emit('search-results', {
            query: data.q,
            results: [],
          });
        } catch (error) {
          logger.error('Search error:', error);
          socket.emit('search-error', { error: 'Search failed' });
        }
      }, 300);
    });

    // Subscribe to real-time data updates (patents, competitors, etc.)
    socket.on('subscribe', (channel: string) => {
      socket.join(`channel:${channel}`);
      logger.debug(`User subscribed to channel: ${channel}`);
    });

    socket.on('unsubscribe', (channel: string) => {
      socket.leave(`channel:${channel}`);
      logger.debug(`User unsubscribed from channel: ${channel}`);
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      logger.info(`User disconnected: ${userId}`);
    });
  });

  // Methods to emit events to specific users or channels
  return {
    emitToUser: (userId: string, event: string, data: any) => {
      io.to(`user:${userId}`).emit(event, data);
    },

    emitToChannel: (channel: string, event: string, data: any) => {
      io.to(`channel:${channel}`).emit(event, data);
    },

    broadcast: (event: string, data: any) => {
      io.emit(event, data);
    },
  };
}
