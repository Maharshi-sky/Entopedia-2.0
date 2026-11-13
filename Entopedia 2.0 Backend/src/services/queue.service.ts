import Bull from 'bull';
import { logger } from '../utils/logger';
import { aiService } from './ai.service';
import { searchService } from './search.service';
import { db } from '../db/connection';

// Define job types
interface AIQueryJob {
  userId: string;
  question: string;
  modules: string[];
}

interface IndexingJob {
  documentId: string;
  type: 'patent' | 'news' | 'competitor';
}

interface ExportJob {
  userId: string;
  format: 'csv' | 'pdf' | 'xlsx';
  data: any;
  filename: string;
}

interface ReportGenerationJob {
  userId: string;
  templateType: string;
  parameters: any;
}

interface NotificationJob {
  userId: string;
  type: string;
  message: string;
}

// Create queues
const aiQueryQueue = new Bull<AIQueryJob>('ai-queries', {
  redis: { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379') },
});

const indexingQueue = new Bull<IndexingJob>('indexing', {
  redis: { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379') },
});

const exportQueue = new Bull<ExportJob>('exports', {
  redis: { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379') },
});

const reportQueue = new Bull<ReportGenerationJob>('reports', {
  redis: { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379') },
});

const notificationQueue = new Bull<NotificationJob>('notifications', {
  redis: { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379') },
});

// AI Query Queue Processor
aiQueryQueue.process(async (job) => {
  logger.info(`Processing AI query job: ${job.id}`);
  const { userId, question, modules } = job.data;

  try {
    const response = await aiService.askQuestion({ question, modules, userId });
    await job.progress(100);
    return response;
  } catch (error) {
    logger.error(`AI query job failed: ${job.id}`, error);
    throw error;
  }
});

// Indexing Queue Processor
indexingQueue.process(async (job) => {
  logger.info(`Processing indexing job: ${job.id}`);
  const { documentId, type } = job.data;

  try {
    switch (type) {
      case 'patent':
        await searchService.indexPatent(documentId);
        break;
      case 'news':
        await searchService.indexNews(documentId);
        break;
      case 'competitor':
        await searchService.indexCompetitor(documentId);
        break;
    }
    await job.progress(100);
  } catch (error) {
    logger.error(`Indexing job failed: ${job.id}`, error);
    throw error;
  }
});

// Export Queue Processor
exportQueue.process(async (job) => {
  logger.info(`Processing export job: ${job.id}`);
  const { userId, format, data, filename } = job.data;

  try {
    // Format data based on export type
    let content = '';
    if (format === 'csv') {
      content = await convertToCSV(data);
    } else if (format === 'xlsx') {
      content = await convertToXLSX(data);
    } else if (format === 'pdf') {
      content = await convertToPDF(data);
    }

    // Save to database or external storage
    await db.query(
      'INSERT INTO exports (id, user_id, filename, format, content, created_at) VALUES (uuid_generate_v4(), $1, $2, $3, $4, NOW())',
      [userId, filename, format, content]
    );

    await job.progress(100);
    return { filename, format };
  } catch (error) {
    logger.error(`Export job failed: ${job.id}`, error);
    throw error;
  }
});

// Report Generation Queue Processor
reportQueue.process(async (job) => {
  logger.info(`Processing report generation job: ${job.id}`);
  const { userId, templateType, parameters } = job.data;

  try {
    let reportContent = {};

    switch (templateType) {
      case 'patent_landscape':
        reportContent = await generatePatentLandscapeReport(parameters);
        break;
      case 'research_digest':
        reportContent = await generateResearchDigest(parameters);
        break;
      case 'teardown_summary':
        reportContent = await generateTeardownSummary(parameters);
        break;
      case 'quarterly_deck':
        reportContent = await generateQuarterlyDeck(parameters);
        break;
    }

    const reportId = await db.queryOne(
      'INSERT INTO deliverables (id, template_type, created_by, content, created_at, updated_at) VALUES (uuid_generate_v4(), $1, $2, $3, NOW(), NOW()) RETURNING id',
      [templateType, userId, JSON.stringify(reportContent)]
    );

    await job.progress(100);
    return reportId;
  } catch (error) {
    logger.error(`Report generation job failed: ${job.id}`, error);
    throw error;
  }
});

// Notification Queue Processor
notificationQueue.process(async (job) => {
  logger.info(`Processing notification job: ${job.id}`);
  const { userId, type, message } = job.data;

  try {
    // Store notification in database
    await db.query(
      'INSERT INTO notifications (id, user_id, type, message, created_at) VALUES (uuid_generate_v4(), $1, $2, $3, NOW())',
      [userId, type, message]
    );

    // In production, send email, push notification, etc.
    logger.info(`Notification sent to ${userId}: ${message}`);

    await job.progress(100);
  } catch (error) {
    logger.error(`Notification job failed: ${job.id}`, error);
    throw error;
  }
});

// Queue event handlers
aiQueryQueue.on('completed', (job) => {
  logger.info(`AI query job completed: ${job.id}`);
});

aiQueryQueue.on('failed', (job, err) => {
  logger.error(`AI query job failed: ${job.id}`, err);
});

// Queue service class
export class QueueService {
  async queueAIQuery(userId: string, question: string, modules: string[]): Promise<string> {
    const job = await aiQueryQueue.add({ userId, question, modules }, { attempts: 3, backoff: 'exponential' });
    return job.id.toString();
  }

  async queueIndexing(documentId: string, type: 'patent' | 'news' | 'competitor'): Promise<string> {
    const job = await indexingQueue.add({ documentId, type }, { attempts: 2, backoff: 'exponential' });
    return job.id.toString();
  }

  async queueExport(userId: string, format: 'csv' | 'pdf' | 'xlsx', data: any, filename: string): Promise<string> {
    const job = await exportQueue.add({ userId, format, data, filename }, { attempts: 3, backoff: 'exponential' });
    return job.id.toString();
  }

  async queueReportGeneration(userId: string, templateType: string, parameters: any): Promise<string> {
    const job = await reportQueue.add({ userId, templateType, parameters }, { attempts: 2, backoff: 'exponential' });
    return job.id.toString();
  }

  async queueNotification(userId: string, type: string, message: string): Promise<string> {
    const job = await notificationQueue.add({ userId, type, message });
    return job.id.toString();
  }

  async getJobStatus(jobId: string, queueName: string): Promise<any> {
    const queues: Record<string, Bull.Queue> = {
      'ai-queries': aiQueryQueue,
      indexing: indexingQueue,
      exports: exportQueue,
      reports: reportQueue,
      notifications: notificationQueue,
    };

    const queue = queues[queueName];
    if (!queue) throw new Error(`Unknown queue: ${queueName}`);

    const job = await queue.getJob(jobId);
    if (!job) return null;

    return {
      id: job.id,
      state: await job.getState(),
      progress: job.progress(),
      data: job.data,
      result: job.returnvalue,
      error: job.failedReason,
    };
  }

  async cancelJob(jobId: string, queueName: string): Promise<void> {
    const queues: Record<string, Bull.Queue> = {
      'ai-queries': aiQueryQueue,
      indexing: indexingQueue,
      exports: exportQueue,
      reports: reportQueue,
      notifications: notificationQueue,
    };

    const queue = queues[queueName];
    if (!queue) throw new Error(`Unknown queue: ${queueName}`);

    await queue.removeJob(jobId);
  }
}

// Helper functions
async function convertToCSV(data: any): Promise<string> {
  // Convert data to CSV format
  const headers = Object.keys(data[0] || {});
  const rows = data.map((item: any) => headers.map(h => item[h]).join(','));
  return [headers.join(','), ...rows].join('\n');
}

async function convertToXLSX(data: any): Promise<string> {
  // In production, use xlsx library
  return JSON.stringify(data);
}

async function convertToPDF(data: any): Promise<string> {
  // In production, use pdf library
  return JSON.stringify(data);
}

async function generatePatentLandscapeReport(params: any): Promise<any> {
  return {
    title: 'Patent Landscape Report',
    parameters: params,
    sections: [
      { name: 'Executive Summary', content: 'Patent landscape overview' },
      { name: 'Competitor Analysis', content: 'Top filers and trends' },
      { name: 'Technology Gaps', content: 'White space opportunities' },
    ],
  };
}

async function generateResearchDigest(params: any): Promise<any> {
  return {
    title: 'Research Digest',
    parameters: params,
    sections: [{ name: 'Key Findings', content: 'Latest research highlights' }],
  };
}

async function generateTeardownSummary(params: any): Promise<any> {
  return {
    title: 'Competitor Teardown',
    parameters: params,
    sections: [{ name: 'Product Analysis', content: 'Detailed breakdown' }],
  };
}

async function generateQuarterlyDeck(params: any): Promise<any> {
  return {
    title: 'Quarterly Intelligence Deck',
    parameters: params,
    sections: [
      { name: 'Market Overview', content: 'Q review' },
      { name: 'Competitive Moves', content: 'Competitor activity' },
      { name: 'Regulatory Changes', content: 'Compliance updates' },
    ],
  };
}

export const queueService = new QueueService();
