import { randomBytes } from 'crypto';
import { cacheService } from './cacheService';
import { redisClient } from '../config/redis';
import { encryptionService } from '../utils/encryption';
import { env } from '../config/environment';
import { Logger } from '../utils/logger';
import {
  SessionData,
  SessionCreateOptions,
  SessionValidationResult,
  UserSessionInfo,
} from '../types/session';

export interface SessionService {
  createSession(
    _userId: string,
    _options: SessionCreateOptions
  ): Promise<string>;
  getSession(_sessionId: string): Promise<SessionData | null>;
  updateSession(
    _sessionId: string,
    _data: Partial<Omit<SessionData, 'userId' | 'createdAt'>>
  ): Promise<boolean>;
  deleteSession(_sessionId: string): Promise<boolean>;
  refreshSession(_sessionId: string): Promise<boolean>;
  cleanupExpiredSessions(): Promise<number>;
  getUserSessions(_userId: string): Promise<string[]>;
  getUserSessionsInfo(_userId: string): Promise<UserSessionInfo[]>;
  deleteUserSessions(_userId: string): Promise<number>;
  validateSession(_sessionId: string): Promise<SessionValidationResult>;
  enforceSessionLimit(_userId: string): Promise<void>;
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
    options: SessionCreateOptions
  ): Promise<string> {
    try {
      await this.enforceSessionLimit(userId);

      const sessionId = this.generateSessionId();
      const sessionKey = this.getSessionKey(sessionId);
      const userSessionsKey = this.getUserSessionsKey(userId);
      const timestamp = Date.now();

      const fullSessionData: SessionData = {
        userId,
        ...(options.email && { email: options.email }),
        ...(options.role && { role: options.role }),
        ...(options.ipAddress && { ipAddress: options.ipAddress }),
        ...(options.userAgent && { userAgent: options.userAgent }),
        ...(options.metadata && { metadata: options.metadata }),
        createdAt: timestamp,
        lastAccessedAt: timestamp,
      };

      const encryptedData = encryptionService.encryptObject(fullSessionData);
      const ttl = this.getSessionTtl();

      const client = redisClient.getClient();
      const pipeline = client.pipeline();

      pipeline.setex(sessionKey, ttl, JSON.stringify(encryptedData));
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
      Logger.error('Error creating session:', error);
      throw error;
    }
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const encryptedData = await cacheService.get<any>(sessionKey);

      if (!encryptedData) {
        return null;
      }

      if (!encryptionService.isValidEncryptedData(encryptedData)) {
        Logger.error(`Invalid encrypted session data for session ${sessionId}`);
        await this.deleteSession(sessionId);
        return null;
      }

      const sessionData =
        encryptionService.decryptObject<SessionData>(encryptedData);
      await this.updateLastAccessed(sessionId, sessionData);
      return sessionData;
    } catch (error) {
      Logger.error(`Error getting session ${sessionId}:`, error);
      return null;
    }
  }

  async updateSession(
    sessionId: string,
    data: Partial<Omit<SessionData, 'userId' | 'createdAt'>>
  ): Promise<boolean> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const encryptedData = await cacheService.get<any>(sessionKey);

      if (
        !encryptedData ||
        !encryptionService.isValidEncryptedData(encryptedData)
      ) {
        return false;
      }

      const existingSession =
        encryptionService.decryptObject<SessionData>(encryptedData);
      const updatedSession: SessionData = {
        ...existingSession,
        ...data,
        lastAccessedAt: Date.now(),
      };

      const newEncryptedData = encryptionService.encryptObject(updatedSession);
      const ttl = this.getSessionTtl();
      return await cacheService.set(sessionKey, newEncryptedData, ttl);
    } catch (error) {
      Logger.error(`Error updating session ${sessionId}:`, error);
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
      return results
        ? results.some(
            ([err, result]) => err === null && result && (result as number) > 0
          )
        : false;
    } catch (error) {
      Logger.error(`Error deleting session ${sessionId}:`, error);
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
      Logger.error(`Error refreshing session ${sessionId}:`, error);
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
      Logger.error('Error cleaning up expired sessions:', error);
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
      Logger.error(`Error getting user sessions for ${userId}:`, error);
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
      const successfulDeletions = results
        ? results.filter(
            result =>
              result &&
              result[0] === null &&
              result[1] &&
              (result[1] as number) > 0
          ).length
        : 0;

      return Math.min(successfulDeletions, sessions.length);
    } catch (error) {
      Logger.error(`Error deleting user sessions for ${userId}:`, error);
      throw error;
    }
  }

  async getSessionCount(): Promise<number> {
    try {
      const client = redisClient.getClient();
      return await client.scard(this.ACTIVE_SESSIONS_SET);
    } catch (error) {
      Logger.error('Error getting session count:', error);
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
            const encryptedData = JSON.parse(result as string);
            if (encryptionService.isValidEncryptedData(encryptedData)) {
              const sessionData =
                encryptionService.decryptObject<SessionData>(encryptedData);
              uniqueUsers.add(sessionData.userId);
            }
          } catch (parseError) {
            Logger.error('Error parsing session data:', parseError);
          }
        }
      });

      return uniqueUsers.size;
    } catch (error) {
      Logger.error('Error getting active user count:', error);
      throw error;
    }
  }

  async validateSession(sessionId: string): Promise<SessionValidationResult> {
    try {
      const sessionData = await this.getSession(sessionId);

      if (!sessionData) {
        return {
          isValid: false,
          error: 'Session not found',
        };
      }

      const now = Date.now();
      const lastAccessed = sessionData.lastAccessedAt;
      const sessionAge = now - sessionData.createdAt;
      const timeSinceLastAccess = now - lastAccessed;

      const maxAge = this.getSessionTtl() * 1000;
      const maxInactivity = 30 * 60 * 1000; // 30 minutes

      if (sessionAge > maxAge) {
        await this.deleteSession(sessionId);
        return {
          isValid: false,
          error: 'Session expired',
        };
      }

      if (timeSinceLastAccess > maxInactivity) {
        await this.deleteSession(sessionId);
        return {
          isValid: false,
          error: 'Session inactive too long',
        };
      }

      return {
        isValid: true,
        session: sessionData,
        sessionId,
      };
    } catch (error) {
      Logger.error(`Error validating session ${sessionId}:`, error);
      return {
        isValid: false,
        error: 'Session validation failed',
      };
    }
  }

  async getUserSessionsInfo(userId: string): Promise<UserSessionInfo[]> {
    try {
      const sessionIds = await this.getUserSessions(userId);
      const sessionInfos: UserSessionInfo[] = [];

      if (sessionIds.length === 0) {
        return sessionInfos;
      }

      const client = redisClient.getClient();
      const pipeline = client.pipeline();

      sessionIds.forEach(sessionId => {
        const sessionKey = this.getSessionKey(sessionId);
        pipeline.get(sessionKey);
      });

      const results = await pipeline.exec();
      if (!results) return sessionInfos;

      sessionIds.forEach((sessionId, index) => {
        const result = results[index];
        if (result && result[0] === null && result[1]) {
          try {
            const encryptedData = JSON.parse(result[1] as string);
            if (encryptionService.isValidEncryptedData(encryptedData)) {
              const sessionData =
                encryptionService.decryptObject<SessionData>(encryptedData);
              sessionInfos.push({
                sessionId,
                createdAt: sessionData.createdAt,
                lastAccessedAt: sessionData.lastAccessedAt,
                ipAddress: sessionData.ipAddress || undefined,
                userAgent: sessionData.userAgent || undefined,
              });
            }
          } catch (parseError) {
            Logger.error(
              `Error parsing session data for ${sessionId}:`,
              parseError
            );
          }
        }
      });

      return sessionInfos.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
    } catch (error) {
      Logger.error(`Error getting user sessions info for ${userId}:`, error);
      throw error;
    }
  }

  async enforceSessionLimit(userId: string): Promise<void> {
    try {
      const maxSessions = env.MAX_SESSIONS_PER_USER;
      const sessionIds = await this.getUserSessions(userId);

      if (sessionIds.length < maxSessions) {
        return;
      }

      const sessionInfos = await this.getUserSessionsInfo(userId);
      sessionInfos.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

      const sessionsToDelete = sessionInfos.slice(
        0,
        sessionInfos.length - maxSessions + 1
      );

      for (const sessionInfo of sessionsToDelete) {
        await this.deleteSession(sessionInfo.sessionId);
      }
    } catch (error) {
      Logger.error(`Error enforcing session limit for user ${userId}:`, error);
      throw error;
    }
  }

  private async updateLastAccessed(
    sessionId: string,
    sessionData?: SessionData
  ): Promise<void> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      let resolvedSession = sessionData;

      if (!resolvedSession) {
        const encryptedData = await cacheService.get<any>(sessionKey);
        if (
          encryptedData &&
          encryptionService.isValidEncryptedData(encryptedData)
        ) {
          resolvedSession =
            encryptionService.decryptObject<SessionData>(encryptedData);
        }
      }

      if (!resolvedSession) {
        return;
      }

      const updatedSession: SessionData = {
        ...resolvedSession,
        lastAccessedAt: Date.now(),
      };

      const newEncryptedData = encryptionService.encryptObject(updatedSession);
      const ttl = this.getSessionTtl();
      await cacheService.set(sessionKey, newEncryptedData, ttl);
    } catch (error) {
      Logger.error(
        `Error updating last accessed for session ${sessionId}:`,
        error
      );
    }
  }
}

export const sessionService = new RedisSessionService();
export default sessionService;
