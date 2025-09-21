import { redisClient } from '../config/redis';
import { cacheService } from '../services/cacheService';
import { sessionService } from '../services/sessionService';
import { RedisHelper } from '../utils/redisHelper';

describe('Redis Infrastructure Tests', () => {
  beforeAll(async () => {
    await redisClient.connect();
  });

  afterAll(async () => {
    await redisClient.disconnect();
  });

  beforeEach(async () => {
    await cacheService.flushdb();
  });

  describe('Redis Client Connection', () => {
    test('should connect to Redis successfully', async () => {
      expect(redisClient.isConnected()).toBe(true);
    });

    test('should ping Redis successfully', async () => {
      const latency = await redisClient.ping();
      expect(latency).toBeGreaterThan(0);
      expect(latency).toBeLessThan(1000);
    });

    test('should get health info', async () => {
      const healthInfo = await redisClient.getHealthInfo();
      expect(healthInfo.status).toBe('connected');
      expect(healthInfo.latency).toBeGreaterThan(0);
    });

    test('should handle connection config', () => {
      const config = redisClient.getConfig();
      expect(config).toHaveProperty('host');
      expect(config).toHaveProperty('port');
      expect(config).toHaveProperty('ttlDefault');
      expect(config).toHaveProperty('sessionTtl');
    });
  });

  describe('Cache Service - Basic Operations', () => {
    test('should perform basic cache operations', async () => {
      const key = 'test:basic';
      const value = { message: 'Hello Redis', timestamp: Date.now() };

      const setResult = await cacheService.set(key, value);
      expect(setResult).toBe(true);

      const getValue = await cacheService.get<typeof value>(key);
      expect(getValue).toEqual(value);

      const exists = await cacheService.exists(key);
      expect(exists).toBe(true);

      const deleteResult = await cacheService.del(key);
      expect(deleteResult).toBe(true);

      const getAfterDelete = await cacheService.get(key);
      expect(getAfterDelete).toBeNull();
    });

    test('should handle TTL correctly', async () => {
      const key = 'test:ttl';
      const value = 'test-value';
      const ttl = 2;

      await cacheService.set(key, value, ttl);

      let currentTtl = await cacheService.ttl(key);
      expect(currentTtl).toBeGreaterThan(0);
      expect(currentTtl).toBeLessThanOrEqual(ttl);

      const expireResult = await cacheService.expire(key, 1);
      expect(expireResult).toBe(true);

      currentTtl = await cacheService.ttl(key);
      expect(currentTtl).toBeLessThanOrEqual(1);
    });

    test('should handle hash operations', async () => {
      const key = 'test:hash';
      const field1 = 'field1';
      const field2 = 'field2';
      const value1 = { data: 'value1' };
      const value2 = { data: 'value2' };

      const hset1 = await cacheService.hset(key, field1, value1);
      expect(hset1).toBe(true);

      const hset2 = await cacheService.hset(key, field2, value2);
      expect(hset2).toBe(true);

      const hget1 = await cacheService.hget<typeof value1>(key, field1);
      expect(hget1).toEqual(value1);

      const hgetall = await cacheService.hgetall<any>(key);
      expect(hgetall).toHaveProperty(field1);
      expect(hgetall).toHaveProperty(field2);
      expect(hgetall[field1]).toEqual(value1);
      expect(hgetall[field2]).toEqual(value2);
    });

    test('should handle multiple operations', async () => {
      const keys = ['test:multi1', 'test:multi2', 'test:multi3'];
      const values = [
        { id: 1, name: 'item1' },
        { id: 2, name: 'item2' },
        { id: 3, name: 'item3' },
      ];

      const setOperations = keys.map((key, index) => ({
        key,
        value: values[index],
        ttl: 60,
      }));

      const setResult = await cacheService.multiSet(setOperations);
      expect(setResult).toBe(true);

      const getResults = await cacheService.multiGet<typeof values[0]>(keys);
      expect(getResults).toHaveLength(keys.length);
      getResults.forEach((result, index) => {
        expect(result).toEqual(values[index]);
      });
    });

    test('should handle increment and decrement operations', async () => {
      const key = 'test:counter';

      const inc1 = await cacheService.increment(key);
      expect(inc1).toBe(1);

      const inc2 = await cacheService.increment(key, 5);
      expect(inc2).toBe(6);

      const dec1 = await cacheService.decrement(key, 2);
      expect(dec1).toBe(4);

      const dec2 = await cacheService.decrement(key);
      expect(dec2).toBe(3);
    });

    test('should handle serialization correctly', async () => {
      const complexData = {
        string: 'text',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        object: { nested: { deep: 'value' } },
        date: new Date().toISOString(),
        null: null,
      };

      const key = 'test:complex';
      await cacheService.set(key, complexData);

      const retrieved = await cacheService.get<typeof complexData>(key);
      expect(retrieved).toEqual(complexData);
    });
  });

  describe('Session Service Operations', () => {
    test('should create and retrieve sessions', async () => {
      const userId = 'user123';
      const sessionData = {
        email: 'user@example.com',
        role: 'user',
        metadata: { loginTime: Date.now() },
      };

      const sessionId = await sessionService.createSession(userId, sessionData);
      expect(sessionId).toBeTruthy();
      expect(sessionId).toHaveLength(64); // 32 bytes as hex

      const retrievedSession = await sessionService.getSession(sessionId);
      expect(retrievedSession).toBeTruthy();
      expect(retrievedSession!.userId).toBe(userId);
      expect(retrievedSession!.email).toBe(sessionData.email);
      expect(retrievedSession!.role).toBe(sessionData.role);
      expect(retrievedSession!.createdAt).toBeTruthy();
      expect(retrievedSession!.lastAccessedAt).toBeTruthy();
    });

    test('should update session data', async () => {
      const userId = 'user456';
      const sessionData = { email: 'user@example.com' };

      const sessionId = await sessionService.createSession(userId, sessionData);

      const updateData = {
        role: 'admin',
        metadata: { permissions: ['read', 'write'] },
      };

      const updateResult = await sessionService.updateSession(sessionId, updateData);
      expect(updateResult).toBe(true);

      const updatedSession = await sessionService.getSession(sessionId);
      expect(updatedSession!.role).toBe('admin');
      expect(updatedSession!.metadata).toEqual(updateData.metadata);
    });

    test('should refresh session TTL', async () => {
      const userId = 'user789';
      const sessionData = { email: 'user@example.com' };

      const sessionId = await sessionService.createSession(userId, sessionData);

      const refreshResult = await sessionService.refreshSession(sessionId);
      expect(refreshResult).toBe(true);

      const session = await sessionService.getSession(sessionId);
      expect(session).toBeTruthy();
    });

    test('should delete sessions', async () => {
      const userId = 'user999';
      const sessionData = { email: 'user@example.com' };

      const sessionId = await sessionService.createSession(userId, sessionData);

      const deleteResult = await sessionService.deleteSession(sessionId);
      expect(deleteResult).toBe(true);

      const deletedSession = await sessionService.getSession(sessionId);
      expect(deletedSession).toBeNull();
    });

    test('should handle user sessions', async () => {
      const userId = 'multiuser';
      const sessionIds: string[] = [];

      for (let i = 0; i < 3; i++) {
        const sessionId = await sessionService.createSession(userId, {
          email: `user${i}@example.com`,
        });
        sessionIds.push(sessionId);
      }

      const userSessions = await sessionService.getUserSessions(userId);
      expect(userSessions).toHaveLength(3);
      expect(userSessions.sort()).toEqual(sessionIds.sort());

      const deletedCount = await sessionService.deleteUserSessions(userId);
      expect(deletedCount).toBe(3);

      const remainingSessions = await sessionService.getUserSessions(userId);
      expect(remainingSessions).toHaveLength(0);
    });

    test('should get session statistics', async () => {
      const initialCount = await sessionService.getSessionCount();
      const initialUserCount = await sessionService.getActiveUserCount();

      await sessionService.createSession('user1', { email: 'user1@example.com' });
      await sessionService.createSession('user1', { email: 'user1@example.com' });
      await sessionService.createSession('user2', { email: 'user2@example.com' });

      const finalCount = await sessionService.getSessionCount();
      const finalUserCount = await sessionService.getActiveUserCount();

      expect(finalCount).toBe(initialCount + 3);
      expect(finalUserCount).toBe(initialUserCount + 2);
    });

    test('should handle session expiration cleanup', async () => {
      const userId = 'tempuser';
      const sessionData = { email: 'temp@example.com' };

      const sessionId = await sessionService.createSession(userId, sessionData);

      await sessionService.deleteSession(sessionId);

      const cleanedCount = await sessionService.cleanupExpiredSessions();
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Redis Helper Utilities', () => {
    test('should generate consistent keys', () => {
      const namespace = 'test';
      const identifier = 'item123';

      const key1 = RedisHelper.generateKey(namespace, identifier);
      const key2 = RedisHelper.generateKey(namespace, identifier);

      expect(key1).toBe(key2);
      expect(key1).toBe('test:item123');
    });

    test('should generate specialized keys', () => {
      const cacheKey = RedisHelper.generateCacheKey('users', 123);
      expect(cacheKey).toBe('cache:users:123');

      const sessionKey = RedisHelper.generateSessionKey('session123');
      expect(sessionKey).toBe('session:session123');

      const userKey = RedisHelper.generateUserKey('user123', 'profile');
      expect(userKey).toBe('user:user123:profile');

      const lockKey = RedisHelper.generateLockKey('resource123');
      expect(lockKey).toBe('lock:resource123');
    });

    test('should handle batch operations', async () => {
      const operations = [
        { operation: 'set' as const, key: 'batch:1', value: 'value1' },
        { operation: 'set' as const, key: 'batch:2', value: 'value2' },
        { operation: 'get' as const, key: 'batch:1' },
        { operation: 'get' as const, key: 'batch:2' },
      ];

      const results = await RedisHelper.batchOperations(operations);

      expect(results).toHaveLength(4);
      expect(results[0]).toBe(true); // set result
      expect(results[1]).toBe(true); // set result
      expect(results[2]).toBe('value1'); // get result
      expect(results[3]).toBe('value2'); // get result
    });

    test('should handle backup and fallback operations', async () => {
      const primaryKey = 'primary:key';
      const backupKey = 'backup:key';
      const value = { data: 'important' };

      const setResult = await RedisHelper.setWithBackup(primaryKey, backupKey, value);
      expect(setResult).toBe(true);

      let retrieved = await RedisHelper.getWithFallback(primaryKey, backupKey);
      expect(retrieved).toEqual(value);

      await cacheService.del(primaryKey);

      retrieved = await RedisHelper.getWithFallback(primaryKey, backupKey);
      expect(retrieved).toEqual(value);
    });

    test('should handle distributed locking', async () => {
      const resource = 'shared-resource';

      const lockValue = await RedisHelper.acquireLock(resource, 30);
      expect(lockValue).toBeTruthy();

      const extendResult = await RedisHelper.extendLock(resource, lockValue!, 60);
      expect(extendResult).toBe(true);

      const releaseResult = await RedisHelper.releaseLock(resource, lockValue!);
      expect(releaseResult).toBe(true);

      const releaseTwice = await RedisHelper.releaseLock(resource, lockValue!);
      expect(releaseTwice).toBe(false);
    });

    test('should get key patterns and info', async () => {
      await cacheService.set('pattern:test:1', 'value1');
      await cacheService.set('pattern:test:2', 'value2');
      await cacheService.set('pattern:other:1', 'value3');

      const testKeys = await RedisHelper.getKeysByPattern('pattern:test:*');
      expect(testKeys).toHaveLength(2);
      expect(testKeys).toContain('pattern:test:1');
      expect(testKeys).toContain('pattern:test:2');

      const keyInfo = await RedisHelper.getKeyInfo('pattern:test:1');
      expect(keyInfo).toBeTruthy();
      expect(keyInfo!.type).toBe('string');
      expect(keyInfo!.ttl).toBeGreaterThan(0);
    });

    test('should handle Redis URL parsing', () => {
      const url = 'redis://username:password@localhost:6379/2';
      const parsed = RedisHelper.parseRedisUrl(url);

      expect(parsed.host).toBe('localhost');
      expect(parsed.port).toBe(6379);
      expect(parsed.password).toBe('password');
      expect(parsed.db).toBe(2);
    });
  });

  describe('Performance Tests', () => {
    test('GET operations should complete within 5ms', async () => {
      const key = 'perf:get';
      const value = { test: 'performance' };

      await cacheService.set(key, value);

      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await cacheService.get(key);
        const elapsed = Date.now() - start;
        times.push(elapsed);
      }

      const averageTime = times.reduce((a, b) => a + b) / times.length;
      console.log(`GET performance: ${averageTime.toFixed(2)}ms average`);

      expect(averageTime).toBeLessThan(5);
    });

    test('SET operations should complete within 10ms', async () => {
      const value = { test: 'performance', timestamp: Date.now() };

      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const key = `perf:set:${i}`;
        const start = Date.now();
        await cacheService.set(key, value);
        const elapsed = Date.now() - start;
        times.push(elapsed);
      }

      const averageTime = times.reduce((a, b) => a + b) / times.length;
      console.log(`SET performance: ${averageTime.toFixed(2)}ms average`);

      expect(averageTime).toBeLessThan(10);
    });

    test('should handle concurrent operations', async () => {
      const concurrency = 50;
      const promises: Promise<any>[] = [];

      for (let i = 0; i < concurrency; i++) {
        promises.push(
          cacheService.set(`concurrent:${i}`, { index: i, data: 'test' })
        );
      }

      const start = Date.now();
      const results = await Promise.all(promises);
      const elapsed = Date.now() - start;

      console.log(`Concurrent operations (${concurrency}): ${elapsed}ms`);

      expect(results.every(result => result === true)).toBe(true);
      expect(elapsed).toBeLessThan(1000);
    });

    test('should handle session performance targets', async () => {
      const userId = 'perfuser';
      const sessionData = { email: 'perf@example.com' };

      const createStart = Date.now();
      const sessionId = await sessionService.createSession(userId, sessionData);
      const createTime = Date.now() - createStart;

      const retrieveStart = Date.now();
      await sessionService.getSession(sessionId);
      const retrieveTime = Date.now() - retrieveStart;

      console.log(`Session create: ${createTime}ms, retrieve: ${retrieveTime}ms`);

      expect(createTime).toBeLessThan(10);
      expect(retrieveTime).toBeLessThan(5);
    });
  });

  describe('Error Handling', () => {
    test('should handle non-existent keys gracefully', async () => {
      const result = await cacheService.get('non:existent:key');
      expect(result).toBeNull();

      const exists = await cacheService.exists('non:existent:key');
      expect(exists).toBe(false);

      const ttl = await cacheService.ttl('non:existent:key');
      expect(ttl).toBe(-2);
    });

    test('should handle non-existent sessions gracefully', async () => {
      const fakeSessionId = 'fake-session-id';

      const session = await sessionService.getSession(fakeSessionId);
      expect(session).toBeNull();

      const updateResult = await sessionService.updateSession(fakeSessionId, { role: 'admin' });
      expect(updateResult).toBe(false);

      const deleteResult = await sessionService.deleteSession(fakeSessionId);
      expect(deleteResult).toBe(false);

      const refreshResult = await sessionService.refreshSession(fakeSessionId);
      expect(refreshResult).toBe(false);
    });

    test('should handle invalid JSON gracefully', async () => {
      const client = redisClient.getClient();
      await client.set('invalid:json', 'not-json-data');

      try {
        await cacheService.get('invalid:json');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeTruthy();
      }
    });
  });
});

describe('Redis Integration Tests', () => {
  beforeAll(async () => {
    await redisClient.connect();
  });

  afterAll(async () => {
    await redisClient.disconnect();
  });

  test('should support full workflow integration', async () => {
    await cacheService.flushdb();

    const userId = 'workflow-user';
    const userData = {
      id: userId,
      email: 'workflow@example.com',
      preferences: { theme: 'dark', language: 'en' },
    };

    const userCacheKey = RedisHelper.generateCacheKey('users', userId);
    await cacheService.set(userCacheKey, userData, 3600);

    const sessionId = await sessionService.createSession(userId, {
      email: userData.email,
      role: 'user',
    });

    const cachedUser = await cacheService.get(userCacheKey);
    expect(cachedUser).toEqual(userData);

    const session = await sessionService.getSession(sessionId);
    expect(session?.userId).toBe(userId);
    expect(session?.email).toBe(userData.email);

    const lockValue = await RedisHelper.acquireLock(`user:${userId}`, 30);
    expect(lockValue).toBeTruthy();

    await sessionService.updateSession(sessionId, {
      metadata: { lastActivity: Date.now() },
    });

    await RedisHelper.releaseLock(`user:${userId}`, lockValue!);

    await sessionService.deleteSession(sessionId);
    await cacheService.del(userCacheKey);

    const finalSession = await sessionService.getSession(sessionId);
    expect(finalSession).toBeNull();

    const finalUser = await cacheService.get(userCacheKey);
    expect(finalUser).toBeNull();
  });
});