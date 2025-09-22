import Redis, { RedisOptions } from 'ioredis';
import { env } from './environment';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string | undefined;
  db: number;
  ttlDefault: number;
  sessionTtl: number;
  maxRetries: number;
  retryDelay: number;
}

export interface RedisHealthInfo {
  status: 'connected' | 'disconnected';
  latency?: number;
}

class RedisClient {
  private client: Redis | null = null;
  private config: RedisConfig;

  constructor() {
    this.config = {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      ttlDefault: env.REDIS_TTL_DEFAULT,
      sessionTtl: env.REDIS_SESSION_TTL,
      maxRetries: env.REDIS_MAX_RETRIES,
      retryDelay: env.REDIS_RETRY_DELAY,
    };
  }

  async connect(): Promise<void> {
    if (this.client && this.client.status === 'ready') {
      return;
    }

    const redisOptions: RedisOptions = {
      host: this.config.host,
      port: this.config.port,
      db: this.config.db,
      ...(this.config.password && { password: this.config.password }),
      maxRetriesPerRequest: this.config.maxRetries,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
      family: 4,
    };

    this.client = new Redis(redisOptions);

    this.client.on('connect', () => {
      console.log('Redis connection established');
    });

    this.client.on('ready', () => {
      console.log('Redis client ready');
    });

    this.client.on('error', (error) => {
      console.error('Redis connection error:', error);
    });

    this.client.on('close', () => {
      console.log('Redis connection closed');
    });

    this.client.on('reconnecting', () => {
      console.log('Redis reconnecting...');
    });

    try {
      await this.client.connect();
    } catch (connectError) {
      console.error('Failed to connect to Redis:', connectError);
      throw connectError;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
  }

  getClient(): Redis {
    if (!this.client || this.client.status !== 'ready') {
      throw new Error('Redis client is not connected');
    }
    return this.client;
  }

  isConnected(): boolean {
    return this.client !== null && this.client.status === 'ready';
  }

  async ping(): Promise<number> {
    if (!this.isConnected()) {
      throw new Error('Redis client is not connected');
    }

    const start = Date.now();
    await this.client!.ping();
    return Date.now() - start;
  }

  async getHealthInfo(): Promise<RedisHealthInfo> {
    try {
      if (!this.isConnected()) {
        return { status: 'disconnected' };
      }

      const latency = await this.ping();
      return {
        status: 'connected',
        latency,
      };
    } catch (error) {
      return { status: 'disconnected' };
    }
  }

  getConfig(): RedisConfig {
    return { ...this.config };
  }
}

const redisClient = new RedisClient();

export { redisClient };
export default redisClient;