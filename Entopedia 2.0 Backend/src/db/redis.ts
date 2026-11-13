import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

let redisClient: RedisClientType | undefined;

// No HTTP route depends on Redis yet (it backs the cache/queue services, which
// are not wired in). src/index.ts therefore treats a failed connection as a
// warning instead of stopping the server.
export const redis = {
  async connect() {
    const client: RedisClientType = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        reconnectStrategy: false,
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

    client.on('error', (err: unknown) => logger.error('Redis error:', err));

    await client.connect();
    redisClient = client;
    logger.info('Redis connected');
  },

  isReady: () => Boolean(redisClient?.isReady),
  get: (key: string) => requireClient().get(key),
  set: (key: string, value: string, ttl?: number) =>
    ttl ? requireClient().setEx(key, ttl, value) : requireClient().set(key, value),
  del: (key: string) => requireClient().del(key),
  exists: (key: string) => requireClient().exists(key),
  incr: (key: string) => requireClient().incr(key),
  getClient: () => redisClient,
};

function requireClient(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis is not connected');
  }
  return redisClient;
}
