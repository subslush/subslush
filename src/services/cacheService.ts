import { redisClient } from '../config/redis';
import { Logger } from '../utils/logger';

export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<boolean>;
  del(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  hget<T>(key: string, field: string): Promise<T | null>;
  hset<T>(key: string, field: string, value: T): Promise<boolean>;
  hgetall<T>(key: string): Promise<Record<string, T>>;
  expire(key: string, ttl: number): Promise<boolean>;
  ttl(key: string): Promise<number>;
  flushdb(): Promise<void>;
}

class RedisCacheService implements CacheService {
  private serializeValue<T>(value: T): string {
    try {
      return JSON.stringify(value);
    } catch (error) {
      throw new Error(`Failed to serialize value: ${error}`);
    }
  }

  private deserializeValue<T>(value: string | null): T | null {
    if (value === null) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      throw new Error(`Failed to deserialize value: ${error}`);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const client = redisClient.getClient();
      const value = await client.get(key);
      return this.deserializeValue<T>(value);
    } catch (error) {
      Logger.error(`Cache GET error for key "${key}":`, error);
      throw error;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      const client = redisClient.getClient();
      const serializedValue = this.serializeValue(value);

      if (ttl !== undefined && ttl > 0) {
        const result = await client.setex(key, ttl, serializedValue);
        return result === 'OK';
      } else {
        const config = redisClient.getConfig();
        const result = await client.setex(
          key,
          config.ttlDefault,
          serializedValue
        );
        return result === 'OK';
      }
    } catch (error) {
      Logger.error(`Cache SET error for key "${key}":`, error);
      throw error;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      const client = redisClient.getClient();
      const result = await client.del(key);
      return result > 0;
    } catch (error) {
      Logger.error(`Cache DEL error for key "${key}":`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const client = redisClient.getClient();
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      Logger.error(`Cache EXISTS error for key "${key}":`, error);
      throw error;
    }
  }

  async hget<T>(key: string, field: string): Promise<T | null> {
    try {
      const client = redisClient.getClient();
      const value = await client.hget(key, field);
      return this.deserializeValue<T>(value);
    } catch (error) {
      Logger.error(
        `Cache HGET error for key "${key}", field "${field}":`,
        error
      );
      throw error;
    }
  }

  async hset<T>(key: string, field: string, value: T): Promise<boolean> {
    try {
      const client = redisClient.getClient();
      const serializedValue = this.serializeValue(value);
      const result = await client.hset(key, field, serializedValue);
      return result >= 0;
    } catch (error) {
      Logger.error(
        `Cache HSET error for key "${key}", field "${field}":`,
        error
      );
      throw error;
    }
  }

  async hgetall<T>(key: string): Promise<Record<string, T>> {
    try {
      const client = redisClient.getClient();
      const result = await client.hgetall(key);

      const deserializedResult: Record<string, T> = {};
      for (const [field, value] of Object.entries(result)) {
        deserializedResult[field] = this.deserializeValue<T>(value)!;
      }

      return deserializedResult;
    } catch (error) {
      Logger.error(`Cache HGETALL error for key "${key}":`, error);
      throw error;
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      const client = redisClient.getClient();
      const result = await client.expire(key, ttl);
      return result === 1;
    } catch (error) {
      Logger.error(`Cache EXPIRE error for key "${key}":`, error);
      throw error;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      const client = redisClient.getClient();
      return await client.ttl(key);
    } catch (error) {
      Logger.error(`Cache TTL error for key "${key}":`, error);
      throw error;
    }
  }

  async flushdb(): Promise<void> {
    try {
      const client = redisClient.getClient();
      await client.flushdb();
    } catch (error) {
      Logger.error('Cache FLUSHDB error:', error);
      throw error;
    }
  }

  async multiGet<T>(keys: string[]): Promise<Array<T | null>> {
    try {
      const client = redisClient.getClient();
      const values = await client.mget(...keys);
      return values.map(value => this.deserializeValue<T>(value));
    } catch (error) {
      Logger.error(`Cache MGET error for keys "${keys.join(', ')}":`, error);
      throw error;
    }
  }

  async multiSet<T>(
    keyValuePairs: Array<{ key: string; value: T; ttl?: number }>
  ): Promise<boolean> {
    try {
      const client = redisClient.getClient();
      const pipeline = client.pipeline();

      for (const { key, value, ttl } of keyValuePairs) {
        const serializedValue = this.serializeValue(value);
        if (ttl !== undefined && ttl > 0) {
          pipeline.setex(key, ttl, serializedValue);
        } else {
          const config = redisClient.getConfig();
          pipeline.setex(key, config.ttlDefault, serializedValue);
        }
      }

      const results = await pipeline.exec();
      return results
        ? results.every(([err, result]) => err === null && result === 'OK')
        : false;
    } catch (error) {
      Logger.error('Cache MSET error:', error);
      throw error;
    }
  }

  async increment(key: string, delta: number = 1): Promise<number> {
    try {
      const client = redisClient.getClient();
      return await client.incrby(key, delta);
    } catch (error) {
      Logger.error(`Cache INCREMENT error for key "${key}":`, error);
      throw error;
    }
  }

  async decrement(key: string, delta: number = 1): Promise<number> {
    try {
      const client = redisClient.getClient();
      return await client.decrby(key, delta);
    } catch (error) {
      Logger.error(`Cache DECREMENT error for key "${key}":`, error);
      throw error;
    }
  }
}

export const cacheService = new RedisCacheService();
export default cacheService;
