import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { db } from '../db/connection';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

router.use(authMiddleware);

router.post('/ask', async (req: AuthRequest, res) => {
  try {
    const { question, modules = [] } = req.body;

    // Fetch relevant context from database based on modules
    let context = '';

    if (modules.includes('competitor')) {
      const competitors = await db.queryMany('SELECT name, threat_score FROM competitors LIMIT 5');
      context += `Top competitors: ${JSON.stringify(competitors)}\n`;
    }

    if (modules.includes('patent')) {
      const patents = await db.queryMany('SELECT patent_number, title, filer FROM patents LIMIT 10');
      context += `Recent patents: ${JSON.stringify(patents)}\n`;
    }

    if (modules.includes('news')) {
      const news = await db.queryMany('SELECT title, source FROM news LIMIT 10');
      context += `Recent news: ${JSON.stringify(news)}\n`;
    }

    // Call Claude API
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 1024,
      system: `You are an AI assistant for Entopedia, a pest intelligence platform. Use the provided context to answer questions accurately. Always cite your sources.`,
      messages: [
        {
          role: 'user',
          content: `Context:\n${context}\n\nQuestion: ${question}`,
        },
      ],
    });

    const response = message.content[0].type === 'text' ? message.content[0].text : '';

    // Log the query
    const queryId = uuidv4();
    await db.query(
      'INSERT INTO ai_queries (id, user_id, modules, query_text, response, confidence_level, tokens_used, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
      [
        queryId,
        req.user?.id,
        modules,
        question,
        response,
        'high',
        message.usage?.output_tokens || 0,
      ]
    );

    res.json({
      query_id: queryId,
      answer: response,
      sources: [],
      confidence_level: 'high',
      tokens_used: message.usage?.output_tokens || 0,
    });
  } catch (error) {
    logger.error('AI ask error:', error);
    res.status(500).json({ error: 'Failed to process question' });
  }
});

router.post('/summarize', async (req: AuthRequest, res) => {
  try {
    const { content, type = 'text' } = req.body;

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Provide a concise summary of the following ${type}:\n\n${content}`,
        },
      ],
    });

    const summary = message.content[0].type === 'text' ? message.content[0].text : '';

    res.json({ summary });
  } catch (error) {
    logger.error('Summarization error:', error);
    res.status(500).json({ error: 'Failed to summarize' });
  }
});

router.get('/query-log', async (req: AuthRequest, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const queries = await db.queryMany(
      'SELECT id, query_text, modules, confidence_level, created_at FROM ai_queries WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [req.user?.id, limit, offset]
    );

    res.json({ queries });
  } catch (error) {
    logger.error('Query log error:', error);
    res.status(500).json({ error: 'Failed to fetch query log' });
  }
});

export default router;
