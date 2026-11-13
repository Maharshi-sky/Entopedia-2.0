# Deployment Guide - Entopedia 2.0 Backend

## Local Development Setup

### Prerequisites
- Docker & Docker Compose
- Node.js 18+
- PostgreSQL client (psql)
- Redis CLI (optional)

### Quick Start
```bash
# Clone and setup
cd backend
cp .env.example .env

# Start infrastructure
docker-compose -f docker-compose.extended.yml up -d

# Install dependencies
npm install

# Run migrations
npm run db:migrate
npm run db:seed

# Start development server
npm run dev
```

Server runs on `http://localhost:4000` locally (`PORT` in `.env`; the Next.js frontend uses 3000)
- Elasticsearch: `http://localhost:9200`
- Kibana: `http://localhost:5601`
- Grafana: `http://localhost:3001` (admin/admin)
- MinIO: `http://localhost:9001` (minioadmin/minioadmin)

## Docker Deployment

### Building Image
```bash
docker build -t entopedia-backend:latest .
```

### Docker Compose Production Setup
```bash
docker-compose -f docker-compose.extended.yml \
  -f docker-compose.prod.yml up -d
```

### Environment Variables
Create `.env.prod`:
```bash
NODE_ENV=production
PORT=3000

# Database
DB_HOST=postgres-prod
DB_PORT=5432
DB_NAME=entopedia_prod
DB_USER=postgres_user
DB_PASSWORD=<strong-password>

# Redis
REDIS_HOST=redis-prod
REDIS_PORT=6379
REDIS_PASSWORD=<redis-password>

# API Keys
JWT_SECRET=<generate-with-openssl-rand-hex-32>
ANTHROPIC_API_KEY=<your-api-key>

# URLs
CORS_ORIGIN=https://entopedia.reckitt.com
API_URL=https://api.entopedia.reckitt.com

# Elasticsearch
ELASTICSEARCH_URL=https://elasticsearch-prod:9200
ELASTICSEARCH_USER=elastic
ELASTICSEARCH_PASSWORD=<password>
```

## Kubernetes Deployment

### Prerequisites
- kubectl configured
- Kubernetes cluster (EKS, GKE, AKS)
- Helm package manager

### Create Namespace
```bash
kubectl create namespace entopedia
```

### Database Secrets
```bash
kubectl create secret generic db-credentials \
  --from-literal=username=postgres \
  --from-literal=password=<password> \
  -n entopedia
```

### Deploy with Helm
```bash
helm create entopedia-backend
cd entopedia-backend

# Update values.yaml
# Set image repository, replicas, resources, etc.

helm install entopedia . -n entopedia
```

### Manual Kubernetes Manifests

#### Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: entopedia-backend
  namespace: entopedia
spec:
  replicas: 3
  selector:
    matchLabels:
      app: entopedia-backend
  template:
    metadata:
      labels:
        app: entopedia-backend
    spec:
      containers:
      - name: api
        image: entopedia-backend:latest
        ports:
        - containerPort: 3000
        env:
        - name: DB_HOST
          value: postgres-service
        - name: REDIS_HOST
          value: redis-service
        - name: ELASTICSEARCH_URL
          value: http://elasticsearch-service:9200
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 20
          periodSeconds: 5
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

#### Service
```yaml
apiVersion: v1
kind: Service
metadata:
  name: entopedia-backend
  namespace: entopedia
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 3000
  selector:
    app: entopedia-backend
```

#### Ingress
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: entopedia-backend
  namespace: entopedia
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - api.entopedia.reckitt.com
    secretName: entopedia-tls
  rules:
  - host: api.entopedia.reckitt.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: entopedia-backend
            port:
              number: 80
```

## Database Migration

### PostgreSQL Setup (Production)
```sql
-- Create database
CREATE DATABASE entopedia_prod;

-- Create user with limited privileges
CREATE USER entopedia_user WITH PASSWORD '<password>';

-- Grant privileges
GRANT CONNECT ON DATABASE entopedia_prod TO entopedia_user;
GRANT USAGE ON SCHEMA public TO entopedia_user;
GRANT CREATE ON SCHEMA public TO entopedia_user;

-- Enable extensions
\c entopedia_prod
CREATE EXTENSION IF NOT EXISTS uuid-ossp;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### Run Migrations
```bash
# From app container or locally
npm run db:migrate

# Verify
psql -h $DB_HOST -U $DB_USER -d entopedia_prod -c '\dt'
```

## Elasticsearch Setup

### Create Index Template
```bash
curl -X PUT "localhost:9200/_index_template/entopedia" \
  -H 'Content-Type: application/json' \
  -d '{
    "index_patterns": ["entopedia*"],
    "template": {
      "settings": {
        "number_of_shards": 3,
        "number_of_replicas": 1
      },
      "mappings": {
        "properties": {
          "type": { "type": "keyword" },
          "title": { "type": "text" },
          "content": { "type": "text" },
          "date": { "type": "date" }
        }
      }
    }
  }'
```

### Backup
```bash
# Snapshot repository
curl -X PUT "localhost:9200/_snapshot/backup" \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "fs",
    "settings": {
      "location": "/mnt/backups"
    }
  }'

# Create snapshot
curl -X PUT "localhost:9200/_snapshot/backup/snap_$(date +%Y%m%d)"
```

## Redis Setup

### Production Configuration
```bash
# redis.conf
requirepass <strong-password>
maxmemory 2gb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
```

### Persistence
```bash
# Enable AOF
redis-cli CONFIG SET appendonly yes

# Check status
redis-cli INFO persistence
```

## Monitoring & Logging

### Prometheus
Already configured in docker-compose. Access at `http://localhost:9090`

**Queries:**
```
# Request rate
rate(http_requests_total[5m])

# Error rate
rate(http_requests_total{status=~"5.."}[5m])

# Database connections
pg_stat_activity_count
```

### Grafana Dashboards
1. Navigate to `http://localhost:3001`
2. Add Prometheus data source
3. Import dashboard JSON or create custom dashboards

### Logging
```bash
# View app logs
docker logs entopedia-backend -f

# View PostgreSQL logs
docker logs entopedia-postgres

# View Redis logs
docker logs entopedia-redis
```

### ELK Stack (Elasticsearch, Logstash, Kibana)
```bash
# Logs go to Elasticsearch automatically
# View in Kibana: http://localhost:5601

# Create index pattern: logstash-*
# Explore logs in Discover tab
```

## Backup & Recovery

### PostgreSQL Backup
```bash
# Full backup
pg_dump -h $DB_HOST -U $DB_USER entopedia_prod > backup.sql

# Compressed
pg_dump -h $DB_HOST -U $DB_USER -Fc entopedia_prod > backup.dump

# Restore
psql -h $DB_HOST -U $DB_USER entopedia_prod < backup.sql
pg_restore -h $DB_HOST -U $DB_USER -d entopedia_prod backup.dump
```

### Redis Backup
```bash
# RDB snapshot
redis-cli --rdb /backups/dump.rdb

# AOF rewrite
redis-cli BGREWRITEAOF

# Copy to backup location
cp /var/lib/redis/dump.rdb /backups/$(date +%Y%m%d).rdb
```

### S3 Backup (MinIO)
```bash
# Configure mc client
mc alias set minio http://localhost:9000 minioadmin minioadmin

# Backup files
mc mirror --watch minio/entopedia /backups/minio
```

## Health Checks

### API Health
```bash
curl http://localhost:3000/health

# Should return: {"status":"ok","timestamp":"..."}
```

### Database Health
```bash
# From container
docker exec entopedia-postgres pg_isready -U postgres

# From app
curl http://localhost:3000/api/admin/usage-metrics \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Queue Status
```bash
# Check Bull queue
npm run inspect-queues

# Should show job counts by status
```

## Scaling

### Horizontal Scaling
1. Increase replicas in Kubernetes
2. Load balancer distributes traffic
3. All instances share Redis/PostgreSQL/Elasticsearch

```bash
# Scale replicas
kubectl scale deployment entopedia-backend --replicas=5 -n entopedia
```

### Vertical Scaling
- Increase container memory/CPU in deployment
- Increase database resource allocation
- Add Elasticsearch nodes

### Auto-scaling
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: entopedia-backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: entopedia-backend
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

## Rollback

### Kubernetes Rollback
```bash
# View rollout history
kubectl rollout history deployment entopedia-backend -n entopedia

# Rollback to previous
kubectl rollout undo deployment entopedia-backend -n entopedia

# Rollback to specific revision
kubectl rollout undo deployment entopedia-backend --to-revision=2 -n entopedia
```

### Database Rollback
```bash
# If migration fails, restore from backup
pg_restore -h $DB_HOST -U $DB_USER -d entopedia_prod backup.dump
```

## Security

### SSL/TLS
```bash
# Generate self-signed certificate (dev only)
openssl req -x509 -newkey rsa:4096 -nodes -out cert.pem -keyout key.pem -days 365

# Use Let's Encrypt in production
certbot certonly --standalone -d api.entopedia.reckitt.com
```

### Secrets Management
```bash
# Kubernetes Secrets
kubectl create secret generic app-secrets \
  --from-literal=jwt-secret=$JWT_SECRET \
  --from-literal=db-password=$DB_PASSWORD \
  -n entopedia

# Use in deployment via env variables
env:
  - name: JWT_SECRET
    valueFrom:
      secretKeyRef:
        name: app-secrets
        key: jwt-secret
```

### Firewall Rules
```
- Allow port 443 (HTTPS) from anywhere
- Allow port 5432 (PostgreSQL) only from app servers
- Allow port 6379 (Redis) only from app servers
- Allow port 9200 (Elasticsearch) only from app servers
```

## Performance Tuning

### PostgreSQL Tuning
```sql
-- Increase max connections
ALTER SYSTEM SET max_connections = 200;

-- Increase shared buffers (25% of RAM)
ALTER SYSTEM SET shared_buffers = '8GB';

-- Increase work memory
ALTER SYSTEM SET work_mem = '64MB';

-- Enable parallel queries
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;

-- Apply changes
SELECT pg_reload_conf();
```

### Redis Tuning
```
# Increase max memory
maxmemory 4gb

# Optimize for throughput
tcp-backlog 511
timeout 0
tcp-keepalive 300
```

### Application Tuning
- Increase Node.js heap: `NODE_OPTIONS=--max-old-space-size=2048`
- Connection pooling: `DB_POOL_SIZE=20`
- Cache TTL optimization based on usage patterns
- Queue worker concurrency tuning

## Monitoring Alerts

### Key Alerts
1. **API Latency**: p95 > 500ms
2. **Error Rate**: > 1% of requests
3. **Database Connections**: > 80% of max
4. **Redis Memory**: > 80% of max
5. **Elasticsearch Disk**: > 80% of available
6. **Queue Depth**: > 1000 pending jobs

### Alert Configuration (Prometheus)
```yaml
groups:
  - name: entopedia
    rules:
    - alert: HighErrorRate
      expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
      for: 5m
      annotations:
        summary: "High error rate detected"
```

## Troubleshooting

### Common Issues

**Database connection fails**
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Test connection
psql -h localhost -U postgres -d entopedia
```

**Elasticsearch out of disk**
```bash
# Check disk usage
curl localhost:9200/_cat/allocation

# Delete old indices
curl -X DELETE localhost:9200/logstash-2024.01.*
```

**High memory usage**
```bash
# Check top consumers
redis-cli INFO memory
curl localhost:9200/_cat/segments

# Restart container
docker restart entopedia-backend
```

**Queue jobs stuck**
```bash
# Check queue status
npm run inspect-queues

# Clear stuck jobs
redis-cli KEYS "bull:*" | xargs redis-cli DEL
```

## Compliance & Auditing

### Data Retention
- Audit logs: 2 years
- Analytics events: 1 year
- File uploads: 6 months (unless pinned)
- AI query logs: 3 years

### GDPR Compliance
```bash
# Delete user data
DELETE FROM users WHERE id = $1 CASCADE;

# Purge PII from backups
pg_dump --exclude-table-data=users > backup_anonymized.sql
```

### Audit Trail
```bash
# View all user actions
SELECT * FROM user_activity_log 
  WHERE user_id = $1 
  ORDER BY created_at DESC;
```

## Disaster Recovery Plan

### RTO/RPO Targets
- **RTO** (Recovery Time Objective): 4 hours
- **RPO** (Recovery Point Objective): 1 hour

### Steps
1. Restore PostgreSQL from latest backup
2. Restore Elasticsearch indices from snapshot
3. Restore MinIO data from backup
4. Update DNS to new infrastructure
5. Run health checks
6. Notify stakeholders
