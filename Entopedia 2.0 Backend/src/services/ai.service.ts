import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/connection';
import { redis } from '../db/redis';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface AIQueryOptions {
  question: string;
  modules: string[];
  userId: string;
  context?: Record<string, any>;
  temperature?: number;
}

export interface AIResponse {
  queryId: string;
  answer: string;
  sources: Array<{ type: string; title: string; relevance: number }>;
  confidence: 'high' | 'medium' | 'low';
  tokensUsed: number;
  retrievedPoints: string[];
  inferredPoints: string[];
}

export class AIService {
  async askQuestion(options: AIQueryOptions): Promise<AIResponse> {
    const { question, modules, userId, context = {}, temperature = 0.7 } = options;

    try {
      // Build context from requested modules
      const contextData = await this.buildContext(modules);

      // Check cache for similar questions
      const cacheKey = `ai:question:${modules.join(',')}-${Buffer.from(question).toString('base64')}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.info('Returning cached AI response');
        return JSON.parse(cached);
      }

      // Prepare system prompt
      const systemPrompt = `You are an expert intelligence analyst for Entopedia, a pest and competitive intelligence platform for Reckitt (Mortein brand).

You have access to the following data:
${JSON.stringify(contextData, null, 2)}

Rules:
1. Always cite your sources with [Source: type/title]
2. Distinguish between retrieved facts and inferred conclusions
3. Rate your confidence in the answer (high/medium/low)
4. Be concise but comprehensive
5. For regulatory or safety questions, always err on the side of caution`;

      // Call Claude API with streaming for better performance
      const message = await anthropic.messages.create({
        model: 'claude-opus-4-1',
        max_tokens: 1500,
        temperature,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: question,
          },
        ],
      });

      const answer = message.content[0].type === 'text' ? message.content[0].text : '';

      // Extract sources and confidence from response
      const sources = this.extractSources(answer, contextData);
      const confidence = this.assessConfidence(answer);
      const { retrieved, inferred } = this.categorizeAnswerPoints(answer);

      const response: AIResponse = {
        queryId: uuidv4(),
        answer,
        sources,
        confidence,
        tokensUsed: message.usage?.output_tokens || 0,
        retrievedPoints: retrieved,
        inferredPoints: inferred,
      };

      // Log query for audit trail
      await this.logQuery(userId, modules, question, response);

      // Cache response
      await redis.set(cacheKey, JSON.stringify(response), 3600); // 1 hour

      return response;
    } catch (error) {
      logger.error('AI service error:', error);
      throw error;
    }
  }

  async generateClaims(productDescription: string, targetMarket: string, photoUrl?: string): Promise<any> {
    try {
      const prompt = `You are a product claims expert. Generate 15-20 potential product claims for:
Product: ${productDescription}
Target Market: ${targetMarket}
${photoUrl ? `Product Image: ${photoUrl}` : ''}

For each claim, provide:
1. Claim text
2. Category (efficacy, safety, speed, durability, etc.)
3. Evidence needed (studies, tests, certifications)
4. Confidence level (high/medium/low)

Format as JSON array with these fields.`;

      const message = await anthropic.messages.create({
        model: 'claude-opus-4-1',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = message.content[0].type === 'text' ? message.content[0].text : '{}';
      const claims = JSON.parse(this.extractJSON(content));

      return claims;
    } catch (error) {
      logger.error('Claim generation error:', error);
      throw error;
    }
  }

  async identifyPest(photoUrl: string): Promise<any> {
    try {
      // In production, use vision API if available
      const prompt = `Analyze this pest image and provide:
1. Species identification
2. Confidence level (0-1)
3. Similar species
4. Geographic distribution
5. Known resistance patterns
6. Recommended control methods

Image URL: ${photoUrl}`;

      const message = await anthropic.messages.create({
        model: 'claude-opus-4-1',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = message.content[0].type === 'text' ? message.content[0].text : '{}';
      return JSON.parse(this.extractJSON(content));
    } catch (error) {
      logger.error('Pest identification error:', error);
      throw error;
    }
  }

  async summarizeDocument(content: string, type: 'patent' | 'paper' | 'regulation' | 'news'): Promise<string> {
    try {
      const prompts: Record<string, string> = {
        patent: `Summarize this patent in 3-4 sentences focusing on: active ingredients, innovation, and applications:\n\n${content}`,
        paper: `Summarize this research paper in 3-4 sentences focusing on: methodology, findings, and implications:\n\n${content}`,
        regulation: `Summarize this regulation in 2-3 sentences focusing on: approval status, restrictions, and market impact:\n\n${content}`,
        news: `Summarize this news article in 2-3 sentences focusing on: key announcement and market implications:\n\n${content}`,
      };

      const message = await anthropic.messages.create({
        model: 'claude-opus-4-1',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompts[type],
          },
        ],
      });

      return message.content[0].type === 'text' ? message.content[0].text : '';
    } catch (error) {
      logger.error('Summarization error:', error);
      throw error;
    }
  }

  private async buildContext(modules: string[]): Promise<Record<string, any>> {
    const context: Record<string, any> = {};

    if (modules.includes('competitor')) {
      context.competitors = await db.queryMany(
        'SELECT name, threat_score, recent_filings_count, ai_summary FROM competitors LIMIT 20'
      );
    }

    if (modules.includes('patent')) {
      context.patents = await db.queryMany(
        'SELECT patent_number, title, filer, filing_date, threat_score FROM patents ORDER BY threat_score DESC LIMIT 30'
      );
    }

    if (modules.includes('regulatory')) {
      context.regulations = await db.queryMany(
        'SELECT active_ingredient, market, approval_status, max_concentration, risk_rating FROM regulations LIMIT 50'
      );
    }

    if (modules.includes('news')) {
      context.news = await db.queryMany(
        'SELECT title, source, category, published_date FROM news ORDER BY published_date DESC LIMIT 20'
      );
    }

    return context;
  }

  private extractSources(answer: string, contextData: Record<string, any>): Array<any> {
    const sources: Array<any> = [];
    const sourcePattern = /\[Source:?\s*([^\]]+)\]/gi;
    const matches = answer.matchAll(sourcePattern);

    for (const match of matches) {
      const sourceRef = match[1].trim();
      sources.push({
        type: sourceRef.split('/')[0] || 'unknown',
        title: sourceRef.split('/')[1] || sourceRef,
        relevance: 0.85,
      });
    }

    return sources.slice(0, 10);
  }

  private assessConfidence(answer: string): 'high' | 'medium' | 'low' {
    const lowConfidenceWords = ['uncertain', 'unclear', 'limited', 'insufficient', 'unclear'];
    const hasLowConfidenceIndicators = lowConfidenceWords.some(word => answer.toLowerCase().includes(word));

    if (hasLowConfidenceIndicators) return 'medium';
    if (answer.length < 100) return 'low';
    return 'high';
  }

  private categorizeAnswerPoints(answer: string): { retrieved: string[]; inferred: string[] } {
    const retrieved: string[] = [];
    const inferred: string[] = [];

    const sentences = answer.split(/[.!?]+/);
    sentences.forEach(sentence => {
      const s = sentence.trim();
      if (s.includes('[Source:')) {
        retrieved.push(s);
      } else if (s.includes('infer') || s.includes('suggest') || s.includes('imply')) {
        inferred.push(s);
      } else if (s.length > 20) {
        retrieved.push(s);
      }
    });

    return { retrieved: retrieved.slice(0, 5), inferred: inferred.slice(0, 5) };
  }

  private extractJSON(text: string): string {
    const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    return jsonMatch ? jsonMatch[0] : '{}';
  }

  private async logQuery(userId: string, modules: string[], query: string, response: AIResponse): Promise<void> {
    try {
      await db.query(
        'INSERT INTO ai_queries (id, user_id, modules, query_text, response, confidence_level, tokens_used, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
        [
          response.queryId,
          userId,
          modules,
          query,
          JSON.stringify(response),
          response.confidence,
          response.tokensUsed,
        ]
      );
    } catch (error) {
      logger.error('Failed to log AI query:', error);
    }
  }
}

export const aiService = new AIService();
