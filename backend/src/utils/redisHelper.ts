import { redisClient } from '../config/redis';

export interface RedisPattern {
  key: string;
  pattern: string;
}

export interface RedisKeyInfo {
  key: string;
  type: string;
  ttl: number;
  size?: number | undefined;
}

export interface RedisBatchOperation<T> {
  operation: 'get' | 'set' | 'del';
  key: string;
  value?: T;
  ttl?: number;
}

export class RedisHelper {
  static generateKey(namespace: string, identifier: string): string {
    return `${namespace}:${identifier}`;
  }

  static generateCacheKey(entity: string, id: string | number): string {
    return this.generateKey(`cache:${entity}`, String(id));
  }

  static generateSessionKey(sessionId: string): string {
    return this.generateKey('session', sessionId);
  }

  static generateUserKey(userId: string, subKey?: string): string {
    const base = this.generateKey('user', userId);
    return subKey ? `${base}:${subKey}` : base;
  }

  static generateLockKey(resource: string): string {
    return this.generateKey('lock', resource);
  }

  static async getKeysByPattern(pattern: string, count: number = 100): Promise<string[]> {
    try {
      const client = redisClient.getClient();
      const keys: string[] = [];
      let cursor = '0';

      do {
        const [newCursor, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', count);
        cursor = newCursor;
        keys.push(...batch);
      } while (cursor !== '0');

      return keys;
    } catch (error) {
      console.error(`Error getting keys by pattern "${pattern}":`, error);
      throw error;
    }
  }

  static async getKeyInfo(key: string): Promise<RedisKeyInfo | null> {
    try {
      const client = redisClient.getClient();
      const exists = await client.exists(key);

      if (!exists) {
        return null;
      }

      const [type, ttl] = await Promise.all([
        client.type(key),
        client.ttl(key)
      ]);

      let size: number | undefined;
      switch (type) {
        case 'string':
          size = await client.strlen(key);
          break;
        case 'list':
          size = await client.llen(key);
          break;
        case 'set':
          size = await client.scard(key);
          break;
        case 'zset':
          size = await client.zcard(key);
          break;
        case 'hash':
          size = await client.hlen(key);
          break;
        default:
          break;
      }

      return {
        key,
        type,
        ttl,
        size
      };
    } catch (error) {
      console.error(`Error getting key info for "${key}":`, error);
      throw error;
    }
  }

  static async deleteKeysByPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.getKeysByPattern(pattern);
      if (keys.length === 0) {
        return 0;
      }

      const client = redisClient.getClient();
      const batchSize = 100;
      let deletedCount = 0;

      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        const result = await client.del(...batch);
        deletedCount += result;
      }

      return deletedCount;
    } catch (error) {
      console.error(`Error deleting keys by pattern "${pattern}":`, error);
      throw error;
    }
  }

  static async acquireLock(
    resource: string,
    ttl: number = 30,
    maxRetries: number = 3,
    retryDelay: number = 100
  ): Promise<string | null> {
    try {
      const lockKey = this.generateLockKey(resource);
      const lockValue = `${Date.now()}-${Math.random()}`;
      const client = redisClient.getClient();

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const result = await client.set(lockKey, lockValue, 'EX', ttl, 'NX');

        if (result === 'OK') {
          return lockValue;
        }

        if (attempt < maxRetries - 1) {
          await new Promise<void>(resolve => {
            const timer = global.setTimeout(() => resolve(), retryDelay);
            return timer;
          });
        }
      }

      return null;
    } catch (error) {
      console.error(`Error acquiring lock for resource "${resource}":`, error);
      throw error;
    }
  }

  static async releaseLock(resource: string, lockValue: string): Promise<boolean> {
    try {
      const lockKey = this.generateLockKey(resource);
      const client = redisClient.getClient();

      const script = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end
      `;

      const result = await client.eval(script, 1, lockKey, lockValue);
      return result === 1;
    } catch (error) {
      console.error(`Error releasing lock for resource "${resource}":`, error);
      throw error;
    }
  }

  static async extendLock(resource: string, lockValue: string, ttl: number): Promise<boolean> {
    try {
      const lockKey = this.generateLockKey(resource);
      const client = redisClient.getClient();

      const script = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("EXPIRE", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = await client.eval(script, 1, lockKey, lockValue, ttl);
      return result === 1;
    } catch (error) {
      console.error(`Error extending lock for resource "${resource}":`, error);
      throw error;
    }
  }

  static async batchOperations<T>(operations: RedisBatchOperation<T>[]): Promise<Array<T | null | boolean>> {
    try {
      const client = redisClient.getClient();
      const pipeline = client.pipeline();

      operations.forEach(op => {
        switch (op.operation) {
          case 'get':
            pipeline.get(op.key);
            break;
          case 'set':
            if (op.value !== undefined) {
              const serializedValue = JSON.stringify(op.value);
              if (op.ttl) {
                pipeline.setex(op.key, op.ttl, serializedValue);
              } else {
                const config = redisClient.getConfig();
                pipeline.setex(op.key, config.ttlDefault, serializedValue);
              }
            }
            break;
          case 'del':
            pipeline.del(op.key);
            break;
        }
      });

      const results = await pipeline.exec();
      if (!results) {
        throw new Error('Pipeline execution failed');
      }

      return results.map((pipelineResult, index) => {
        if (!pipelineResult) {
          throw new Error(`Pipeline result at index ${index} is undefined`);
        }

        const [err, result] = pipelineResult;
        if (err) {
          throw err;
        }

        const operation = operations[index];
        if (!operation) {
          throw new Error(`Operation at index ${index} is undefined`);
        }

        switch (operation.operation) {
          case 'get':
            try {
              return result ? JSON.parse(result as string) : null;
            } catch {
              return result as T;
            }
          case 'set':
            return result === 'OK';
          case 'del':
            return (result as number) > 0;
          default:
            return result as T;
        }
      });
    } catch (error) {
      console.error('Error executing batch operations:', error);
      throw error;
    }
  }

  static async setWithBackup<T>(
    primaryKey: string,
    backupKey: string,
    value: T,
    ttl?: number
  ): Promise<boolean> {
    try {
      const client = redisClient.getClient();
      const pipeline = client.pipeline();
      const serializedValue = JSON.stringify(value);

      const config = redisClient.getConfig();
      const actualTtl = ttl || config.ttlDefault;

      pipeline.setex(primaryKey, actualTtl, serializedValue);
      pipeline.setex(backupKey, actualTtl, serializedValue);

      const results = await pipeline.exec();
      return results ? results.every(([err, result]) => err === null && result === 'OK') : false;
    } catch (error) {
      console.error(`Error setting with backup (${primaryKey}, ${backupKey}):`, error);
      throw error;
    }
  }

  static async getWithFallback<T>(primaryKey: string, fallbackKey: string): Promise<T | null> {
    try {
      const client = redisClient.getClient();
      const [primary, fallback] = await client.mget(primaryKey, fallbackKey);

      const tryParse = (value: string | null | undefined): T | null => {
        if (!value) return null;
        try {
          return JSON.parse(value);
        } catch {
          return value as T;
        }
      };

      return tryParse(primary) || tryParse(fallback);
    } catch (error) {
      console.error(`Error getting with fallback (${primaryKey}, ${fallbackKey}):`, error);
      throw error;
    }
  }

  static async getMemoryUsage(): Promise<{
    used: number;
    peak: number;
    totalSystemMemory: number;
    usedMemoryRss: number;
  }> {
    try {
      const client = redisClient.getClient();
      const memoryInfo = await client.info('memory');
      const lines = memoryInfo.split('\r\n');
      const stats: Record<string, string> = {};

      lines.forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      });

      return {
        used: parseInt(stats['used_memory'] || '0'),
        peak: parseInt(stats['used_memory_peak'] || '0'),
        totalSystemMemory: parseInt(stats['total_system_memory'] || '0'),
        usedMemoryRss: parseInt(stats['used_memory_rss'] || '0'),
      };
    } catch (error) {
      console.error('Error getting memory usage:', error);
      throw error;
    }
  }

  static async getConnectionInfo(): Promise<{
    connectedClients: number;
    blockedClients: number;
    totalConnectionsReceived: number;
  }> {
    try {
      const client = redisClient.getClient();
      const info = await client.info('clients');
      const lines = info.split('\r\n');
      const stats: Record<string, string> = {};

      lines.forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      });

      return {
        connectedClients: parseInt(stats['connected_clients'] || '0'),
        blockedClients: parseInt(stats['blocked_clients'] || '0'),
        totalConnectionsReceived: parseInt(stats['total_connections_received'] || '0'),
      };
    } catch (error) {
      console.error('Error getting connection info:', error);
      throw error;
    }
  }

  static parseRedisUrl(url: string): {
    host: string;
    port: number;
    password?: string | undefined;
    db?: number | undefined;
  } {
    try {
      const parsed = new global.URL(url);

      return {
        host: parsed.hostname,
        port: parseInt(parsed.port) || 6379,
        password: parsed.password || undefined,
        db: parsed.pathname ? parseInt(parsed.pathname.slice(1)) || 0 : 0,
      };
    } catch {
      throw new Error(`Invalid Redis URL: ${url}`);
    }
  }
}

export default RedisHelper;