import { createClient, SupabaseClient, AuthError } from '@supabase/supabase-js';
import { env } from '../config/environment';
import { sessionService } from './sessionService';
import { jwtService } from './jwtService';
import { SessionCreateOptions } from '../types/session';
import { JWTTokens } from '../types/jwt';
import { Logger } from '../utils/logger';
import { getDatabasePool } from '../config/database';

export interface User {
  id: string;
  email: string;
  role?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  createdAt: string;
  lastLoginAt?: string | undefined;
}

export interface AuthResult {
  success: boolean;
  user?: User | undefined;
  tokens?: JWTTokens | undefined;
  sessionId?: string | undefined;
  error?: string | undefined;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
}

export interface LoginData {
  email: string;
  password: string;
  rememberMe?: boolean | undefined;
}

class AuthService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  }

  private get pool(): any {
    return getDatabasePool();
  }

  async register(
    data: RegisterData,
    sessionOptions: SessionCreateOptions
  ): Promise<AuthResult> {
    try {
      const { email, password, firstName, lastName } = data;

      const { data: authData, error: authError } =
        await this.supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
            },
          },
        });

      if (authError) {
        return {
          success: false,
          error: this.mapSupabaseError(authError),
        };
      }

      if (!authData.user) {
        return {
          success: false,
          error: 'User registration failed',
        };
      }

      // Create corresponding user record in PostgreSQL with first/last names
      try {
        await this.pool.query(
          'INSERT INTO users (id, email, first_name, last_name, created_at, status) VALUES ($1, $2, $3, $4, $5, $6)',
          [
            authData.user.id,
            authData.user.email,
            firstName || null,
            lastName || null,
            new Date(authData.user.created_at),
            'active',
          ]
        );
        Logger.info(
          `PostgreSQL user record created for: ${authData.user.email}`
        );
      } catch (dbError) {
        Logger.error('Failed to create PostgreSQL user record:', dbError);
        // Clean up Supabase user on PostgreSQL failure
        try {
          await this.supabase.auth.admin.deleteUser(authData.user.id);
        } catch (cleanupError) {
          Logger.error(
            'Failed to cleanup Supabase user after PostgreSQL failure:',
            cleanupError
          );
        }
        return {
          success: false,
          error: 'User registration incomplete - database error',
        };
      }

      const user: User = {
        id: authData.user.id,
        email: authData.user.email!,
        role: 'user',
        firstName: firstName,
        lastName: lastName,
        createdAt: authData.user.created_at,
      };

      const sessionId = await sessionService.createSession(user.id, {
        email: user.email,
        role: user.role || undefined,
        ...sessionOptions,
      });

      const tokens = jwtService.generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role || undefined,
        sessionId,
      });

      return {
        success: true,
        user,
        tokens,
        sessionId,
      };
    } catch (error) {
      Logger.error('Registration error:', error);
      return {
        success: false,
        error: 'Registration failed due to server error',
      };
    }
  }

  async login(
    data: LoginData,
    sessionOptions: SessionCreateOptions
  ): Promise<AuthResult> {
    try {
      const { email, password } = data;

      const { data: authData, error: authError } =
        await this.supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (authError) {
        return {
          success: false,
          error: this.mapSupabaseError(authError),
        };
      }

      if (!authData.user) {
        return {
          success: false,
          error: 'Login failed',
        };
      }

      // Fetch user data from PostgreSQL
      let pgUser = null;
      try {
        const result = await this.pool.query(
          'SELECT first_name, last_name, role FROM users WHERE id = $1',
          [authData.user.id]
        );
        pgUser = result.rows[0];
      } catch (error) {
        Logger.warn('Failed to fetch user data from PostgreSQL:', error);
      }

      const user: User = {
        id: authData.user.id,
        email: authData.user.email!,
        role: pgUser?.role || 'user',
        firstName: pgUser?.first_name,
        lastName: pgUser?.last_name,
        createdAt: authData.user.created_at,
        lastLoginAt: new Date().toISOString(),
      };

      Logger.info('🔐 [AUTH] User logged in:', {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      });

      // Update last_login timestamp in database
      try {
        await this.updateLastLogin(user.id);
      } catch (error) {
        Logger.warn('Failed to update last login timestamp:', error);
      }

      const sessionId = await sessionService.createSession(user.id, {
        email: user.email,
        role: user.role || undefined,
        ...sessionOptions,
      });

      const tokens = jwtService.generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role || undefined,
        sessionId,
      });

      return {
        success: true,
        user,
        tokens,
        sessionId,
      };
    } catch (error) {
      Logger.error('Login error:', error);
      return {
        success: false,
        error: 'Login failed due to server error',
      };
    }
  }

  async logout(
    sessionId: string,
    allDevices = false
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (allDevices) {
        const session = await sessionService.getSession(sessionId);
        if (session) {
          const deletedCount = await sessionService.deleteUserSessions(
            session.userId
          );
          Logger.info(`Logged out from ${deletedCount} sessions`);
        }
      } else {
        await sessionService.deleteSession(sessionId);
      }

      await this.supabase.auth.signOut();

      return { success: true };
    } catch (error) {
      Logger.error('Logout error:', error);
      return {
        success: false,
        error: 'Logout failed',
      };
    }
  }

  async refreshSession(sessionId: string): Promise<AuthResult> {
    try {
      const session = await sessionService.getSession(sessionId);

      if (!session) {
        return {
          success: false,
          error: 'Session not found',
        };
      }

      await sessionService.refreshSession(sessionId);

      // Fetch user data from PostgreSQL
      let pgUser = null;
      try {
        const result = await this.pool.query(
          'SELECT first_name, last_name, role FROM users WHERE id = $1',
          [session.userId]
        );
        pgUser = result.rows[0];
      } catch (error) {
        Logger.warn(
          'Failed to fetch user data from PostgreSQL during refresh:',
          error
        );
      }

      const user: User = {
        id: session.userId,
        email: session.email!,
        role: session.role || pgUser?.role || undefined,
        firstName: pgUser?.first_name,
        lastName: pgUser?.last_name,
        createdAt: new Date().toISOString(),
        lastLoginAt: session.lastAccessedAt,
      };

      // Log the final user object to verify
      Logger.info('🔄 [AUTH SERVICE] Refresh user object:', {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        hasFirstName: !!user.firstName,
        hasLastName: !!user.lastName,
      });

      const tokens = jwtService.generateTokens({
        userId: session.userId,
        email: session.email!,
        role: session.role,
        sessionId,
      });

      return {
        success: true,
        user,
        tokens,
        sessionId,
      };
    } catch (error) {
      Logger.error('Session refresh error:', error);
      return {
        success: false,
        error: 'Session refresh failed',
      };
    }
  }

  async validateSession(sessionId: string): Promise<AuthResult> {
    try {
      const validation = await sessionService.validateSession(sessionId);

      if (!validation.isValid || !validation.session) {
        return {
          success: false,
          error: validation.error || 'Session invalid',
        };
      }

      const { session } = validation;

      // Fetch user data from PostgreSQL
      let pgUser = null;
      try {
        const result = await this.pool.query(
          'SELECT first_name, last_name, role FROM users WHERE id = $1',
          [session.userId]
        );
        pgUser = result.rows[0];
      } catch (error) {
        Logger.warn(
          'Failed to fetch user data from PostgreSQL during validation:',
          error
        );
      }

      const user: User = {
        id: session.userId,
        email: session.email!,
        role: session.role || pgUser?.role || undefined,
        firstName: pgUser?.first_name,
        lastName: pgUser?.last_name,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date(session.lastAccessedAt).toISOString(),
      };

      // Log the final user object to verify
      Logger.info('✅ [AUTH SERVICE] Validate user object:', {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        hasFirstName: !!user.firstName,
        hasLastName: !!user.lastName,
      });

      return {
        success: true,
        user,
        sessionId,
      };
    } catch (error) {
      Logger.error('Session validation error:', error);
      return {
        success: false,
        error: 'Session validation failed',
      };
    }
  }

  async getUserSessions(userId: string): Promise<any> {
    try {
      return await sessionService.getUserSessionsInfo(userId);
    } catch (error) {
      Logger.error('Get user sessions error:', error);
      throw error;
    }
  }

  async revokeSession(
    sessionId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const deleted = await sessionService.deleteSession(sessionId);

      if (!deleted) {
        return {
          success: false,
          error: 'Session not found',
        };
      }

      return { success: true };
    } catch (error) {
      Logger.error('Revoke session error:', error);
      return {
        success: false,
        error: 'Failed to revoke session',
      };
    }
  }

  async changePassword(
    userId: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        return {
          success: false,
          error: this.mapSupabaseError(error),
        };
      }

      await sessionService.deleteUserSessions(userId);

      return { success: true };
    } catch (error) {
      Logger.error('Change password error:', error);
      return {
        success: false,
        error: 'Password change failed',
      };
    }
  }

  async requestPasswordReset(
    email: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email);

      if (error) {
        return {
          success: false,
          error: this.mapSupabaseError(error),
        };
      }

      return { success: true };
    } catch (error) {
      Logger.error('Password reset request error:', error);
      return {
        success: false,
        error: 'Password reset request failed',
      };
    }
  }

  private mapSupabaseError(error: AuthError): string {
    switch (error.message) {
      case 'Invalid login credentials':
        return 'Invalid email or password';
      case 'Email not confirmed':
        return 'Please confirm your email address';
      case 'User already registered':
        return 'An account with this email already exists';
      case 'Password should be at least 6 characters':
        return 'Password must be at least 6 characters long';
      case 'Signup is disabled':
        return 'New registrations are currently disabled';
      case 'Email rate limit exceeded':
        return 'Too many email requests. Please try again later';
      default:
        return error.message || 'Authentication error occurred';
    }
  }

  async updateLastLogin(userId: string): Promise<boolean> {
    try {
      await this.pool.query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [userId]
      );
      return true;
    } catch (error) {
      Logger.error('Update last login error:', error);
      return false;
    }
  }

  async cleanup(): Promise<void> {
    try {
      const cleanedCount = await sessionService.cleanupExpiredSessions();
      Logger.info(`Cleaned up ${cleanedCount} expired sessions`);
    } catch (error) {
      Logger.error('Auth cleanup error:', error);
    }
  }
}

export const authService = new AuthService();
export default authService;
