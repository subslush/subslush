import { createClient, SupabaseClient, AuthError } from '@supabase/supabase-js';
import { env } from '../config/environment';
import { sessionService } from './sessionService';
import { jwtService } from './jwtService';
import { SessionCreateOptions } from '../types/session';
import { JWTTokens } from '../types/jwt';

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

  async register(data: RegisterData, sessionOptions: SessionCreateOptions): Promise<AuthResult> {
    try {
      const { email, password, firstName, lastName } = data;

      const { data: authData, error: authError } = await this.supabase.auth.signUp({
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

      const user: User = {
        id: authData.user.id,
        email: authData.user.email!,
        role: 'user',
        firstName: authData.user.user_metadata?.['first_name'],
        lastName: authData.user.user_metadata?.['last_name'],
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
      console.error('Registration error:', error);
      return {
        success: false,
        error: 'Registration failed due to server error',
      };
    }
  }

  async login(data: LoginData, sessionOptions: SessionCreateOptions): Promise<AuthResult> {
    try {
      const { email, password } = data;

      const { data: authData, error: authError } = await this.supabase.auth.signInWithPassword({
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

      const user: User = {
        id: authData.user.id,
        email: authData.user.email!,
        role: authData.user.user_metadata?.['role'] || 'user',
        firstName: authData.user.user_metadata?.['first_name'],
        lastName: authData.user.user_metadata?.['last_name'],
        createdAt: authData.user.created_at,
        lastLoginAt: new Date().toISOString(),
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
      console.error('Login error:', error);
      return {
        success: false,
        error: 'Login failed due to server error',
      };
    }
  }

  async logout(sessionId: string, allDevices = false): Promise<{ success: boolean; error?: string }> {
    try {
      if (allDevices) {
        const session = await sessionService.getSession(sessionId);
        if (session) {
          const deletedCount = await sessionService.deleteUserSessions(session.userId);
          console.log(`Logged out from ${deletedCount} sessions`);
        }
      } else {
        await sessionService.deleteSession(sessionId);
      }

      await this.supabase.auth.signOut();

      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
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

      const user: User = {
        id: session.userId,
        email: session.email!,
        role: session.role || undefined,
        createdAt: new Date().toISOString(),
      };

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
      console.error('Session refresh error:', error);
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
      const user: User = {
        id: session.userId,
        email: session.email!,
        role: session.role || undefined,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date(session.lastAccessedAt).toISOString(),
      };

      return {
        success: true,
        user,
        sessionId,
      };
    } catch (error) {
      console.error('Session validation error:', error);
      return {
        success: false,
        error: 'Session validation failed',
      };
    }
  }

  async getUserSessions(userId: string) {
    try {
      return await sessionService.getUserSessionsInfo(userId);
    } catch (error) {
      console.error('Get user sessions error:', error);
      throw error;
    }
  }

  async revokeSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
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
      console.error('Revoke session error:', error);
      return {
        success: false,
        error: 'Failed to revoke session',
      };
    }
  }

  async changePassword(userId: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
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
      console.error('Change password error:', error);
      return {
        success: false,
        error: 'Password change failed',
      };
    }
  }

  async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
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
      console.error('Password reset request error:', error);
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

  async cleanup(): Promise<void> {
    try {
      const cleanedCount = await sessionService.cleanupExpiredSessions();
      console.log(`Cleaned up ${cleanedCount} expired sessions`);
    } catch (error) {
      console.error('Auth cleanup error:', error);
    }
  }
}

export const authService = new AuthService();
export default authService;
