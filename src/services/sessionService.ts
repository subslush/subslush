import { randomBytes } from 'crypto';
import { cacheService } from './cacheService';
import { redisClient } from '../config/redis';

export interface SessionData {
  userId: string;
  email?: string;
  role?: string;
  createdAt: number;
  lastAccessedAt: number;
  metadata?: Record<string, any>;
}

export interface SessionService {
  createSession(userId: string, sessionData: Omit<SessionData, 'userId' | 'createdAt' | 'lastAccessedAt'>): Promise<string>;
  getSession(sessionId: string): Promise<SessionData | null>;
  updateSession(sessionId: string, data: Partial<Omit<SessionData, 'userId' | 'createdAt'>>): Promise<boolean>;
  deleteSession(sessionId: string): Promise<boolean>;
  refreshSession(sessionId: string): Promise<boolean>;
  cleanupExpiredSessions(): Promise<number>;
  getUserSessions(userId: string): Promise<string[]>;
  deleteUserSessions(userId: string): Promise<number>;
}

class RedisSessionService implements SessionService {
  private readonly SESSION_PREFIX = 'session:';
  private readonly USER_SESSIONS_PREFIX = 'user_sessions:';
  private readonly ACTIVE_SESSIONS_SET = 'active_sessions';

  private generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  private getSessionKey(sessionId: string): string {
    return `${this.SESSION_PREFIX}${sessionId}`;
  }

  private getUserSessionsKey(userId: string): string {
    return `${this.USER_SESSIONS_PREFIX}${userId}`;
  }

  private getSessionTtl(): number {
    return redisClient.getConfig().sessionTtl;
  }

  async createSession(
    userId: string,
    sessionData: Omit<SessionData, 'userId' | 'createdAt' | 'lastAccessedAt'>
  ): Promise<string> {
    try {
      const sessionId = this.generateSessionId();
      const sessionKey = this.getSessionKey(sessionId);
      const userSessionsKey = this.getUserSessionsKey(userId);
      const timestamp = Date.now();

      const fullSessionData: SessionData = {
        ...sessionData,
        userId,
        createdAt: timestamp,
        lastAccessedAt: timestamp,
      };

      const ttl = this.getSessionTtl();

      const client = redisClient.getClient();
      const pipeline = client.pipeline();

      pipeline.setex(sessionKey, ttl, JSON.stringify(fullSessionData));
      pipeline.sadd(this.ACTIVE_SESSIONS_SET, sessionId);
      pipeline.expire(this.ACTIVE_SESSIONS_SET, ttl);
      pipeline.sadd(userSessionsKey, sessionId);
      pipeline.expire(userSessionsKey, ttl);

      const results = await pipeline.exec();
      const success = results && results.every(([err]) => err === null);

      if (!success) {
        throw new Error('Failed to create session');
      }

      return sessionId;
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const sessionData = await cacheService.get<SessionData>(sessionKey);

      if (!sessionData) {
        return null;
      }

      await this.updateLastAccessed(sessionId);
      return sessionData;
    } catch (error) {
      console.error(`Error getting session ${sessionId}:`, error);
      throw error;
    }
  }

  async updateSession(
    sessionId: string,
    data: Partial<Omit<SessionData, 'userId' | 'createdAt'>>
  ): Promise<boolean> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const existingSession = await cacheService.get<SessionData>(sessionKey);

      if (!existingSession) {
        return false;
      }

      const updatedSession: SessionData = {
        ...existingSession,
        ...data,
        lastAccessedAt: Date.now(),
      };

      const ttl = this.getSessionTtl();
      return await cacheService.set(sessionKey, updatedSession, ttl);
    } catch (error) {
      console.error(`Error updating session ${sessionId}:`, error);
      throw error;
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const sessionData = await cacheService.get<SessionData>(sessionKey);

      if (!sessionData) {
        return false;
      }

      const userSessionsKey = this.getUserSessionsKey(sessionData.userId);
      const client = redisClient.getClient();
      const pipeline = client.pipeline();

      pipeline.del(sessionKey);
      pipeline.srem(this.ACTIVE_SESSIONS_SET, sessionId);
      pipeline.srem(userSessionsKey, sessionId);

      const results = await pipeline.exec();
      return results ? results.some(([err, result]) => err === null && result && (result as number) > 0) : false;
    } catch (error) {
      console.error(`Error deleting session ${sessionId}:`, error);
      throw error;
    }
  }

  async refreshSession(sessionId: string): Promise<boolean> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const sessionData = await cacheService.get<SessionData>(sessionKey);

      if (!sessionData) {
        return false;
      }

      const ttl = this.getSessionTtl();
      const updatedSession: SessionData = {
        ...sessionData,
        lastAccessedAt: Date.now(),
      };

      return await cacheService.set(sessionKey, updatedSession, ttl);
    } catch (error) {
      console.error(`Error refreshing session ${sessionId}:`, error);
      throw error;
    }
  }

  async cleanupExpiredSessions(): Promise<number> {
    try {
      const client = redisClient.getClient();
      const activeSessions = await client.smembers(this.ACTIVE_SESSIONS_SET);

      if (activeSessions.length === 0) {
        return 0;
      }

      let cleanedCount = 0;
      const batchSize = 100;

      for (let i = 0; i < activeSessions.length; i += batchSize) {
        const batch = activeSessions.slice(i, i + batchSize);
        const pipeline = client.pipeline();

        for (const sessionId of batch) {
          const sessionKey = this.getSessionKey(sessionId);
          pipeline.exists(sessionKey);
        }

        const results = await pipeline.exec();
        if (!results) continue;

        const expiredSessions: string[] = [];
        batch.forEach((sessionId, index) => {
          const result = results[index];
          if (result) {
            const [err, exists] = result;
            if (err === null && exists === 0) {
              expiredSessions.push(sessionId);
            }
          }
        });

        if (expiredSessions.length > 0) {
          const cleanupPipeline = client.pipeline();
          expiredSessions.forEach(sessionId => {
            cleanupPipeline.srem(this.ACTIVE_SESSIONS_SET, sessionId);
          });

          await cleanupPipeline.exec();
          cleanedCount += expiredSessions.length;
        }
      }

      return cleanedCount;
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      throw error;
    }
  }

  async getUserSessions(userId: string): Promise<string[]> {
    try {
      const userSessionsKey = this.getUserSessionsKey(userId);
      const client = redisClient.getClient();
      const sessions = await client.smembers(userSessionsKey);

      const validSessions: string[] = [];
      if (sessions.length === 0) {
        return validSessions;
      }

      const pipeline = client.pipeline();
      sessions.forEach(sessionId => {
        const sessionKey = this.getSessionKey(sessionId);
        pipeline.exists(sessionKey);
      });

      const results = await pipeline.exec();
      if (!results) return validSessions;

      sessions.forEach((sessionId, index) => {
        const result = results[index];
        if (result) {
          const [err, exists] = result;
          if (err === null && exists === 1) {
            validSessions.push(sessionId);
          }
        }
      });

      return validSessions;
    } catch (error) {
      console.error(`Error getting user sessions for ${userId}:`, error);
      throw error;
    }
  }

  async deleteUserSessions(userId: string): Promise<number> {
    try {
      const sessions = await this.getUserSessions(userId);
      if (sessions.length === 0) {
        return 0;
      }

      const client = redisClient.getClient();
      const pipeline = client.pipeline();
      const userSessionsKey = this.getUserSessionsKey(userId);

      sessions.forEach(sessionId => {
        const sessionKey = this.getSessionKey(sessionId);
        pipeline.del(sessionKey);
        pipeline.srem(this.ACTIVE_SESSIONS_SET, sessionId);
      });

      pipeline.del(userSessionsKey);

      const results = await pipeline.exec();
      const successfulDeletions = results ? results.filter(result => result && result[0] === null && result[1] && (result[1] as number) > 0).length : 0;

      return Math.min(successfulDeletions, sessions.length);
    } catch (error) {
      console.error(`Error deleting user sessions for ${userId}:`, error);
      throw error;
    }
  }

  private async updateLastAccessed(sessionId: string): Promise<void> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const sessionData = await cacheService.get<SessionData>(sessionKey);

      if (sessionData) {
        const updatedSession: SessionData = {
          ...sessionData,
          lastAccessedAt: Date.now(),
        };

        const ttl = this.getSessionTtl();
        await cacheService.set(sessionKey, updatedSession, ttl);
      }
    } catch (error) {
      console.error(`Error updating last accessed for session ${sessionId}:`, error);
    }
  }

  async getSessionCount(): Promise<number> {
    try {
      const client = redisClient.getClient();
      return await client.scard(this.ACTIVE_SESSIONS_SET);
    } catch (error) {
      console.error('Error getting session count:', error);
      throw error;
    }
  }

  async getActiveUserCount(): Promise<number> {
    try {
      const client = redisClient.getClient();
      const sessions = await client.smembers(this.ACTIVE_SESSIONS_SET);

      if (sessions.length === 0) {
        return 0;
      }

      const uniqueUsers = new Set<string>();
      const pipeline = client.pipeline();

      sessions.forEach(sessionId => {
        const sessionKey = this.getSessionKey(sessionId);
        pipeline.get(sessionKey);
      });

      const results = await pipeline.exec();
      if (!results) return 0;

      results.forEach(([err, result]) => {
        if (err === null && result) {
          try {
            const sessionData = JSON.parse(result as string) as SessionData;
            uniqueUsers.add(sessionData.userId);
          } catch (parseError) {
            console.error('Error parsing session data:', parseError);
          }
        }
      });

      return uniqueUsers.size;
    } catch (error) {
      console.error('Error getting active user count:', error);
      throw error;
    }
  }
}

export const sessionService = new RedisSessionService();
export default sessionService;