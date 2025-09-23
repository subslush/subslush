import jwt from 'jsonwebtoken';
import { env } from '../config/environment';
import { Logger } from '../utils/logger';
import {
  JWTPayload,
  JWTTokens,
  TokenValidationResult,
  RefreshTokenResult,
  JWTServiceConfig,
} from '../types/jwt';

class JWTService {
  private config: JWTServiceConfig;

  constructor() {
    this.config = {
      secret: env.JWT_SECRET,
      algorithm: env.JWT_ALGORITHM,
      expiresIn: env.JWT_EXPIRY as number,
      refreshExpiresIn: env.JWT_EXPIRY * 7,
      issuer: 'subscription-platform',
      audience: 'subscription-platform-users',
    };
  }

  generateTokens(payload: Omit<JWTPayload, 'iat' | 'exp'>): JWTTokens {
    try {
      const jwtPayload: JWTPayload = {
        ...payload,
      };

      const accessToken = jwt.sign(jwtPayload, this.config.secret, {
        algorithm: this.config.algorithm as jwt.Algorithm,
        expiresIn: this.config.expiresIn as number,
        issuer: this.config.issuer,
        audience: this.config.audience,
      });

      return {
        accessToken,
      };
    } catch (error) {
      Logger.error('Error generating JWT tokens:', error);
      throw new Error('Failed to generate JWT tokens');
    }
  }

  verifyToken(token: string): TokenValidationResult {
    try {
      const decoded = jwt.verify(token, this.config.secret, {
        algorithms: [this.config.algorithm as jwt.Algorithm],
        issuer: this.config.issuer,
        audience: this.config.audience,
      }) as JWTPayload;

      const now = Math.floor(Date.now() / 1000);
      const exp = decoded.exp || 0;
      const timeUntilExpiry = exp - now;
      const needsRefresh = timeUntilExpiry > 0 && timeUntilExpiry < 3600;

      return {
        isValid: true,
        payload: decoded,
        needsRefresh,
      };
    } catch (error) {
      let errorMessage = 'Invalid token';
      let needsRefresh = false;

      if (error instanceof jwt.TokenExpiredError) {
        errorMessage = 'Token has expired';
        needsRefresh = true;
      } else if (error instanceof jwt.JsonWebTokenError) {
        errorMessage = 'Invalid token format';
      } else if (error instanceof jwt.NotBeforeError) {
        errorMessage = 'Token not yet valid';
      }

      return {
        isValid: false,
        error: errorMessage,
        needsRefresh,
      };
    }
  }

  refreshToken(oldToken: string, newSessionId?: string): RefreshTokenResult {
    try {
      const decoded = jwt.decode(oldToken) as JWTPayload;

      if (!decoded || !decoded.userId || !decoded.email) {
        return {
          success: false,
          error: 'Invalid token payload',
        };
      }

      const newPayload: Omit<JWTPayload, 'iat' | 'exp'> = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role || undefined,
        sessionId: newSessionId || decoded.sessionId,
      };

      const tokens = this.generateTokens(newPayload);

      return {
        success: true,
        tokens,
      };
    } catch (error) {
      Logger.error('Error refreshing token:', error);
      return {
        success: false,
        error: 'Failed to refresh token',
      };
    }
  }

  decodeToken(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch (error) {
      Logger.error('Error decoding token:', error);
      return null;
    }
  }

  getTokenExpiry(token: string): number | null {
    try {
      const decoded = this.decodeToken(token);
      return decoded?.exp || null;
    } catch (error) {
      Logger.error('Error getting token expiry:', error);
      return null;
    }
  }

  isTokenExpired(token: string): boolean {
    try {
      const expiry = this.getTokenExpiry(token);
      if (!expiry) return true;

      const now = Math.floor(Date.now() / 1000);
      return expiry < now;
    } catch (error) {
      Logger.error('Error checking token expiry:', error);
      return true;
    }
  }

  getTimeUntilExpiry(token: string): number {
    try {
      const expiry = this.getTokenExpiry(token);
      if (!expiry) return 0;

      const now = Math.floor(Date.now() / 1000);
      return Math.max(0, expiry - now);
    } catch (error) {
      Logger.error('Error calculating time until expiry:', error);
      return 0;
    }
  }

  extractBearerToken(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  createAuthHeader(token: string): string {
    return `Bearer ${token}`;
  }
}

export const jwtService = new JWTService();
export default jwtService;
