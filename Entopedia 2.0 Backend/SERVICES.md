# Entopedia Services Documentation

## Service Architecture

All business logic is encapsulated in service classes for maintainability and reusability.

## 1. AI Service (`ai.service.ts`)

### Purpose
Integrates Claude API for all AI-powered features across the platform.

### Key Methods

#### `askQuestion(options: AIQueryOptions): Promise<AIResponse>`
Multi-module natural language Q&A with source citations.

**Input:**
```typescript
{
  question: "What are the regulatory risks for pyrethroid in EU?",
  modules: ["regulatory", "patent", "competitor"],
  userId: "user-123",
  temperature: 0.7
}
```

**Output:**
```typescript
{
  queryId: "uuid",
  answer: "The EU has increasingly restricted pyrethroid use...",
  sources: [
    { type: "regulation", title: "EU Regulation 2021...", relevance: 0.95 }
  ],
  confidence: "high",
  tokensUsed: 245,
  retrievedPoints: ["..."],
  inferredPoints: ["..."]
}
```

**Context Building:** Dynamically fetches data from PostgreSQL based on requested modules:
- **competitor**: Top 20 competitors by threat score
- **patent**: 30 highest-threat patents
- **regulatory**: 50 active regulations
- **news**: 20 latest news articles

**Caching:** Results cached for 1 hour by question+modules hash to reduce API costs.

#### `generateClaims(productDescription: string, targetMarket: string, photoUrl?: string): Promise<Claim[]>`
AI-powered claim generation for product marketing.

**Returns:**
```typescript
[
  {
    text: "Kills 99.9% of common household pests",
    category: "efficacy",
    evidence_needed: ["lab_study", "field_trial"],
    confidence: 0.95
  }
]
```

#### `identifyPest(photoUrl: string): Promise<PestIdentification>`
Species identification from photo with confidence scoring.

**Returns:**
```typescript
{
  species: "Culex quinquefasciatus",
  confidence: 0.94,
  similar_species: ["Culex pipiens", "Aedes aegypti"],
  geographic_distribution: ["Sub-Saharan Africa", "South Asia"],
  resistance_patterns: "Moderate pyrethroid resistance",
  control_methods: ["..."]
}
```

#### `summarizeDocument(content: string, type: string): Promise<string>`
Contextual summarization by document type.

**Types:** patent, paper, regulation, news
- **patent**: Focus on innovation & applications
- **paper**: Methodology & findings
- **regulation**: Approval status & restrictions
- **news**: Key announcement & market impact

### Error Handling
- API failures retry with exponential backoff
- Timeout after 30 seconds
- Returns graceful error responses
- All errors logged for debugging

### Cost Optimization
- Caches Q&A responses to avoid duplicate queries
- Batch processes summaries
- Truncates large documents before API call
- Token counting for cost tracking

---

## 2. Search Service (`search.service.ts`)

### Purpose
Full-text search across all intelligence data via Elasticsearch.

### Key Methods

#### `search(query: SearchQuery): Promise<SearchResult[]>`
Multi-field fuzzy search with filtering.

**Query Structure:**
```typescript
{
  q: "pyrethroid formulation",
  types: ["patent", "news"],
  filters: {
    dateFrom: new Date("2023-01-01"),
    dateTo: new Date("2024-12-31"),
    filer: "SC Johnson",
    market: "EU",
    threatScore: [0.7, 1.0]
  },
  limit: 20,
  offset: 0
}
```

**Results:**
```typescript
{
  id: "patent-123",
  type: "patent",
  title: "Novel pyrethroid formulation",
  snippet: "A novel formulation combining pyrethroid with...",
  relevance: 0.92,
  metadata: {
    filer: "SC Johnson",
    threatScore: 0.88,
    date: "2023-06-15"
  }
}
```

#### `indexPatent(patentId: string): Promise<void>`
Index patent for full-text search.

**Indexed Fields:**
- title (3x weight)
- abstract
- active_ingredients
- ai_summary
- threat_score
- filing_date

#### `indexNews(newsId: string): Promise<void>`
Index news article.

**Indexed Fields:**
- title
- content
- summary
- published_date
- source
- category

#### `indexCompetitor(competitorId: string): Promise<void>`
Index competitor profile.

**Indexed Fields:**
- name
- summary
- threat_score
- filing_count
- country

#### `bulkIndex(documents: BulkIndexJob[]): Promise<void>`
Batch index up to 1000 documents in one operation.

### Elasticsearch Configuration
- **Shards:** 1 (development), 3+ (production)
- **Replicas:** 1
- **Analyzer:** Standard English with stopwords
- **Refresh Interval:** 1 second

### Query Performance
- Typical query: < 500ms
- Fuzzy matching allows typos: `pyrethrin` matches `pyrethroid`
- Wildcard queries: `pyrethr*` matches all variants
- Phrase matching: `"novel formulation"` exact phrase

---

## 3. Cache Service (`cache.service.ts`)

### Purpose
Redis-based caching for query results, profiles, and frequently accessed data.

### Key Methods

#### `get<T>(key: string): Promise<T | null>`
Retrieve cached value with auto-deserialization.

#### `set<T>(key: string, value: T, ttl?: number): Promise<void>`
Cache value with optional TTL (seconds).

**Default TTL:** 3600 (1 hour)

#### `del(key: string): Promise<void>`
Delete specific cache key.

#### `invalidatePattern(pattern: string): Promise<void>`
Invalidate all keys matching pattern (e.g., `competitor:*`).

### Domain-Specific Cache Keys

**Naming Convention:** `{domain}:{id}:{context}`

| Key Pattern | TTL | Use Case |
|-------------|-----|----------|
| `patent:{id}` | 24h | Patent profile |
| `competitor:{id}` | 6h | Competitor profile |
| `news:{id}` | 3h | News article |
| `dashboard:{userId}:{range}` | 1h | Dashboard KPIs |
| `search:{hash}` | 1h | Search results |
| `ai:{hash}` | 3h | AI responses |

### Invalidation Strategy

**On Update:** Delete specific key
```typescript
await cacheService.invalidatePatent(patentId);
```

**On Related Change:** Invalidate pattern
```typescript
await cacheService.invalidateCompetitor(competitorId);
// Invalidates all caches mentioning this competitor
```

**Cache Warming:** Pre-populate cache for hot data
```typescript
const competitors = await cacheService.warmCache(
  'competitors:top10',
  () => db.query('SELECT * FROM competitors ... LIMIT 10'),
  86400 // 24 hours
);
```

### Memory Management
- Set `maxmemory` policy in Redis: `allkeys-lru`
- Monitor cache hit rate with Prometheus
- Evicts least recently used keys when memory full

---

## 4. Queue Service (`queue.service.ts`)

### Purpose
Asynchronous job processing for long-running operations.

### Queues

#### AI Query Queue
- **Use:** Process AI questions asynchronously
- **Concurrency:** 5 workers
- **Retries:** 3 attempts with exponential backoff
- **Timeout:** 60 seconds

```typescript
const jobId = await queueService.queueAIQuery(
  userId,
  "What are launch signals from competitors?",
  ["competitor", "patent"]
);
```

#### Indexing Queue
- **Use:** Full-text search indexing
- **Concurrency:** 10 workers
- **Retries:** 2 attempts
- **Timeout:** 30 seconds

```typescript
await queueService.queueIndexing(patentId, "patent");
```

#### Export Queue
- **Use:** CSV/PDF/XLSX generation
- **Concurrency:** 3 workers
- **Retries:** 3 attempts
- **Timeout:** 120 seconds

```typescript
const jobId = await queueService.queueExport(
  userId,
  "csv",
  patentData,
  "patents_Q1_2024.csv"
);
```

#### Report Queue
- **Use:** Template-based report generation
- **Concurrency:** 2 workers
- **Retries:** 2 attempts
- **Timeout:** 180 seconds

```typescript
const jobId = await queueService.queueReportGeneration(
  userId,
  "patent_landscape",
  { timeRange: "90d", competitors: [...] }
);
```

#### Notification Queue
- **Use:** Send user notifications
- **Concurrency:** 20 workers
- **Retries:** 3 attempts
- **Timeout:** 10 seconds

```typescript
await queueService.queueNotification(
  userId,
  "patent_filed",
  "SC Johnson filed 3 new patents"
);
```

### Job Status Tracking

```typescript
const status = await queueService.getJobStatus(jobId, 'ai-queries');

// Returns:
{
  id: "job-123",
  state: "active|completed|failed|delayed",
  progress: 50, // percentage
  data: { /* job input */ },
  result: { /* output */ },
  error: null
}
```

### Dead-Letter Queue
Failed jobs after max retries are stored in DLQ for review:

```sql
SELECT * FROM failed_jobs WHERE queue = 'ai-queries' ORDER BY created_at DESC;
```

---

## 5. Notification Service (`notification.service.ts`)

### Purpose
User alerts and real-time notifications for intelligence updates.

### Key Methods

#### `createNotification(notification: NotificationData): Promise<string>`
Create and queue notification.

**Types:**
- `alert` - System alerts
- `patent_filed` - New patent filing
- `competitor_move` - Competitor activity
- `regulatory_change` - Regulation updates
- `news_update` - News articles

**Severity Levels:** critical, high, medium, low

#### `notifyPatentFiled(patentData, relevantUsers)`
Alert relevant users about new patent.

**Triggers:** When threat_score > 0.7
**Recipients:** Users following the filer/active ingredient

#### `notifyCompetitorMove(competitorData, relevantUsers)`
Alert about competitor activity spike.

**Triggers:** When filings > 5 in 30 days
**Recipients:** Users following the competitor

#### `notifyRegulatoryChange(regulationData, relevantUsers)`
Alert about regulatory status change.

**Triggers:** Approval status changes (esp. suspended)
**Recipients:** Regulatory specialists + admins

#### `notifyNewsUpdate(newsData, relevantUsers)`
Alert about relevant news articles.

**Triggers:** Published in watched categories
**Recipients:** Users subscribed to category

### Notification Delivery
1. **Database:** Stored in `notifications` table
2. **WebSocket:** Real-time push (if user online)
3. **Email:** Via queue service (future)
4. **Push Notifications:** Mobile app alerts (future)

### User Preferences
```typescript
{
  email_on_critical: true,
  email_on_high: true,
  email_on_medium: false,
  push_notifications: true,
  digest_frequency: "daily", // daily, weekly, off
  categories: ["regulatory", "competitor_move"]
}
```

---

## 6. Analytics Service (`analytics.service.ts`)

### Purpose
Platform-wide metrics and usage analytics.

### Key Methods

#### `getAnalytics(period: string): Promise<Analytics>`
Platform-wide statistics.

**Periods:** 7d, 30d, 90d, 365d

**Returns:**
```typescript
{
  activeUsers: 145,
  totalQueries: 2341,
  averageQueryTime: 250, // ms
  topModules: [
    { module: "patent", count: 512 },
    { module: "regulatory", count: 389 }
  ],
  aiQueryStats: {
    totalQueries: 892,
    averageTokens: 245,
    confidenceLevels: { high: 650, medium: 200, low: 42 }
  },
  patentStats: {
    totalIndexed: 15342,
    newThisMonth: 342,
    threatScoreDistribution: { ... }
  },
  newsStats: {
    totalArticles: 8934,
    categoriesCount: { ... },
    sourceBreakdown: { ... }
  }
}
```

#### `trackEvent(userId: string, eventType: string, metadata: any)`
Record custom event for analysis.

**Event Types:**
- `search`, `view_patent`, `view_competitor`, `generate_claim`, `generate_report`, etc.

#### `getUserAnalytics(userId: string)`
Individual user statistics.

**Returns:**
```typescript
{
  totalQueries: 45,
  lastActive: "2024-01-15T14:30:00Z",
  moduleUsage: [
    { module: "patent", count: 23 },
    { module: "competitor", count: 22 }
  ]
}
```

### Dashboard Metrics
Displayed in Grafana with auto-refresh:
- Daily active users
- Average query latency (p50, p95, p99)
- Error rate
- Queue depths
- Cache hit rate
- Database query performance

---

## Service Integration Example

### Complete User Flow: Patent Search → Generate Report

```typescript
// 1. User searches (Search Service)
const results = await searchService.search({
  q: "pyrethroid",
  types: ["patent"],
  filters: { dateFrom: new Date("2023-01-01") }
});

// 2. Generate report (Queue Service)
const jobId = await queueService.queueReportGeneration(
  userId,
  "patent_landscape",
  { patents: results.map(r => r.id) }
);

// 3. WebSocket updates via Socket.IO
io.to(`user:${userId}`).emit('report-progress', {
  jobId,
  progress: 25
});

// 4. Summarize findings (AI Service)
const summary = await aiService.summarizeDocument(
  patentContent,
  "patent"
);

// 5. Cache the report (Cache Service)
await cacheService.set(
  `report:${jobId}`,
  reportData,
  86400 // 24 hours
);

// 6. Create notification (Notification Service)
await notificationService.createNotification({
  userId,
  type: "alert",
  title: "Report Generated",
  message: `Patent landscape report ready for download`,
  sourceModule: "deliverables"
});

// 7. Track event (Analytics Service)
await analyticsService.trackEvent(userId, 'report_generated', {
  template: 'patent_landscape',
  patents_count: results.length
});
```

---

## Service Dependencies

```
┌─────────────────┐
│  Route Handler  │
└────────┬────────┘
         │
    ┌────┴─────────────────────────────────┐
    │                                       │
    ↓                                       ↓
┌──────────────────────┐         ┌──────────────────┐
│   Service Layer      │         │  Data Layer      │
│  ┌────────────────┐  │         │  ┌────────────┐  │
│  │ AI Service     │  │         │  │ PostgreSQL │  │
│  │ Search Service │  │         │  │ Redis      │  │
│  │ Cache Service  │  ├────────→│  │ Elastics.  │  │
│  │ Queue Service  │  │         │  └────────────┘  │
│  │ Notif Service  │  │         │                  │
│  │ Analytics Svc  │  │         └──────────────────┘
│  └────────────────┘  │
└──────────────────────┘
```

---

## Best Practices

1. **Always use cache** for frequently accessed data
2. **Queue long operations** (> 5 seconds)
3. **Log all errors** with context for debugging
4. **Validate input** in route handler before service call
5. **Handle timeouts** gracefully
6. **Monitor queue depth** to prevent backlog
7. **Cache bust** when data changes
8. **Batch index operations** for Elasticsearch
9. **Track analytics** for usage insights
10. **Use transactions** for multi-step operations
