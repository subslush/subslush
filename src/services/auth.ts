import { createClient, SupabaseClient, AuthError } from '@supabase/supabase-js';
import { env } from '../config/environment';
import { sessionService } from './sessionService';
import { jwtService } from './jwtService';
import { SessionCreateOptions } from '../types/session';
import { JWTTokens } from '../types/jwt';
import { Logger } from '../utils/logger';
import { getDatabasePool } from '../config/database';
import { emailService } from './emailService';

const resolveAppBaseUrl = (): string | null => {
  const base = env.APP_BASE_URL?.replace(/\/$/, '');
  if (base) return base;
  if (env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }
  return null;
};

const resolveEmailRedirectUrl = (): string | null => {
  const base = resolveAppBaseUrl();
  if (!base) return null;
  return `${base}/auth/confirm`;
};

export interface User {
  id: string;
  email: string;
  role?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  displayName?: string | undefined;
  pinSetAt?: string | null | undefined;
  createdAt: string;
  lastLoginAt?: string | undefined;
}

export interface AuthResult {
  success: boolean;
  user?: User | undefined;
  tokens?: JWTTokens | undefined;
  sessionId?: string | undefined;
  error?: string | undefined;
  requiresEmailVerification?: boolean | undefined;
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
  private supabaseAdmin: SupabaseClient;

  constructor() {
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    this.supabaseAdmin = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );
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

      const emailRedirectTo = resolveEmailRedirectUrl();
      const profileData: { first_name?: string; last_name?: string } = {};
      if (firstName) {
        profileData.first_name = firstName;
      }
      if (lastName) {
        profileData.last_name = lastName;
      }

      const signUpOptions: {
        data: { first_name?: string; last_name?: string };
        emailRedirectTo?: string;
      } = {
        data: profileData,
      };
      if (emailRedirectTo) {
        signUpOptions.emailRedirectTo = emailRedirectTo;
      }

      const { data: authData, error: authError } =
        await this.supabase.auth.signUp({
          email,
          password,
          options: signUpOptions,
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

      const emailConfirmedAt =
        (authData.user as { email_confirmed_at?: string | null })
          .email_confirmed_at ||
        (authData.user as { confirmed_at?: string | null }).confirmed_at ||
        null;
      const hasSupabaseSession = Boolean(authData.session);
      const requiresEmailVerification =
        !hasSupabaseSession && !emailConfirmedAt;

      // Create corresponding user record in PostgreSQL with first/last names
      try {
        await this.pool.query(
          'INSERT INTO users (id, email, first_name, last_name, created_at, status, email_verified_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [
            authData.user.id,
            authData.user.email,
            firstName || null,
            lastName || null,
            new Date(authData.user.created_at),
            'active',
            null,
          ]
        );
        Logger.info(
          `PostgreSQL user record created for: ${authData.user.email}`
        );
      } catch (dbError) {
        Logger.error('Failed to create PostgreSQL user record:', dbError);
        // Clean up Supabase user on PostgreSQL failure
        try {
          await this.supabaseAdmin.auth.admin.deleteUser(authData.user.id);
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

      if (requiresEmailVerification) {
        return {
          success: true,
          user,
          requiresEmailVerification: true,
        };
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
      Logger.error('Registration error:', error);
      return {
        success: false,
        error: 'Registration failed due to server error',
      };
    }
  }

  async confirmEmail(
    params: {
      accessToken: string;
      refreshToken?: string | null;
    },
    sessionOptions: SessionCreateOptions
  ): Promise<AuthResult> {
    try {
      const accessToken = params.accessToken?.trim();
      if (!accessToken) {
        return {
          success: false,
          error: 'Confirmation token is required',
        };
      }

      const { data, error } = await this.supabase.auth.getUser(accessToken);
      if (error || !data.user) {
        return {
          success: false,
          error: 'Confirmation link is invalid or expired',
        };
      }

      const supabaseUser = data.user;
      const userId = supabaseUser.id;
      const userEmail = supabaseUser.email;
      if (!userEmail) {
        return {
          success: false,
          error: 'User email not found',
        };
      }

      let pgUser: {
        first_name?: string | null;
        last_name?: string | null;
        status?: string | null;
        pin_set_at?: string | null;
      } | null = null;
      let accountStatus: string | null = null;
      try {
        const result = await this.pool.query(
          'SELECT first_name, last_name, status, pin_set_at FROM users WHERE id = $1',
          [userId]
        );
        if (result.rows.length > 0) {
          pgUser = result.rows[0];
          accountStatus = result.rows[0]?.status || null;
        }
      } catch (dbError) {
        Logger.warn('Failed to load user during email confirmation:', dbError);
      }

      if (!accountStatus) {
        const metadataFirstName =
          supabaseUser.user_metadata?.['first_name'] || null;
        const metadataLastName =
          supabaseUser.user_metadata?.['last_name'] || null;
        try {
          const result = await this.pool.query(
            `INSERT INTO users (id, email, first_name, last_name, created_at, status, email_verified_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (id) DO UPDATE
               SET email = EXCLUDED.email
             RETURNING first_name, last_name, status, pin_set_at`,
            [
              userId,
              userEmail,
              metadataFirstName,
              metadataLastName,
              new Date(supabaseUser.created_at),
              'active',
            ]
          );
          pgUser = result.rows[0];
          accountStatus = result.rows[0]?.status || null;
        } catch (dbError) {
          Logger.error(
            'Failed to upsert user during email confirmation:',
            dbError
          );
          return {
            success: false,
            error: 'Email confirmation failed',
          };
        }
      }

      if (accountStatus && accountStatus !== 'active') {
        return {
          success: false,
          error: this.mapAccountStatus(accountStatus),
        };
      }

      try {
        await this.pool.query(
          'UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1',
          [userId]
        );
      } catch (error) {
        Logger.warn('Failed to update email verification timestamp', {
          userId,
          error,
        });
      }

      const role = supabaseUser.user_metadata?.['role'] || 'user';
      const sessionId = await sessionService.createSession(userId, {
        email: userEmail,
        role: role,
        ...sessionOptions,
      });

      const tokens = jwtService.generateTokens({
        userId,
        email: userEmail,
        role: role,
        sessionId,
      });

      const user: User = {
        id: userId,
        email: userEmail,
        role: role,
        firstName: pgUser?.first_name || undefined,
        lastName: pgUser?.last_name || undefined,
        pinSetAt: pgUser?.pin_set_at || null,
        createdAt: supabaseUser.created_at,
        lastLoginAt: new Date().toISOString(),
      };

      try {
        await this.updateLastLogin(userId);
      } catch (error) {
        Logger.warn('Failed to update last login after confirmation', error);
      }

      return {
        success: true,
        user,
        tokens,
        sessionId,
      };
    } catch (error) {
      Logger.error('Email confirmation error:', error);
      return {
        success: false,
        error: 'Email confirmation failed',
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

      // Fetch (or backfill) user data in PostgreSQL
      let pgUser = null;
      let accountStatus: string | null = null;
      try {
        const metadataFirstName = authData.user.user_metadata?.['first_name'];
        const metadataLastName = authData.user.user_metadata?.['last_name'];
        const createdAt = authData.user.created_at
          ? new Date(authData.user.created_at)
          : new Date();

        const result = await this.pool.query(
          `INSERT INTO users (id, email, first_name, last_name, created_at, status)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE
             SET email = EXCLUDED.email,
                 first_name = COALESCE(users.first_name, EXCLUDED.first_name),
                 last_name = COALESCE(users.last_name, EXCLUDED.last_name)
           RETURNING first_name, last_name, status, pin_set_at`,
          [
            authData.user.id,
            authData.user.email,
            metadataFirstName || null,
            metadataLastName || null,
            createdAt,
            'active',
          ]
        );
        pgUser = result.rows[0];
        accountStatus = result.rows[0]?.status || null;
      } catch (error) {
        Logger.warn('Failed to fetch user data from PostgreSQL:', error);
      }

      if (!accountStatus) {
        try {
          const statusResult = await this.pool.query(
            'SELECT status FROM users WHERE id = $1',
            [authData.user.id]
          );
          accountStatus = statusResult.rows[0]?.status || null;
        } catch (error) {
          Logger.error('Failed to verify account status during login:', error);
          return {
            success: false,
            error: 'Login failed due to server error',
          };
        }
      }

      if (!accountStatus) {
        return {
          success: false,
          error: 'Account status could not be verified',
        };
      }

      if (accountStatus !== 'active') {
        return {
          success: false,
          error: this.mapAccountStatus(accountStatus),
        };
      }

      // Get role from Supabase Auth metadata (where it's actually stored)
      const role = authData.user.user_metadata?.['role'] || 'user';

      const user: User = {
        id: authData.user.id,
        email: authData.user.email!,
        role: role,
        firstName: pgUser?.first_name,
        lastName: pgUser?.last_name,
        pinSetAt: pgUser?.pin_set_at || null,
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

      // Fetch user data from PostgreSQL (names and status only)
      let pgUser = null;
      let accountStatus: string | null = null;
      try {
        const result = await this.pool.query(
          'SELECT first_name, last_name, status, pin_set_at FROM users WHERE id = $1',
          [session.userId]
        );
        pgUser = result.rows[0];
        accountStatus = result.rows[0]?.status || null;
      } catch (error) {
        Logger.warn(
          'Failed to fetch user data from PostgreSQL during refresh:',
          error
        );
      }

      if (!accountStatus) {
        return {
          success: false,
          error: 'Account status could not be verified',
        };
      }

      if (accountStatus !== 'active') {
        await sessionService.deleteSession(sessionId);
        return {
          success: false,
          error: this.mapAccountStatus(accountStatus),
        };
      }

      const user: User = {
        id: session.userId,
        email: session.email!,
        role: session.role || 'user',
        firstName: pgUser?.first_name,
        lastName: pgUser?.last_name,
        pinSetAt: pgUser?.pin_set_at || null,
        createdAt: new Date().toISOString(),
        lastLoginAt: session.lastAccessedAt
          ? new Date(session.lastAccessedAt).toISOString()
          : new Date().toISOString(),
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

      // Fetch user data from PostgreSQL (names and status only)
      let pgUser = null;
      let accountStatus: string | null = null;
      try {
        const result = await this.pool.query(
          'SELECT first_name, last_name, status, pin_set_at FROM users WHERE id = $1',
          [session.userId]
        );
        pgUser = result.rows[0];
        accountStatus = result.rows[0]?.status || null;
      } catch (error) {
        Logger.warn(
          'Failed to fetch user data from PostgreSQL during validation:',
          error
        );
      }

      if (!accountStatus) {
        return {
          success: false,
          error: 'Account status could not be verified',
        };
      }

      if (accountStatus !== 'active') {
        await sessionService.deleteSession(sessionId);
        return {
          success: false,
          error: this.mapAccountStatus(accountStatus),
        };
      }

      const user: User = {
        id: session.userId,
        email: session.email!,
        role: session.role || 'user',
        firstName: pgUser?.first_name,
        lastName: pgUser?.last_name,
        pinSetAt: pgUser?.pin_set_at || null,
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
      const normalizedEmail = email.trim().toLowerCase();
      let accountStatus: string | null = null;
      let userId: string | null = null;
      let emailVerifiedAt: Date | string | null = null;

      try {
        const result = await this.pool.query(
          'SELECT id, status, email_verified_at FROM users WHERE LOWER(email) = $1',
          [normalizedEmail]
        );
        if (result.rows.length > 0) {
          userId = result.rows[0]?.id || null;
          accountStatus = result.rows[0]?.status || null;
          emailVerifiedAt = result.rows[0]?.email_verified_at || null;
        }
      } catch (error) {
        Logger.error('Failed to lookup user during password reset:', error);
        return {
          success: false,
          error: 'Password reset request failed',
        };
      }

      if (accountStatus && accountStatus !== 'active') {
        return {
          success: false,
          error: this.mapAccountStatus(accountStatus),
        };
      }

      if (userId && !emailVerifiedAt) {
        return {
          success: false,
          error: 'Please verify your email before requesting a password reset',
        };
      }

      if (!userId) {
        return { success: true };
      }

      const redirectTo = env.PASSWORD_RESET_REDIRECT_URL;
      const { data, error } = await this.supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: normalizedEmail,
        ...(redirectTo ? { options: { redirectTo } } : {}),
      });

      if (error) {
        Logger.error('Password reset request failed:', error);
        return {
          success: false,
          error: this.mapSupabaseError(error),
        };
      }

      const resetLink = data?.properties?.action_link;
      if (!resetLink) {
        Logger.error('Password reset request failed: missing reset link');
        return {
          success: false,
          error: 'Password reset request failed',
        };
      }

      const sendResult = await emailService.sendPasswordResetEmail({
        to: normalizedEmail,
        resetLink,
      });

      if (!sendResult.success) {
        return {
          success: false,
          error: sendResult.error || 'Failed to send password reset email',
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

  private mapAccountStatus(status: string): string {
    switch (status) {
      case 'suspended':
        return 'Account is suspended. Please contact support.';
      case 'inactive':
        return 'Account is inactive. Please contact support.';
      case 'deleted':
        return 'Account is deleted. Please contact support.';
      default:
        return 'Account is not active. Please contact support.';
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
